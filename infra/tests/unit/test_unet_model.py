"""unet_model: preprocesamiento y postprocesamiento (la descarga del modelo
está en test_model_store.py)."""
import numpy as np
import pytest
from PIL import Image

import unet_model as um


# ── Preprocesamiento ─────────────────────────────────────────────────────────

def test_preparar_entrada_horizontal():
    img = Image.new("RGB", (200, 100), (255, 0, 0))
    x, w, h = um.preparar_entrada(img)
    assert (w, h) == (1024, 512)
    assert x.shape == (1, 3, 1024, 1024) and x.dtype == np.float32
    # foto arriba-izquierda: canal R rojo puro normalizado ImageNet
    assert x[0, 0, 0, 0] == pytest.approx((1.0 - 0.485) / 0.229, abs=1e-5)
    assert x[0, 1, 0, 0] == pytest.approx((0.0 - 0.456) / 0.224, abs=1e-5)
    # relleno ~ media ImageNet -> ~0 tras normalizar
    assert np.abs(x[0, :, 600:, :]).max() < 0.02


def test_preparar_entrada_vertical_y_redondeo_como_method_unet():
    img = Image.new("RGB", (333, 1000), (10, 20, 30))
    _, w, h = um.preparar_entrada(img)
    s = 1024 / 1000
    assert (w, h) == (max(1, round(333 * s)), 1024)


def test_preparar_entrada_usa_box_como_el_entrenamiento():
    rng = np.random.default_rng(0)
    arr = rng.integers(0, 256, (300, 500, 3), dtype=np.uint8)
    x, w, h = um.preparar_entrada(Image.fromarray(arr))
    ref = np.asarray(Image.fromarray(arr).resize((w, h), Image.BOX)).astype(np.float32) / 255.0
    ref = (ref - um.MEAN) / um.STD
    np.testing.assert_allclose(x[0, :, :h, :w].transpose(1, 2, 0), ref, atol=1e-6)


def test_sigmoide_estable():
    v = um.sigmoide(np.array([-1e4, 0.0, 1e4], dtype=np.float32))
    assert v.tolist() == pytest.approx([0.0, 0.5, 1.0], abs=1e-6)


# ── Postprocesamiento ────────────────────────────────────────────────────────

def _prob(rectangulos, w=1024, h=512, valor=0.9):
    p = np.full((um.SIZE, um.SIZE), 0.05, np.float32)
    p[h:, :] = 0.99  # el relleno del lienzo NUNCA debe contar
    for x0, y0, x1, y1 in rectangulos:
        p[y0:y1, x0:x1] = valor
    return p


def test_postprocesar_sin_corrosion():
    r = um.postprocesar(_prob([]), 1024, 512)
    assert r == {"area_corroida_pct": 0.0, "confianza_promedio": 0.0, "detecciones": [], "mascaras": []}


def test_postprocesar_un_rectangulo():
    r = um.postprocesar(_prob([(100, 50, 300, 150)]), 1024, 512)
    # 200x100 px sobre una foto de 1024x512 (el relleno no cuenta)
    assert r["area_corroida_pct"] == pytest.approx(200 * 100 / (1024 * 512) * 100, abs=0.01)
    assert len(r["detecciones"]) == len(r["mascaras"]) == 1
    d = r["detecciones"][0]
    assert d["clase"] == "corrosion"
    assert d["confianza"] == pytest.approx(0.9, abs=1e-4)
    assert r["confianza_promedio"] == pytest.approx(0.9, abs=1e-4)
    assert (d["x"], d["y"], d["w"], d["h"]) == (
        pytest.approx(200 / 1024, abs=1e-4), pytest.approx(100 / 512, abs=1e-4),
        pytest.approx(200 / 1024, abs=1e-4), pytest.approx(100 / 512, abs=1e-4))
    pts = r["mascaras"][0]["puntos"]
    assert len(pts) == 4  # el rectángulo se simplifica a 4 vértices
    assert all(0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 for p in pts)


def test_postprocesar_descarta_motas_y_respeta_umbral():
    p = _prob([(10, 10, 14, 14), (100, 100, 200, 200)])  # 16 px y 10000 px
    r = um.postprocesar(p, 1024, 512, {**um.configuracion(), "min_area_px": 25})
    assert len(r["detecciones"]) == 1
    # el área SÍ cuenta la mota (máscara completa)
    assert r["area_corroida_pct"] == pytest.approx((10000 + 16) / (1024 * 512) * 100, abs=0.01)
    r2 = um.postprocesar(p, 1024, 512, {**um.configuracion(), "umbral": 0.95})
    assert r2["detecciones"] == [] and r2["area_corroida_pct"] == 0.0


def test_postprocesar_confianza_por_componente_y_orden_por_area():
    p = _prob([(10, 10, 60, 60)], valor=0.6)
    p[200:400, 200:400] = 0.8
    r = um.postprocesar(p, 1024, 512)
    assert [round(d["confianza"], 2) for d in r["detecciones"]] == [0.8, 0.6]  # mayor área primero
    assert r["confianza_promedio"] == pytest.approx(0.7, abs=1e-4)


def test_postprocesar_respeta_tope_de_puntos_y_componentes():
    rng = np.random.default_rng(3)
    yy, xx = np.mgrid[:512, :1024]
    p = np.full((um.SIZE, um.SIZE), 0.05, np.float32)
    for _ in range(60):  # 60 círculos irregulares
        cy, cx, r = rng.integers(30, 480), rng.integers(30, 990), rng.integers(8, 28)
        borde = r + rng.normal(0, 1.5, (512, 1024))
        p[:512, :1024][(yy - cy) ** 2 + (xx - cx) ** 2 <= borde ** 2] = 0.9
    cfg = {**um.configuracion(), "max_puntos": 300, "max_componentes": 40}
    r = um.postprocesar(p, 1024, 512, cfg)
    assert 0 < len(r["mascaras"]) <= 40
    assert sum(len(m["puntos"]) for m in r["mascaras"]) <= 300
    assert all(len(m["puntos"]) >= 3 for m in r["mascaras"])
