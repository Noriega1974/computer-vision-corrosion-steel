"""yolo_model: letterbox, NMS, máscaras y % sobre la foto SIN el relleno."""
import numpy as np
import pytest
from PIL import Image

import modelo_falso_onnx
import yolo_model as ym

onnx = pytest.importorskip("onnx")
ort = pytest.importorskip("onnxruntime")


def _sesion(tmp_path, **kw):
    ruta = modelo_falso_onnx.construir_yolo(tmp_path / "fake_yolo.onnx", **kw)
    return ort.InferenceSession(str(ruta), providers=["CPUExecutionProvider"])


# ── Letterbox ────────────────────────────────────────────────────────────────

def test_letterbox_horizontal_centra_vertical_con_relleno_114():
    x, lb = ym.letterbox(Image.new("RGB", (640, 480), (255, 0, 0)))
    assert (lb["nw"], lb["nh"], lb["left"], lb["top"]) == (1024, 768, 0, 128)
    assert x.shape == (1, 3, 1024, 1024) and x.dtype == np.float32
    assert x[0, 0, 128, 0] == pytest.approx(1.0) and x[0, 1, 128, 0] == pytest.approx(0.0)  # foto
    assert x[0, :, 0, :].min() == pytest.approx(114 / 255) and x[0, :, 0, :].max() == pytest.approx(114 / 255)
    assert x[0, 0, 1023, 5] == pytest.approx(114 / 255)  # relleno inferior


def test_letterbox_vertical_centra_horizontal():
    _, lb = ym.letterbox(Image.new("RGB", (480, 640)))
    assert (lb["nw"], lb["nh"], lb["left"], lb["top"]) == (768, 1024, 128, 0)


def test_letterbox_redondeo_como_ultralytics():
    # 1365x2048 (valid del dataset): r=0.5 -> 682.5 -> round() banquero = 682 (igual que Ultralytics)
    _, lb = ym.letterbox(Image.new("RGB", (1365, 2048)))
    assert lb["nw"] == int(round(1365 * 0.5)) == 682 and lb["nh"] == 1024
    assert lb["left"] == int(round((1024 - 682) / 2 - 0.1)) == 171 and lb["top"] == 0


def test_letterbox_reduccion_x2_es_promedio_2x2_como_cv2_linear():
    rng = np.random.default_rng(0)
    arr = rng.integers(0, 256, (1536, 2048, 3), dtype=np.uint8)  # 4:3 -> 1024x768, factor exacto 2
    x, lb = ym.letterbox(Image.fromarray(arr))
    ref = arr.reshape(768, 2, 1024, 2, 3).astype(np.float32).mean(axis=(1, 3)) / 255.0
    np.testing.assert_allclose(x[0, :, 128:896, :].transpose(1, 2, 0), ref, atol=1.5 / 255)


# ── NMS ──────────────────────────────────────────────────────────────────────

def test_nms_descarta_solapadas_y_conserva_la_de_mayor_confianza():
    cajas = np.array([[0, 0, 100, 100], [5, 5, 105, 105], [300, 300, 400, 400]], np.float32)
    conf = np.array([0.5, 0.9, 0.3], np.float32)
    assert ym.nms(cajas, conf, 0.7) == [1, 2]
    assert ym.nms(cajas, conf, 0.99) == [1, 0, 2]  # IoU 0.82 <= 0.99: ninguna se suprime


# ── Postprocesamiento sobre el modelo de juguete ─────────────────────────────

def _correr(tmp_path, foto, cfg=None, **kw):
    x, lb = ym.letterbox(foto)
    sesion = _sesion(tmp_path, **kw)
    salidas = sesion.run(None, {sesion.get_inputs()[0].name: x})
    return ym.postprocesar(salidas, lb, cfg)


