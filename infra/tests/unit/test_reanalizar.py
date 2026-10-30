"""POST /mediciones/{id_punto}/reanalizar (herramienta temporal, super_admin):
vuelve a correr la inferencia actual sobre la foto ya guardada en S3 y reemplaza
el analisis del mismo ítem, guardando el original en `analisis_anterior`."""
import json

import pytest

import fakes
from test_handler import _foto, _poner_unet, h  # noqa: F401  (h es fixture)
from test_handler_placa import CAMPOS_PLACA, _foto_placa, _poner_placa, _sin_placa_en_el_entorno  # noqa: F401

SUPER = {"rol": "super_admin", "empresa_id": "EMP-9", "nombre": "Root"}
CLAVE_IMG = "empresas/EMP-1/BLQ-1/MED-1.jpg"
CLAVE_THUMB = "empresas/EMP-1/BLQ-1/MED-1_thumb.jpg"
CLAVE_JSON = "empresas/EMP-1/BLQ-1/MED-1.json"
THUMB = b"thumb-original"


def _item_viejo(**extra):
    item = {
        "id_punto": "BLQ-1", "sk": "MED#2026-10-01T12:00:00+00:00", "timestamp": "2026-10-01T12:00:00+00:00",
        "tipo_registro": "medicion", "id_medicion": "MED-1", "fuente": "web", "nombre": "Placa 7",
        "notas": "nota del tecnico", "area_corroida_pct": "2.2", "confianza_promedio": "0.5",
        "nivel_corrosion": 1, "modelo": "yolo:viejo.onnx", "detecciones": [], "mascaras": [],
        "s3_key_imagen": CLAVE_IMG, "s3_key_thumbnail": CLAVE_THUMB, "s3_key_resultado": CLAVE_JSON,
        "tomado_por_id": "sub-0", "creado_por_nombre": "Tec", "empresa_id": "EMP-1", "bloque_id": "BLQ-1",
        "tiempo_subida_s": 3,
    }
    item.update(extra)
    return item


@pytest.fixture
def r(h, monkeypatch, tmp_path):  # noqa: F811
    """`h` con una medicion vieja guardada, el usuario super_admin y la U-Net de juguete."""
    _poner_unet(h, monkeypatch, tmp_path)
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([SUPER]))
    monkeypatch.setattr(h, "tabla_mediciones", fakes.FakeTabla([_item_viejo()]))
    h.foto = _foto()
    h.s3.objetos[(h.BUCKET_NAME, CLAVE_IMG)] = h.foto
    h.s3.objetos[(h.BUCKET_NAME, CLAVE_THUMB)] = THUMB
    h.s3.objetos[(h.BUCKET_NAME, CLAVE_JSON)] = json.dumps({"id_medicion": "MED-1", "notas": "nota", "modelo": "yolo:viejo.onnx"}).encode()
    return h


def _evento(id_medicion="MED-1", id_punto="BLQ-1"):
    return {
        "resource": "/mediciones/{id_punto}/reanalizar",
        "httpMethod": "POST",
        "pathParameters": {"id_punto": id_punto},
        "queryStringParameters": {"id_medicion": id_medicion} if id_medicion else None,
        "requestContext": {"authorizer": {"claims": {"sub": "sub-root"}}},
    }


def _llamar(r, **kw):
    resp = r.lambda_handler(_evento(**kw), None)
    return resp["statusCode"], json.loads(resp["body"])


def test_super_admin_reemplaza_el_analisis_y_guarda_el_anterior(r):
    codigo, cuerpo = _llamar(r)
    assert codigo == 200 and cuerpo["ok"] is True
    med = cuerpo["medicion"]
    assert med["modelo"] == "unet:fake_unet.onnx"
    assert float(med["area_corroida_pct"]) == pytest.approx(19.5, abs=1.0)
    assert med["nivel_corrosion"] == 2
    assert len(med["detecciones"]) == 1 and len(med["mascaras"]) == 1
    assert med["analisis_anterior"] == {
        "area_corroida_pct": 2.2, "nivel_corrosion": 1, "modelo": "yolo:viejo.onnx",
        "fecha": "2026-10-01T12:00:00+00:00",
    }
    assert med["reanalizado_en"].endswith("+00:00")
    assert med["tiempo_procesamiento_ms"] >= 0
    assert med["url_imagen"].endswith(f"{CLAVE_IMG}?op=get_object") and CLAVE_THUMB in med["url_thumbnail"]
    guardado = r.tabla_mediciones.items[0]
    assert guardado["modelo"] == "unet:fake_unet.onnx" and guardado["nivel_corrosion"] == 2


def test_no_toca_foto_miniatura_ni_los_datos_de_la_medicion(r):
    _llamar(r)
    assert r.s3.objetos[(r.BUCKET_NAME, CLAVE_IMG)] == r.foto
    assert r.s3.objetos[(r.BUCKET_NAME, CLAVE_THUMB)] == THUMB
    assert r.s3.eliminados == []
    guardado = r.tabla_mediciones.items[0]
    for campo, valor in (("nombre", "Placa 7"), ("notas", "nota del tecnico"), ("sk", "MED#2026-10-01T12:00:00+00:00"),
                         ("timestamp", "2026-10-01T12:00:00+00:00"), ("creado_por_nombre", "Tec"),
                         ("tomado_por_id", "sub-0"), ("empresa_id", "EMP-1"), ("tiempo_subida_s", 3),
                         ("s3_key_imagen", CLAVE_IMG), ("s3_key_thumbnail", CLAVE_THUMB), ("s3_key_resultado", CLAVE_JSON)):
        assert guardado[campo] == valor


