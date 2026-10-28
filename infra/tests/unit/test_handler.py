"""handler.lambda_handler de punta a punta con S3/DynamoDB en memoria.

Ningún modelo va empaquetado: MODEL_TYPE + MODEL_KEY eligen el ONNX, que se baja
de un S3 falso a la caché local. Se usan ONNX de juguete (modelo_falso_onnx.py)
para YOLO y U-Net; la U-Net real (98 MB) se prueba aparte con UNET_TEST_ONNX
(ver test_unet_real) y la paridad con el evaluador offline con
scripts/parity_vs_offline.py.
"""
import base64
import io
import json
import os
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import fakes
import model_store
from contrato import CAMPOS_FRONTEND, validar_contrato

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
    for k in ("MODEL_TYPE", "MODEL_LOCAL_PATH", "MODEL_SHA256"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("MODEL_CACHE_DIR", str(tmp_path / "cache"))
    model_store.reiniciar_cache()
    yield handler
    model_store.reiniciar_cache()


def _foto(rect=True, tam=(640, 480)):
    """Fondo gris con un rectángulo rojo (la 'corrosión' del modelo de juguete)."""
    arr = np.full((tam[1], tam[0], 3), 100, np.uint8)
    if rect:
        arr[100:300, 200:500] = (220, 60, 40)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def _evento(foto: bytes):
    return {
        "requestContext": {"authorizer": {"claims": {"sub": "sub-1"}}},
        "body": json.dumps({"imagen_base64": base64.b64encode(foto).decode(), "bloque_id": "BLQ-1"}),
    }


def _poner_unet(h, monkeypatch, tmp_path):
    origen = modelo_falso_onnx.construir(tmp_path / "fake_unet.onnx")
    h.s3.archivos_descargables[("bucket-modelos", "unet/fake_unet.onnx")] = origen
    monkeypatch.setenv("MODEL_TYPE", "unet")
    monkeypatch.setenv("MODEL_BUCKET", "bucket-modelos")
    monkeypatch.setenv("MODEL_KEY", "unet/fake_unet.onnx")
    model_store.reiniciar_cache()


def _poner_yolo(h, monkeypatch, tmp_path, **kw):
    origen = modelo_falso_onnx.construir_yolo(tmp_path / "fake_yolo.onnx", **kw)
    h.s3.archivos_descargables[("bucket-modelos", "yolo/fake_yolo.onnx")] = origen
    monkeypatch.setenv("MODEL_TYPE", "yolo")
    monkeypatch.setenv("MODEL_BUCKET", "bucket-modelos")
    monkeypatch.setenv("MODEL_KEY", "yolo/fake_yolo.onnx")
    model_store.reiniciar_cache()


def _ok(resp):
    assert resp["statusCode"] == 200, resp["body"]
    return json.loads(resp["body"])


# ── YOLO ─────────────────────────────────────────────────────────────────────

def test_yolo_cumple_el_contrato_y_el_area_es_de_la_foto_completa(h, monkeypatch, tmp_path):
    # foto 640x480 (lienzo con 128 px de relleno arriba/abajo); caja de 400x200 px del lienzo
    _poner_yolo(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento(_foto()), None))
    validar_contrato(cuerpo)
    assert cuerpo["modelo"] == "yolo:fake_yolo.onnx"
    assert cuerpo["area_corroida_pct"] == pytest.approx(400 * 200 / (1024 * 768) * 100, abs=0.5)
    assert cuerpo["nivel_corrosion"] == 2  # 10.17 % -> moderada (10 a < 25 %)
    assert h.tabla_mediciones.escritos[0]["modelo"] == "yolo:fake_yolo.onnx"


def test_yolo_relleno_no_cuenta_en_el_handler(h, monkeypatch, tmp_path):
    _poner_yolo(h, monkeypatch, tmp_path, caja_xyxy=(0, 0, 1024, 256))
    cuerpo = _ok(h.lambda_handler(_evento(_foto()), None))
    assert cuerpo["area_corroida_pct"] == pytest.approx((256 - 128) / 768 * 100, abs=0.5)
    assert cuerpo["nivel_corrosion"] == 2  # 16.7 %


def test_yolo_umbral_de_confianza_desde_el_entorno(h, monkeypatch, tmp_path):
    _poner_yolo(h, monkeypatch, tmp_path, conf=0.3)
    assert _ok(h.lambda_handler(_evento(_foto()), None))["detecciones"] != []
    monkeypatch.setenv("CONF_MINIMA", "0.4")
    assert _ok(h.lambda_handler(_evento(_foto()), None))["detecciones"] == []


