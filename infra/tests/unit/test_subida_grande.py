"""Fotos grandes: POST /medicion/upload-url (POST prefirmado) y POST /medicion
con `imagen_key`. La ruta base64 (app móvil) queda cubierta por test_handler.py;
aquí se fija además que no cambió. Todo local: el POST prefirmado se firma sin red."""
import base64
import json

import boto3
import pytest
from botocore.config import Config
from PIL import Image

import fakes
from test_handler import _evento, _foto, _ok, _poner_unet, h  # noqa: F401  (h es fixture)

SUB = "sub-1"
CLAVE = f"uploads/{SUB}/abc.jpg"


@pytest.fixture
def hs(h, monkeypatch):  # noqa: F811
    """handler con un cliente S3 real (solo para firmar) y objetos en el doble."""
    h.s3_doble = h.s3
    return h


def _evento_clave(clave, **extra):
    cuerpo = {"imagen_key": clave, "bloque_id": "BLQ-1", **extra}
    return {"requestContext": {"authorizer": {"claims": {"sub": SUB}}}, "body": json.dumps(cuerpo)}


def _evento_url(content_type="image/jpeg", sub=SUB):
    return {
        "resource": "/medicion/upload-url",
        "requestContext": {"authorizer": {"claims": {"sub": sub}}},
        "body": json.dumps({"content_type": content_type}),
    }


def _con_firma_real(h, monkeypatch):
    real = boto3.client("s3", region_name="us-east-1", config=Config(signature_version="s3v4"))
    monkeypatch.setattr(h, "s3", real)


# ── POST /medicion/upload-url ────────────────────────────────────────────────

def test_upload_url_devuelve_post_prefirmado_con_politica(h, monkeypatch):
    _con_firma_real(h, monkeypatch)
    cuerpo = _ok(h.lambda_handler(_evento_url(), None))
    assert cuerpo["imagen_key"].startswith(f"uploads/{SUB}/") and cuerpo["imagen_key"].endswith(".jpg")
    assert cuerpo["max_bytes"] == 52_428_800 and cuerpo["expira_en_s"] == 600
    assert "bucket-de-prueba" in cuerpo["url"]
    assert cuerpo["fields"]["key"] == cuerpo["imagen_key"]
    politica = json.loads(base64.b64decode(cuerpo["fields"]["policy"]))
    assert ["content-length-range", 1, 52_428_800] in politica["conditions"]
    assert {"Content-Type": "image/jpeg"} in politica["conditions"]
    assert {"key": cuerpo["imagen_key"]} in politica["conditions"]


def test_upload_url_claves_distintas_por_solicitud(h, monkeypatch):
    _con_firma_real(h, monkeypatch)
    a = _ok(h.lambda_handler(_evento_url(), None))["imagen_key"]
    b = _ok(h.lambda_handler(_evento_url(), None))["imagen_key"]
    assert a != b


def test_upload_url_rechaza_tipo_no_imagen(h, monkeypatch):
    _con_firma_real(h, monkeypatch)
    resp = h.lambda_handler(_evento_url("application/x-msdownload"), None)
    assert resp["statusCode"] == 400 and "no soportado" in json.loads(resp["body"])["error"]


def test_upload_url_cliente_no_puede(h, monkeypatch):
    _con_firma_real(h, monkeypatch)
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": "cliente", "empresa_id": "EMP-1"}]))
    assert h.lambda_handler(_evento_url(), None)["statusCode"] == 403


def test_upload_url_sin_sub_es_401(h, monkeypatch):
    _con_firma_real(h, monkeypatch)
    assert h.lambda_handler(_evento_url(sub=""), None)["statusCode"] == 401


# ── POST /medicion con imagen_key ────────────────────────────────────────────