def test_el_segundo_reintento_conserva_el_analisis_original(r):
    _llamar(r)
    primero = dict(r.tabla_mediciones.items[0]["analisis_anterior"])
    codigo, cuerpo = _llamar(r)
    assert codigo == 200
    assert r.tabla_mediciones.items[0]["analisis_anterior"] == primero
    assert cuerpo["medicion"]["analisis_anterior"]["modelo"] == "yolo:viejo.onnx"
    assert cuerpo["medicion"]["analisis_anterior"]["area_corroida_pct"] == 2.2


def test_reescribe_el_json_de_resultado(r):
    _llamar(r)
    datos = json.loads(r.s3.objetos[(r.BUCKET_NAME, CLAVE_JSON)])
    assert datos["modelo"] == "unet:fake_unet.onnx" and datos["notas"] == "nota"
    assert datos["analisis_anterior"]["modelo"] == "yolo:viejo.onnx" and datos["reanalizado_en"]
    assert datos["nivel_corrosion"] == 2 and len(datos["detecciones"]) == 1


def test_sin_json_de_resultado_no_lo_crea(r):
    r.tabla_mediciones.items[0].pop("s3_key_resultado")
    r.s3.objetos.pop((r.BUCKET_NAME, CLAVE_JSON))
    codigo, _ = _llamar(r)
    assert codigo == 200 and (r.BUCKET_NAME, CLAVE_JSON) not in r.s3.objetos


@pytest.mark.parametrize("rol", ["admin", "tecnico", "cliente"])
def test_solo_super_admin_puede_reanalizar(r, monkeypatch, rol):
    monkeypatch.setattr(r, "tabla_usuarios", fakes.FakeTabla([{"rol": rol, "empresa_id": "EMP-1"}]))
    codigo, _ = _llamar(r)
    assert codigo == 403
    assert r.tabla_mediciones.actualizados == [] and r.s3.descargas == []


def test_sin_usuario_registrado_es_403(r, monkeypatch):
    monkeypatch.setattr(r, "tabla_usuarios", fakes.FakeTabla([]))
    assert _llamar(r)[0] == 403


def test_medicion_inexistente_es_404(r):
    codigo, cuerpo = _llamar(r, id_medicion="MED-NO-EXISTE")
    assert codigo == 404 and "No se encontró la medición" in cuerpo["error"]
    assert r.tabla_mediciones.actualizados == []


def test_sin_id_medicion_es_400(r):
    assert _llamar(r, id_medicion=None)[0] == 400


def test_medicion_sin_foto_guardada_es_422(r):
    r.tabla_mediciones.items[0].pop("s3_key_imagen")
    codigo, cuerpo = _llamar(r)
    assert codigo == 422 and "no tiene foto" in cuerpo["error"]
    assert r.tabla_mediciones.actualizados == []


def test_foto_ausente_en_s3_es_404(r):
    r.s3.objetos.pop((r.BUCKET_NAME, CLAVE_IMG))
    codigo, cuerpo = _llamar(r)
    assert codigo == 404 and "foto" in cuerpo["error"]
    assert r.tabla_mediciones.actualizados == []


def test_con_separador_de_placa_guarda_los_campos_de_placa(r, monkeypatch, tmp_path):
    _poner_placa(r, monkeypatch, tmp_path)
    r.s3.objetos[(r.BUCKET_NAME, CLAVE_IMG)] = _foto_placa()
    codigo, cuerpo = _llamar(r)
    assert codigo == 200
    med = cuerpo["medicion"]
    assert CAMPOS_PLACA <= set(med) and med["area_base"] == "placa" and med["modelo_placa"] == "placa:fake_placa.onnx"
    assert float(med["area_corroida_pct"]) == pytest.approx(50.0, abs=3.0)
    assert med["nivel_corrosion"] == 3
    datos = json.loads(r.s3.objetos[(r.BUCKET_NAME, CLAVE_JSON)])
    assert CAMPOS_PLACA <= set(datos) and datos["area_base"] == "placa"


def test_quita_los_campos_de_placa_si_el_resultado_nuevo_no_los_trae(r):
    r.tabla_mediciones.items[0].update({
        "area_base": "placa", "area_corroida_pct_foto": "10.0", "placa_pct_foto": "40.0",
        "contorno_placa": {"puntos": []}, "modelo_placa": "placa:viejo.onnx",
    })
    r.s3.objetos[(r.BUCKET_NAME, CLAVE_JSON)] = json.dumps({"area_base": "placa", "contorno_placa": None}).encode()
    codigo, cuerpo = _llamar(r)  # sin PLATE_MODEL_KEY: el contrato no trae campos de placa
    assert codigo == 200
    assert not CAMPOS_PLACA & set(r.tabla_mediciones.items[0])
    assert not CAMPOS_PLACA & set(cuerpo["medicion"])
    assert not CAMPOS_PLACA & set(json.loads(r.s3.objetos[(r.BUCKET_NAME, CLAVE_JSON)]))
    assert r.tabla_mediciones.items[0]["analisis_anterior"]["area_base"] == "placa"


def test_el_analisis_anterior_incluye_area_base_si_existia(r):
    r.tabla_mediciones.items[0]["area_base"] = "foto"
    _llamar(r)
    assert r.tabla_mediciones.items[0]["analisis_anterior"]["area_base"] == "foto"