def test_onnx_con_otro_tamano_de_entrada_falla_claro(h, monkeypatch, tmp_path, caplog):
    origen = modelo_falso_onnx.construir(tmp_path / "chico.onnx", size=640)
    h.s3.archivos_descargables[("bucket-modelos", "unet/chico.onnx")] = origen
    monkeypatch.setenv("MODEL_TYPE", "unet")
    monkeypatch.setenv("MODEL_BUCKET", "bucket-modelos")
    monkeypatch.setenv("MODEL_KEY", "unet/chico.onnx")
    resp = h.lambda_handler(_evento(_foto()), None)
    # El cliente recibe un mensaje genérico; la causa técnica queda en el log.
    assert resp["statusCode"] == 500 and "error inesperado" in json.loads(resp["body"])["error"]
    assert "1x3x1024x1024" in caplog.text
    assert h.s3.objetos == {} and h.tabla_mediciones.escritos == []  # nada a medias


# ── U-Net ────────────────────────────────────────────────────────────────────

def test_unet_cumple_el_mismo_contrato_que_yolo(h, monkeypatch, tmp_path):
    _poner_yolo(h, monkeypatch, tmp_path)
    cuerpo_yolo = _ok(h.lambda_handler(_evento(_foto()), None))
    _poner_unet(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento(_foto()), None))

    validar_contrato(cuerpo)
    assert set(cuerpo) == set(cuerpo_yolo), "las claves de primer nivel deben ser las mismas"
    assert CAMPOS_FRONTEND <= set(cuerpo)
    assert cuerpo["modelo"] == "unet:fake_unet.onnx"
    assert h.s3.descargas[-1] == ("bucket-modelos", "unet/fake_unet.onnx")

    # El rectángulo rojo cubre 300x200 de 640x480
    esperado = 300 * 200 / (640 * 480) * 100
    assert cuerpo["area_corroida_pct"] == pytest.approx(esperado, abs=1.0)
    assert cuerpo["nivel_corrosion"] == 2  # 19.5 % -> nivel 2 (10 a < 25 %)
    assert len(cuerpo["detecciones"]) == 1
    d = cuerpo["detecciones"][0]
    assert d["x"] == pytest.approx((200 + 500) / 2 / 640, abs=0.01)
    assert d["w"] == pytest.approx(300 / 640, abs=0.01)
    assert d["confianza"] > 0.9


def test_unet_foto_sin_corrosion(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento(_foto(rect=False)), None))
    validar_contrato(cuerpo)
    assert (cuerpo["nivel_corrosion"], cuerpo["area_corroida_pct"], cuerpo["detecciones"], cuerpo["mascaras"]) == (0, 0.0, [], [])