def test_imagen_key_corre_el_mismo_pipeline_y_borra_el_temporal(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    h.s3.put_object("bucket-de-prueba", CLAVE, _foto())
    cuerpo = _ok(h.lambda_handler(_evento_clave(CLAVE), None))
    assert cuerpo["modelo"] == "unet:fake_unet.onnx" and cuerpo["nivel_corrosion"] == 2
    assert ("bucket-de-prueba", CLAVE) in h.s3.eliminados
    assert ("bucket-de-prueba", CLAVE) not in h.s3.objetos
    # la copia definitiva sigue siendo la de siempre, bajo empresas/
    assert cuerpo["s3_key_imagen"].startswith("empresas/EMP-1/BLQ-1/") and ("bucket-de-prueba", cuerpo["s3_key_imagen"]) in h.s3.objetos


def test_imagen_key_da_el_mismo_resultado_que_base64(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    foto = _foto()
    h.s3.put_object("bucket-de-prueba", CLAVE, foto)
    por_clave = _ok(h.lambda_handler(_evento_clave(CLAVE), None))
    por_b64 = _ok(h.lambda_handler(_evento(foto), None))
    for campo in ("nivel_corrosion", "area_corroida_pct", "confianza_promedio", "detecciones", "mascaras"):
        assert por_clave[campo] == por_b64[campo]


@pytest.mark.parametrize("clave", [
    "uploads/otro-usuario/abc.jpg",           # prefijo de otro usuario
    "empresas/EMP-1/BLQ-1/MED-1.jpg",         # otro prefijo del bucket
    f"uploads/{SUB}/../otro-usuario/abc.jpg",  # intento de salirse del prefijo
    f"uploads/{SUB}/sub/carpeta.jpg",          # subcarpetas no existen
    f"uploads/{SUB}/",                         # sin nombre
    f"uploads/{SUB}",                          # sin barra final
    "",
    123,
])
def test_imagen_key_ajena_o_invalida_es_400_y_no_lee_s3(h, monkeypatch, tmp_path, clave):
    _poner_unet(h, monkeypatch, tmp_path)
    h.s3.put_object("bucket-de-prueba", "uploads/otro-usuario/abc.jpg", _foto())
    resp = h.lambda_handler(_evento_clave(clave), None)
    assert resp["statusCode"] == 400 and "error" in json.loads(resp["body"])
    assert h.tabla_mediciones.escritos == []
    assert ("bucket-de-prueba", "uploads/otro-usuario/abc.jpg") in h.s3.objetos  # no se tocó


def test_imagen_key_inexistente_es_400(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    resp = h.lambda_handler(_evento_clave(CLAVE), None)
    assert resp["statusCode"] == 400 and "no existe" in json.loads(resp["body"])["error"]


def test_imagen_key_sobre_el_maximo_es_400_y_se_borra(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    monkeypatch.setattr(h, "MAX_BYTES_FOTO", 10)
    h.s3.put_object("bucket-de-prueba", CLAVE, _foto())
    resp = h.lambda_handler(_evento_clave(CLAVE), None)
    assert resp["statusCode"] == 400 and "máximo" in json.loads(resp["body"])["error"]
    assert ("bucket-de-prueba", CLAVE) in h.s3.eliminados


def test_sin_imagen_ni_clave_es_400(h):
    resp = h.lambda_handler({"requestContext": {"authorizer": {"claims": {"sub": SUB}}}, "body": json.dumps({"bloque_id": "BLQ-1"})}, None)
    assert resp["statusCode"] == 400 and "imagen_key" in json.loads(resp["body"])["error"]


def test_base64_sigue_igual_y_no_toca_uploads(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento(_foto()), None))
    assert cuerpo["nivel_corrosion"] == 2
    assert h.s3.eliminados == []  # no hay temporal que borrar


# ── Decodificación de fotos enormes ──────────────────────────────────────────

def test_limite_de_pixeles_de_pillow_subido():
    import handler  # noqa: F401
    assert Image.MAX_IMAGE_PIXELS == 250_000_000


def test_foto_normal_no_se_reduce(h, monkeypatch):
    monkeypatch.setattr(h, "MAX_PIXELES_SIN_REDUCIR", 640 * 480)  # justo el tamaño de _foto()
    assert h._abrir_imagen(_foto()).size == (640, 480)


def test_jpeg_gigante_se_decodifica_a_media_resolucion(h, monkeypatch):
    monkeypatch.setattr(h, "MAX_PIXELES_SIN_REDUCIR", 100 * 100)
    assert h._abrir_imagen(_foto()).size == (320, 240)


def test_bomba_de_descompresion_es_400(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1000)
    resp = h.lambda_handler(_evento(_foto()), None)
    assert resp["statusCode"] == 400 and "píxeles" in json.loads(resp["body"])["error"]


# ── Tiempos por medicion (tiempo_subida_s / tiempo_procesamiento_ms) ─────────

def _evento_con_tiempo(foto, **extra):
    ev = _evento(foto)
    cuerpo = json.loads(ev["body"])
    cuerpo.update(extra)
    ev["body"] = json.dumps(cuerpo)
    return ev


def test_tiempos_se_guardan_y_se_devuelven(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento_con_tiempo(_foto(), tiempo_subida_s=3.456), None))
    item = h.tabla_mediciones.escritos[0]
    assert cuerpo["tiempo_subida_s"] == 3.46
    assert isinstance(cuerpo["tiempo_procesamiento_ms"], int) and cuerpo["tiempo_procesamiento_ms"] >= 0
    assert str(item["tiempo_subida_s"]) == "3.46"
    assert item["tiempo_procesamiento_ms"] == cuerpo["tiempo_procesamiento_ms"]


@pytest.mark.parametrize("valor", [-1, 601, "3", None, True, [1], {"a": 1}, float("nan")])
def test_tiempo_subida_invalido_se_ignora(h, monkeypatch, tmp_path, valor):
    _poner_unet(h, monkeypatch, tmp_path)
    resp = h.lambda_handler(_evento_con_tiempo(_foto(), tiempo_subida_s=valor), None)
    cuerpo = _ok(resp)
    item = h.tabla_mediciones.escritos[0]
    assert "tiempo_subida_s" not in cuerpo and "tiempo_subida_s" not in item
    assert "tiempo_procesamiento_ms" in item  # el del servidor siempre se guarda


def test_base64_sin_tiempo_subida_guarda_solo_procesamiento(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento(_foto()), None))
    assert cuerpo["nivel_corrosion"] == 2
    assert "tiempo_subida_s" not in h.tabla_mediciones.escritos[0]
    assert "tiempo_procesamiento_ms" in h.tabla_mediciones.escritos[0]


# ── Nombre de la foto (opcional) ──────────────────────────────────────────────

def test_nombre_se_guarda_y_se_devuelve(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento_con_tiempo(_foto(), nombre="Placa 12 lado norte"), None))
    assert cuerpo["nombre"] == "Placa 12 lado norte"
    assert h.tabla_mediciones.escritos[0]["nombre"] == "Placa 12 lado norte"


def test_nombre_se_limpia_y_trunca(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    crudo = "  Placa\t\x00 12   norte\n" + "x" * 200
    cuerpo = _ok(h.lambda_handler(_evento_con_tiempo(_foto(), nombre=crudo), None))
    esperado = ("Placa 12 norte " + "x" * 200)[:80]
    assert cuerpo["nombre"] == esperado and len(esperado) == 80
    assert h.tabla_mediciones.escritos[0]["nombre"] == esperado


@pytest.mark.parametrize("valor", ["", "   ", "\x00\n", None, 5, ["a"]])
def test_nombre_vacio_o_invalido_no_se_guarda(h, monkeypatch, tmp_path, valor):
    _poner_unet(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento_con_tiempo(_foto(), nombre=valor), None))
    assert "nombre" not in cuerpo and "nombre" not in h.tabla_mediciones.escritos[0]


def test_sin_nombre_sigue_funcionando(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento(_foto()), None))
    assert cuerpo["nivel_corrosion"] == 2 and "nombre" not in cuerpo
