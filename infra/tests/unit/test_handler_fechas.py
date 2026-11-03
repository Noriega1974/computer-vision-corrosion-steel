"""Pruebas de validación de timestamp_medicion en el handler de inferencia."""
import base64
import io
import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from PIL import Image

import fakes
import model_store

onnx = pytest.importorskip("onnx")
import modelo_falso_onnx  # noqa: E402

BLOQUE = {"id_bloque": "BLQ-1", "empresa_id": "EMP-1", "nombre": "Bloque 1", "ciudad": "Cali", "activo": True}
USUARIO = {"rol": "tecnico", "empresa_id": "EMP-1", "nombre": "Tec"}


@pytest.fixture
def h(monkeypatch, tmp_path):
    import handler

    monkeypatch.setattr(handler, "s3", fakes.FakeS3())
    monkeypatch.setattr(handler, "tabla_mediciones", fakes.FakeTabla())
    monkeypatch.setattr(handler, "tabla_usuarios", fakes.FakeTabla([USUARIO]))
    monkeypatch.setattr(handler, "tabla_bloques", fakes.FakeTabla([BLOQUE]))
    monkeypatch.setattr(handler, "_obtener_clima", lambda *a, **k: None)
    monkeypatch.setattr(handler, "_primera_inferencia", True)
    origen = modelo_falso_onnx.construir(tmp_path / "fake_unet.onnx")
    handler.s3.archivos_descargables[("bucket-modelos", "unet/fake_unet.onnx")] = origen
    monkeypatch.setenv("MODEL_TYPE", "unet")
    monkeypatch.setenv("MODEL_BUCKET", "bucket-modelos")
    monkeypatch.setenv("MODEL_KEY", "unet/fake_unet.onnx")
    monkeypatch.setenv("MODEL_CACHE_DIR", str(tmp_path / "cache"))
    model_store.reiniciar_cache()
    yield handler
    model_store.reiniciar_cache()