def test_area_sobre_la_foto_completa(tmp_path):
    # (+-0.5 pp: el recorte a la caja se hace a resolución del prototipo y luego se sube
    # con bilinear, igual que Ultralytics: el borde crece ~2 px del lienzo por lado)
    # foto 640x480 -> lienzo con relleno arriba y abajo (128 px). Caja en el lienzo: 400x200 px.
    r = _correr(tmp_path, Image.new("RGB", (640, 480)), caja_xyxy=(200, 300, 600, 500))
    assert r["area_corroida_pct"] == pytest.approx(400 * 200 / (1024 * 768) * 100, abs=0.5)
    assert len(r["detecciones"]) == len(r["mascaras"]) == 1
    d = r["detecciones"][0]  # coordenadas normalizadas de la FOTO, no del lienzo
    assert d["x"] == pytest.approx(400 / 1024, abs=1e-3) and d["w"] == pytest.approx(400 / 1024, abs=1e-3)
    assert d["y"] == pytest.approx((400 - 128) / 768, abs=1e-3) and d["h"] == pytest.approx(200 / 768, abs=1e-3)
    assert d["confianza"] == pytest.approx(0.9) and r["confianza_promedio"] == pytest.approx(0.9)
    xs = [p["x"] for p in r["mascaras"][0]["puntos"]]
    ys = [p["y"] for p in r["mascaras"][0]["puntos"]]
    assert min(xs) == pytest.approx(200 / 1024, abs=5e-3) and max(xs) == pytest.approx(600 / 1024, abs=5e-3)
    assert min(ys) == pytest.approx((300 - 128) / 768, abs=5e-3) and max(ys) == pytest.approx((500 - 128) / 768, abs=5e-3)


def test_el_relleno_del_letterbox_no_cuenta_en_el_porcentaje(tmp_path):
    # Caja y in [0, 256): solo 128 px (256-128) caen sobre la foto, el resto es relleno.
    r = _correr(tmp_path, Image.new("RGB", (640, 480)), caja_xyxy=(0, 0, 1024, 256))
    correcto = (256 - 128) / 768 * 100          # 16.67 % de la foto
    sobre_el_lienzo = 256 / 1024 * 100          # 25 %: lo que saldría si se contara el relleno
    assert r["area_corroida_pct"] == pytest.approx(correcto, abs=0.5)
    assert abs(r["area_corroida_pct"] - sobre_el_lienzo) > 5
    for p in r["mascaras"][0]["puntos"]:
        assert 0.0 <= p["x"] <= 1.0 and 0.0 <= p["y"] <= 1.0


def test_foto_vertical_tambien_excluye_el_relleno_lateral(tmp_path):
    # foto 480x640 -> relleno izq/der de 128 px. Caja x in [0, 256): 128 px sobre la foto.
    r = _correr(tmp_path, Image.new("RGB", (480, 640)), caja_xyxy=(0, 0, 256, 1024))
    assert r["area_corroida_pct"] == pytest.approx((256 - 128) / 768 * 100, abs=0.5)


def test_umbral_de_confianza_es_estricto_y_viene_del_entorno(tmp_path):
    foto = Image.new("RGB", (640, 480))
    assert _correr(tmp_path, foto, {**ym.configuracion(), "conf": 0.95}, conf=0.9)["detecciones"] == []
    assert len(_correr(tmp_path, foto, {**ym.configuracion(), "conf": 0.5}, conf=0.9)["detecciones"]) == 1


def test_configuracion_por_defecto_y_variables(monkeypatch):
    for k in ("CONF_MINIMA", "YOLO_IOU", "YOLO_MAX_DET"):
        monkeypatch.delenv(k, raising=False)
    assert ym.configuracion() == {"conf": 0.25, "iou": 0.7, "max_det": 1000}
    monkeypatch.setenv("CONF_MINIMA", "0.4")
    assert ym.configuracion()["conf"] == 0.4


def test_max_det_y_nms_sobre_detecciones_reales(tmp_path):
    # tres cajas: dos casi iguales (NMS deja una) y una separada
    extra = [(205, 305, 605, 505, 0.6), (700, 600, 800, 700, 0.8)]
    r = _correr(tmp_path, Image.new("RGB", (640, 480)), caja_xyxy=(200, 300, 600, 500), extra=extra)
    assert len(r["detecciones"]) == 2
    r1 = _correr(tmp_path, Image.new("RGB", (640, 480)), {**ym.configuracion(), "max_det": 1},
                 caja_xyxy=(200, 300, 600, 500), extra=extra)
    assert len(r1["detecciones"]) == 1


def test_sin_detecciones(tmp_path):
    r = _correr(tmp_path, Image.new("RGB", (640, 480)), conf=0.1)
    assert r == {"area_corroida_pct": 0.0, "confianza_promedio": 0.0, "detecciones": [], "mascaras": []}


def test_casco_convexo_usa_solo_extremos_de_fila():
    m = np.zeros((50, 50), bool)
    m[10:30, 5:40] = True
    c = ym.casco_convexo(m)
    assert sorted(map(tuple, c.tolist())) == [(5, 10), (5, 29), (39, 10), (39, 29)]
    assert ym.casco_convexo(np.zeros((5, 5), bool)) is None
    un_pixel = np.zeros((5, 5), bool)
    un_pixel[2, 2] = True
    assert ym.casco_convexo(un_pixel) is None