def test_unet_segunda_foto_no_vuelve_a_descargar(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    _ok(h.lambda_handler(_evento(_foto()), None))
    _ok(h.lambda_handler(_evento(_foto()), None))
    assert len(h.s3.descargas) == 1


def test_unet_item_dynamodb_valido(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    _ok(h.lambda_handler(_evento(_foto()), None))
    item = h.tabla_mediciones.escritos[0]  # FakeTabla ya rechaza floats al escribir
    assert item["modelo"] == "unet:fake_unet.onnx"
    for campo in ("nivel_corrosion", "area_corroida_pct", "confianza_promedio", "detecciones", "mascaras"):
        assert campo in item
    assert fakes.tamano_item_dynamodb(item) < 300_000  # límite real: 400 KB


def test_unet_error_de_modelo_no_deja_basura(h, monkeypatch, tmp_path):
    monkeypatch.setenv("MODEL_TYPE", "unet")
    monkeypatch.setenv("MODEL_BUCKET", "bucket-modelos")
    monkeypatch.setenv("MODEL_KEY", "unet/no_existe.onnx")
    resp = h.lambda_handler(_evento(_foto()), None)
    assert resp["statusCode"] == 500
    assert h.s3.objetos == {} and h.tabla_mediciones.escritos == []


def test_model_type_invalido(h, monkeypatch, caplog):
    monkeypatch.setenv("MODEL_TYPE", "resnet")
    resp = h.lambda_handler(_evento(_foto()), None)
    # El cliente recibe un mensaje genérico; la causa técnica queda en el log.
    assert resp["statusCode"] == 500 and "error inesperado" in json.loads(resp["body"])["error"]
    assert "MODEL_TYPE" in caplog.text


def test_tiempos_en_log(h, monkeypatch, tmp_path, caplog):
    _poner_unet(h, monkeypatch, tmp_path)
    with caplog.at_level("INFO"):
        _ok(h.lambda_handler(_evento(_foto()), None))
        _ok(h.lambda_handler(_evento(_foto()), None))
    lineas = [json.loads(r.getMessage().split("TIEMPOS_INFERENCIA ")[1]) for r in caplog.records if "TIEMPOS_INFERENCIA" in r.getMessage()]
    assert len(lineas) == 2  # UNA línea por solicitud
    assert [l["arranque_en_frio"] for l in lineas] == [True, False]
    campos = {"modelo", "arranque_en_frio", "descarga_ms", "carga_ms", "inferencia_ms", "onnx_ms", "total_ms", "status", "foto_px"}
    assert campos <= set(lineas[0])
    assert lineas[0]["modelo"] == "unet:fake_unet.onnx" and lineas[0]["status"] == 200
    assert lineas[0]["carga_ms"] > 0 and lineas[1]["descarga_ms"] == 0 and lineas[1]["carga_ms"] == 0
    assert all(l["total_ms"] >= l["inferencia_ms"] >= l["onnx_ms"] >= 0 for l in lineas)


def test_sin_inferencia_no_hay_linea_de_tiempos(h, caplog):
    with caplog.at_level("INFO"):
        resp = h.lambda_handler({"body": json.dumps({"bloque_id": "BLQ-1"})}, None)
    assert resp["statusCode"] == 400
    assert not [r for r in caplog.records if "TIEMPOS_INFERENCIA" in r.getMessage()]


# ── Niveles ISO 10289 sobre la foto completa ─────────────────────────────────

@pytest.mark.parametrize("pct, nivel", [
    (0, 0), (0.0499, 0), (0.05, 1), (9.99, 1), (10, 2), (24.99, 2), (25, 3), (100, 3),
])
def test_calcular_nivel_limites_iso_10289(h, pct, nivel):
    assert h._calcular_nivel(pct) == nivel


# ── EXIF ─────────────────────────────────────────────────────────────────────

def _jpeg_con_orientacion(orientacion, tam=(64, 32)):
    img = Image.new("RGB", tam, (0, 0, 255))
    img.paste((255, 0, 0), (0, 0, 8, 8))  # marca en la esquina superior izquierda
    exif = Image.Exif()
    exif[0x0112] = orientacion
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=100, exif=exif)
    return buf.getvalue()


def test_exif_orientacion_6_gira_la_foto(h):
    img = h._abrir_imagen(_jpeg_con_orientacion(6))  # 6 = rotar 90 grados horario para verla derecha
    assert img.size == (32, 64) and img.mode == "RGB"
    assert img.getpixel((28, 3))[0] > 150  # la esquina marcada pasó a la esquina superior derecha


def test_exif_sin_orientacion_no_cambia_nada(h):
    assert h._abrir_imagen(_jpeg_con_orientacion(1)).size == (64, 32)
    assert h._abrir_imagen(_foto()).size == (640, 480)  # sin EXIF


def test_handler_infiere_sobre_la_foto_ya_girada(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    vistos = []
    original = h.unet_model.inferir
    monkeypatch.setattr(h.unet_model, "inferir", lambda imagen, sesion: (vistos.append(imagen.size), original(imagen, sesion))[1])
    _ok(h.lambda_handler(_evento(_jpeg_con_orientacion(6, (640, 480))), None))
    assert vistos == [(480, 640)]


# ── Empaquetado ──────────────────────────────────────────────────────────────

def test_ningun_modelo_va_empaquetado_en_la_lambda():
    carpeta = Path(__file__).resolve().parents[2] / "pf_corrosion_infra" / "lambda_src" / "inference"
    assert not list(carpeta.glob("**/*.onnx")) or all("layer" in str(p) for p in carpeta.glob("**/*.onnx"))
    assert not (carpeta / "model").exists()


# ── U-Net real (opcional) ────────────────────────────────────────────────────

REAL = os.environ.get("UNET_TEST_ONNX")
FOTOS = os.environ.get("UNET_TEST_IMAGES")


@pytest.mark.skipif(not (REAL and FOTOS), reason="definir UNET_TEST_ONNX y UNET_TEST_IMAGES (carpeta con .jpg)")
def test_unet_real_cumple_contrato(h, monkeypatch):
    monkeypatch.setenv("MODEL_TYPE", "unet")
    monkeypatch.setenv("MODEL_LOCAL_PATH", REAL)
    model_store.reiniciar_cache()
    fotos = sorted(Path(FOTOS).glob("*.jpg"))[:3]
    assert fotos
    for f in fotos:
        cuerpo = _ok(h.lambda_handler(_evento(f.read_bytes()), None))
        validar_contrato(cuerpo)
        assert fakes.tamano_item_dynamodb(h.tabla_mediciones.escritos[-1]) < 300_000
