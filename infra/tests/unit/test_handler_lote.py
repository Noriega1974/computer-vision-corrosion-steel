"""Pruebas de soporte de lote_id y lote_nombre en inference y api_mediciones."""
import base64
import io
import json
from datetime import datetime, timezone

import numpy as np
import pytest
from PIL import Image

import fakes
import model_store
from test_borrados_robustos import _cargar

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


def _evento(**extra):
    payload = {
        "imagen_base64": base64.b64encode(_foto()).decode(),
        "bloque_id": "BLQ-1",
        **extra,
    }
    return {
        "requestContext": {"authorizer": {"claims": {"sub": "sub-1"}}},
        "body": json.dumps(payload),
    }


def test_post_medicion_guarda_lote_id_y_lote_nombre(h):
    resp = h.lambda_handler(
        _evento(lote_id="LOT-m3k9z-8x2a", lote_nombre="Inspección mensual torre norte"),
        None,
    )
    assert resp["statusCode"] == 200, resp["body"]
    item = h.tabla_mediciones.escritos[0]
    assert item["lote_id"] == "LOT-m3k9z-8x2a"
    assert item["lote_nombre"] == "Inspección mensual torre norte"
    body = json.loads(resp["body"])
    assert body["lote_id"] == "LOT-m3k9z-8x2a"
    assert body["lote_nombre"] == "Inspección mensual torre norte"
    assert "lote_id" in h._CAMPOS_BUSQUEDA
    assert "lote_nombre" in h._CAMPOS_BUSQUEDA


def test_post_medicion_sanitiza_lote_id_y_lote_nombre(h):
    largo_id = "  LOT-2026_11!@#$%^&*()" + ("a" * 80)
    largo_nombre = "  Lote\x00\x07   con   espacios   " + ("x" * 100)
    resp = h.lambda_handler(_evento(lote_id=largo_id, lote_nombre=largo_nombre), None)
    assert resp["statusCode"] == 200, resp["body"]
    item = h.tabla_mediciones.escritos[0]
    assert len(item["lote_id"]) == 64
    assert item["lote_id"].startswith("LOT-2026_11a")
    assert len(item["lote_nombre"]) <= 80
    assert item["lote_nombre"].startswith("Lote con espacios ")


def test_post_medicion_omite_lote_cuando_no_se_envia(h):
    resp = h.lambda_handler(_evento(), None)
    assert resp["statusCode"] == 200, resp["body"]
    item = h.tabla_mediciones.escritos[0]
    assert "lote_id" not in item
    assert "lote_nombre" not in item


def test_api_mediciones_proyecta_lote_en_campos_livianos(monkeypatch):
    api_med = _cargar("api_mediciones_lote_test", "api_mediciones", monkeypatch)
    assert "lote_id" in api_med.CAMPOS_LIVIANOS
    assert "lote_nombre" in api_med.CAMPOS_LIVIANOS


def test_lote_con_fecha_pasada_guarda_todas_las_fotos_sin_pisarse(h, monkeypatch):
    # Frozen clock: every upload of the batch gets the same instant, so the
    # sort key collides and must be bumped instead of overwriting a photo.
    ahora = datetime(2026, 11, 2, 15, 30, 45, 123456, tzinfo=timezone.utc)
    monkeypatch.setattr(h, "_ahora_utc", lambda: ahora)
    for i in range(4):
        resp = h.lambda_handler(
            _evento(lote_id="LOT-abc", lote_nombre="Lote pasado",
                    timestamp_medicion="2026-10-15", nombre=f"IMG_{i}"),
            None,
        )
        assert resp["statusCode"] == 200, resp["body"]
    items = h.tabla_mediciones.escritos
    assert len(items) == 4
    assert len({i["sk"] for i in items}) == 4
    assert {i["lote_id"] for i in items} == {"LOT-abc"}
    assert all(i["timestamp"].startswith("2026-10-15T") for i in items)


def test_lote_nombre_sin_lote_id_valido_no_crea_carpeta(h):
    resp = h.lambda_handler(_evento(lote_id="!!!@@@", lote_nombre="Solo nombre"), None)
    assert resp["statusCode"] == 200, resp["body"]
    item = h.tabla_mediciones.escritos[0]
    assert "lote_id" not in item  # sanitised to empty: stored as a single photo
    assert "lote_nombre" not in item


def test_lote_campos_no_string_se_ignoran(h):
    resp = h.lambda_handler(_evento(lote_id=123, lote_nombre={"x": 1}), None)
    assert resp["statusCode"] == 200, resp["body"]
    item = h.tabla_mediciones.escritos[0]
    assert "lote_id" not in item and "lote_nombre" not in item


def test_foto_suelta_y_foto_de_lote_conviven_en_el_mismo_punto(h):
    h.lambda_handler(_evento(lote_id="LOT-1", lote_nombre="Tanda"), None)
    h.lambda_handler(_evento(), None)
    con_lote, suelta = h.tabla_mediciones.escritos
    assert con_lote["lote_id"] == "LOT-1" and "lote_id" not in suelta
