"""placa_model: preprocesamiento y postprocesamiento del separador de placa
(el modelo y la sesión se prueban en test_model_store.py y test_handler_placa.py)."""
import numpy as np
import pytest
from PIL import Image

import placa_model as pm

NEGRO = (0.0 - pm.MEAN.reshape(3)) / pm.STD.reshape(3)  # relleno normalizado


# ── Preprocesamiento ─────────────────────────────────────────────────────────

def test_preparar_entrada_forma_dtype_y_tamano_reescalado():
    x, w, h = pm.preparar_entrada(Image.new("RGB", (200, 100), (255, 0, 0)))
    assert (w, h) == (512, 256)
    assert x.shape == (1, 3, 512, 512) and x.dtype == np.float32
    assert x.flags["C_CONTIGUOUS"]
    _, w2, h2 = pm.preparar_entrada(Image.new("RGB", (333, 1000), (1, 2, 3)))
    assert (w2, h2) == (round(333 * 0.512), 512)


def test_preparar_entrada_foto_arriba_izquierda_normalizada_imagenet():
    x, _, _ = pm.preparar_entrada(Image.new("RGB", (200, 100), (255, 0, 0)))
    assert x[0, 0, 0, 0] == pytest.approx((1.0 - 0.485) / 0.229, abs=1e-5)
    assert x[0, 1, 0, 0] == pytest.approx((0.0 - 0.456) / 0.224, abs=1e-5)


def test_preparar_entrada_relleno_es_negro_normalizado():
    # Horizontal: relleno abajo. Vertical: relleno a la derecha.
    x, w, h = pm.preparar_entrada(Image.new("RGB", (200, 100), (255, 255, 255)))
    for c in range(3):
        assert np.all(x[0, c, h:, :] == pytest.approx(NEGRO[c], abs=1e-6))
    x, w, h = pm.preparar_entrada(Image.new("RGB", (100, 200), (255, 255, 255)))
    for c in range(3):
        assert np.all(x[0, c, :, w:] == pytest.approx(NEGRO[c], abs=1e-6))
    # el relleno NO es la media ImageNet (eso sería 0 tras normalizar)
    assert NEGRO[0] == pytest.approx(-2.1179, abs=1e-3)


def test_preparar_entrada_usa_bilineal_como_la_validacion():
    rng = np.random.default_rng(0)
    arr = rng.integers(0, 256, (300, 500, 3), dtype=np.uint8)
    x, w, h = pm.preparar_entrada(Image.fromarray(arr))
    ref = np.asarray(Image.fromarray(arr).resize((w, h), Image.BILINEAR)).astype(np.float32) / 255.0
    ref = (ref - pm.MEAN) / pm.STD
    np.testing.assert_allclose(x[0, :, :h, :w].transpose(1, 2, 0), ref, atol=1e-6)


# ── Postprocesamiento ────────────────────────────────────────────────────────

def test_postprocesar_umbral_cero_recorta_el_relleno_y_deja_la_componente_mayor():
    lg = np.full((512, 512), -3.0, np.float32)
    lg[100:200, 100:300] = 2.0        # 20000 px: la placa
    lg[10:20, 400:410] = 5.0          # 100 px: mota suelta
    lg[300:, :] = 9.0                 # relleno del lienzo (h=256): NUNCA cuenta
    lg[0, 0] = 0.0                    # logit == 0 no es placa (estrictamente > 0)
    m = pm.postprocesar(lg, 512, 256)
    assert m.shape == (256, 512) and m.dtype == bool
    esperado = np.zeros((256, 512), bool)
    esperado[100:200, 100:300] = True
    assert (m == esperado).all()


def test_postprocesar_sin_placa_devuelve_mascara_vacia():
    m = pm.postprocesar(np.full((512, 512), -1.0, np.float32), 512, 384)
    assert m.shape == (384, 512) and not m.any()


def test_contorno_rectangulo_normalizado_y_simplificado():
    m = np.zeros((200, 400), bool)
    m[40:160, 80:320] = True
    c = pm.contorno(m)
    pts = c["puntos"]
    assert len(pts) == 4
    assert all(set(p) == {"x", "y"} and 0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 for p in pts)
    xs, ys = [p["x"] for p in pts], [p["y"] for p in pts]
    assert (min(xs), max(xs)) == (pytest.approx(80.5 / 400, abs=1e-3), pytest.approx(319.5 / 400, abs=1e-3))
    assert (min(ys), max(ys)) == (pytest.approx(40.5 / 200, abs=1e-3), pytest.approx(159.5 / 200, abs=1e-3))


def test_contorno_respeta_el_tope_de_puntos_y_vacio_es_none():
    yy, xx = np.mgrid[:400, :400]
    r = 150 + 12 * np.sin(np.arctan2(yy - 200, xx - 200) * 40)  # borde muy rugoso
    m = (yy - 200) ** 2 + (xx - 200) ** 2 <= r ** 2
    assert 3 <= len(pm.contorno(m)["puntos"]) <= pm.MAX_PUNTOS
    assert pm.contorno(np.zeros((20, 20), bool)) is None


def test_remuestrear_vecino_mas_cercano():
    m = np.zeros((4, 8), bool)
    m[:, :4] = True
    r = pm.remuestrear(m, 16, 8)
    assert r.shape == (8, 16) and r.dtype == bool
    assert r[:, :8].all() and not r[:, 8:].any()
    assert pm.remuestrear(m, 8, 4) is m
