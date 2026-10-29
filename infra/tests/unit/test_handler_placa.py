"""handler.lambda_handler con el separador de placa (PLATE_MODEL_KEY) de punta a
punta, con ONNX de juguete: el % sobre la placa en el camino U-Net, el respaldo al
% sobre la foto y los campos aditivos del contrato. Reutiliza los dobles de
test_handler.py."""
import io

import numpy as np
import pytest
from PIL import Image

import model_store
from contrato import CAMPOS_FRONTEND, validar_contrato
from test_handler import _evento, _ok, _poner_unet, _poner_yolo, h  # noqa: F401  (h es fixture)

import modelo_falso_onnx

CAMPOS_PLACA = {"area_base", "area_corroida_pct_foto", "placa_pct_foto", "contorno_placa", "modelo_placa"}


def _foto_placa(con_placa=True):
    """Fondo gris (G=100, no es placa). Placa de juguete = G alto: x 100-540, y 80-400
    (45.8 % de 640x480), con la mitad izquierda "corroida" (R alto, G aun alto)."""
    arr = np.full((480, 640, 3), 100, np.uint8)
    if con_placa:
        arr[80:400, 100:540] = (60, 200, 60)
        arr[80:400, 100:320] = (220, 200, 40)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return buf.getvalue()


def _poner_placa(h, monkeypatch, tmp_path):
    origen = modelo_falso_onnx.construir_placa(tmp_path / "fake_placa.onnx")
    h.s3.archivos_descargables[("bucket-modelos", "placa/fake_placa.onnx")] = origen
    monkeypatch.setenv("PLATE_MODEL_KEY", "placa/fake_placa.onnx")
    model_store.reiniciar_cache()


@pytest.fixture(autouse=True)
def _sin_placa_en_el_entorno(monkeypatch):
    for k in ("PLATE_MODEL_KEY", "PLATE_MODEL_LOCAL_PATH", "PLATE_MODEL_SHA256"):
        monkeypatch.delenv(k, raising=False)


def test_unet_con_placa_calcula_el_porcentaje_sobre_la_placa(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    _poner_placa(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento(_foto_placa()), None))

    validar_contrato(cuerpo)
    assert CAMPOS_FRONTEND <= set(cuerpo) and CAMPOS_PLACA <= set(cuerpo)
    assert cuerpo["area_base"] == "placa"
    assert cuerpo["area_corroida_pct"] == pytest.approx(50.0, abs=3.0)       # mitad de la placa
    assert cuerpo["area_corroida_pct_foto"] == pytest.approx(22.9, abs=2.0)  # el % de siempre
    assert cuerpo["placa_pct_foto"] == pytest.approx(45.8, abs=2.0)
    assert cuerpo["nivel_corrosion"] == 3  # 50 % de la placa; sobre la foto seria nivel 2
    assert cuerpo["modelo"] == "unet:fake_unet.onnx" and cuerpo["modelo_placa"] == "placa:fake_placa.onnx"
    pts = cuerpo["contorno_placa"]["puntos"]
    assert len(pts) >= 4 and all(0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 for p in pts)
    assert ("bucket-modelos", "placa/fake_placa.onnx") in h.s3.descargas


def test_unet_con_placa_guarda_los_campos_en_dynamodb(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    _poner_placa(h, monkeypatch, tmp_path)
    _ok(h.lambda_handler(_evento(_foto_placa()), None))
    item = h.tabla_mediciones.escritos[0]  # FakeTabla rechaza floats
    assert CAMPOS_PLACA <= set(item) and item["area_base"] == "placa"


def test_placa_segunda_foto_no_vuelve_a_descargar(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    _poner_placa(h, monkeypatch, tmp_path)
    _ok(h.lambda_handler(_evento(_foto_placa()), None))
    _ok(h.lambda_handler(_evento(_foto_placa()), None))
    assert h.s3.descargas.count(("bucket-modelos", "placa/fake_placa.onnx")) == 1


def _comprobar_respaldo(cuerpo, modelo_placa):
    validar_contrato(cuerpo)
    assert cuerpo["area_base"] == "foto"
    assert cuerpo["area_corroida_pct"] == cuerpo["area_corroida_pct_foto"]
    assert cuerpo["contorno_placa"] is None
    assert cuerpo["modelo_placa"] == modelo_placa


def test_respaldo_a_la_foto_si_el_separador_no_encuentra_placa(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    _poner_placa(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento(_foto_placa(con_placa=False)), None))
    _comprobar_respaldo(cuerpo, "placa:fake_placa.onnx")
    assert cuerpo["placa_pct_foto"] == 0.0


def test_respaldo_a_la_foto_si_la_placa_es_minuscula(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    _poner_placa(h, monkeypatch, tmp_path)
    arr = np.full((480, 640, 3), 100, np.uint8)
    arr[100:140, 100:180] = (220, 200, 40)  # 1 % de la foto: < MIN_PLACA_PCT_FOTO
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    cuerpo = _ok(h.lambda_handler(_evento(buf.getvalue()), None))
    _comprobar_respaldo(cuerpo, "placa:fake_placa.onnx")
    assert 0 < cuerpo["placa_pct_foto"] < 3.0
    assert cuerpo["area_corroida_pct"] == pytest.approx(1.04, abs=0.3)


def test_respaldo_a_la_foto_si_el_modelo_de_placa_no_se_descarga(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    monkeypatch.setenv("PLATE_MODEL_KEY", "placa/no_existe.onnx")  # el doble de S3 lanza
    model_store.reiniciar_cache()
    cuerpo = _ok(h.lambda_handler(_evento(_foto_placa()), None))
    _comprobar_respaldo(cuerpo, None)
    assert cuerpo["placa_pct_foto"] is None
    assert cuerpo["area_corroida_pct"] == pytest.approx(22.9, abs=2.0)


def test_respaldo_a_la_foto_si_el_onnx_de_placa_esta_corrupto(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    malo = tmp_path / "malo.onnx"
    malo.write_bytes(b"no es un onnx")
    monkeypatch.setenv("PLATE_MODEL_LOCAL_PATH", str(malo))
    model_store.reiniciar_cache()
    cuerpo = _ok(h.lambda_handler(_evento(_foto_placa()), None))
    _comprobar_respaldo(cuerpo, None)


def test_sin_separador_configurado_el_contrato_no_cambia(h, monkeypatch, tmp_path):
    _poner_unet(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento(_foto_placa()), None))
    assert not CAMPOS_PLACA & set(cuerpo)
    assert cuerpo["area_corroida_pct"] == pytest.approx(22.9, abs=2.0)
    assert not [d for d in h.s3.descargas if d[1].startswith("placa/")]
    assert not CAMPOS_PLACA & set(h.tabla_mediciones.escritos[0])


def test_yolo_ignora_el_separador(h, monkeypatch, tmp_path):
    _poner_yolo(h, monkeypatch, tmp_path)
    _poner_placa(h, monkeypatch, tmp_path)
    cuerpo = _ok(h.lambda_handler(_evento(_foto_placa()), None))
    validar_contrato(cuerpo)
    assert not CAMPOS_PLACA & set(cuerpo)
    assert cuerpo["modelo"].startswith("yolo:")
    assert not [d for d in h.s3.descargas if d[1].startswith("placa/")]