def _foto():
    arr = np.full((120, 160, 3), 100, np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _evento(timestamp_medicion):
    payload = {
        "imagen_base64": base64.b64encode(_foto()).decode(),
        "bloque_id": "BLQ-1",
    }
    if timestamp_medicion is not None:
        payload["timestamp_medicion"] = timestamp_medicion
    return {
        "requestContext": {"authorizer": {"claims": {"sub": "sub-1"}}},
        "body": json.dumps(payload),
    }


AHORA = datetime(2026, 11, 2, 15, 30, 45, 123456, tzinfo=timezone.utc)


@pytest.fixture
def reloj(h, monkeypatch):
    """Freeze the handler clock so UTC-midnight rollovers cannot flake tests."""
    estado = {"ahora": AHORA}
    monkeypatch.setattr(h, "_ahora_utc", lambda: estado["ahora"])
    return estado


def test_fecha_pasada_valida_acepta_y_conserva_la_fecha_utc(h, reloj):
    resp = h.lambda_handler(_evento("2026-10-15"), None)
    assert resp["statusCode"] == 200, resp["body"]
    item = h.tabla_mediciones.escritos[0]
    # 12:00:00 UTC + (15:30:45 mod 12h = 03:30:45) + microseconds
    assert item["sk"] == "MED#2026-10-15T15:30:45.123456+00:00"
    assert item["timestamp"] == "2026-10-15T15:30:45.123456+00:00"


@pytest.mark.parametrize("hora", [0, 11, 12, 23])
def test_fecha_pasada_nunca_cruza_de_dia_utc(h, reloj, hora):
    reloj["ahora"] = datetime(2026, 11, 2, hora, 59, 59, 999999, tzinfo=timezone.utc)
    h.lambda_handler(_evento("2026-10-15"), None)
    assert h.tabla_mediciones.escritos[0]["timestamp"].startswith("2026-10-15T")


def test_dos_subidas_pasadas_el_mismo_dia_no_se_pisan(h, reloj):
    # Same frozen instant: the second write collides and is bumped by 1 us.
    assert h.lambda_handler(_evento("2026-10-15"), None)["statusCode"] == 200
    assert h.lambda_handler(_evento("2026-10-15"), None)["statusCode"] == 200
    sks = [i["sk"] for i in h.tabla_mediciones.escritos]
    assert len(sks) == 2 and len(set(sks)) == 2
    assert sks[1] == "MED#2026-10-15T15:30:45.123457+00:00"
    assert all(sk.startswith("MED#2026-10-15T") for sk in sks)
    # Both measurements keep distinct S3 objects (keys derive from id_medicion).
    assert len({i["s3_key_imagen"] for i in h.tabla_mediciones.escritos}) == 2


def test_colision_reintenta_con_condicion_y_actualiza_el_json_de_s3(h, reloj):
    h.lambda_handler(_evento("2026-10-15"), None)
    h.lambda_handler(_evento("2026-10-15"), None)
    segundo = h.tabla_mediciones.escritos[1]
    cuerpo = json.loads(h.s3.objetos[(h.BUCKET_NAME, segundo["s3_key_resultado"])])
    assert cuerpo["timestamp"] == segundo["timestamp"]


def test_colisiones_agotadas_falla_y_limpia_s3(h, reloj, monkeypatch):
    monkeypatch.setattr(h, "MAX_INTENTOS_SK", 2)
    for micro in (123456, 123457):
        h.tabla_mediciones.escritos.append({"id_punto": "BLQ-1", "sk": f"MED#2026-10-15T15:30:45.{micro}+00:00"})
    resp = h.lambda_handler(_evento("2026-10-15"), None)
    assert resp["statusCode"] == 500
    assert len(h.tabla_mediciones.escritos) == 2  # only the pre-seeded ones
    assert not [k for k in h.s3.objetos if k[1].startswith("empresas/")]


def test_fecha_de_hoy_utc_es_aceptada(h, reloj):
    hoy = AHORA.date().isoformat()
    resp = h.lambda_handler(_evento(hoy), None)
    assert resp["statusCode"] == 200, resp["body"]
    assert h.tabla_mediciones.escritos[0]["sk"].startswith(f"MED#{hoy}T")


def test_fecha_futura_es_rechazada_con_400(h, reloj):
    manana = (AHORA.date() + timedelta(days=1)).isoformat()
    resp = h.lambda_handler(_evento(manana), None)
    assert resp["statusCode"] == 400
    cuerpo = json.loads(resp["body"])
    assert "futura" in cuerpo["error"].lower()
    assert h.tabla_mediciones.escritos == []


@pytest.mark.parametrize("ausente", [None, "", "ausente"])
def test_sin_fecha_usa_el_instante_actual(h, reloj, ausente):
    evento = _evento(None)
    if ausente == "":
        cuerpo = json.loads(evento["body"]); cuerpo["timestamp_medicion"] = ""; evento["body"] = json.dumps(cuerpo)
    elif ausente is None:
        cuerpo = json.loads(evento["body"]); cuerpo["timestamp_medicion"] = None; evento["body"] = json.dumps(cuerpo)
    resp = h.lambda_handler(evento, None)
    assert resp["statusCode"] == 200, resp["body"]
    assert h.tabla_mediciones.escritos[0]["sk"] == "MED#2026-11-02T15:30:45.123456+00:00"


@pytest.mark.parametrize("fecha_invalida", ["2026-02-30", "no-es-fecha", "20261015", "2026-13-01", "2026-1-5"])
def test_cadena_fecha_invalida_es_rechazada_con_400(h, fecha_invalida):
    resp = h.lambda_handler(_evento(fecha_invalida), None)
    assert resp["statusCode"] == 400
    cuerpo = json.loads(resp["body"])
    assert "no es válida" in cuerpo["error"]
    assert h.tabla_mediciones.escritos == []


@pytest.mark.parametrize("valor_no_str", [12345, ["2026-10-15"], {"fecha": "2026-10-15"}, True])
def test_timestamp_no_string_es_rechazado_con_400_sin_500(h, valor_no_str):
    resp = h.lambda_handler(_evento(valor_no_str), None)
    assert resp["statusCode"] == 400
    cuerpo = json.loads(resp["body"])
    assert "no es válida" in cuerpo["error"]
    assert h.tabla_mediciones.escritos == []
