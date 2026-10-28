"""mask_polygons: componentes conexas, contornos y simplificación (numpy puro).

Las pruebas contra OpenCV son la referencia de equivalencia con
method_unet.py (que usa cv2); se omiten si cv2 no está instalado, porque la
Lambda NO lo lleva (no cabe en la capa).
"""
import numpy as np
import pytest

import mask_polygons as mp

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None
necesita_cv2 = pytest.mark.skipif(cv2 is None, reason="cv2 no instalado (solo referencia de prueba)")


def _contornos(mascara, prob=None):
    prob = np.where(mascara, 0.9, 0.1).astype(np.float32) if prob is None else prob
    comps = mp.analizar_componentes(mascara, prob)
    plano, ancho = mp.preparar_plano(mascara)
    return comps, [mp.contorno_externo(plano, ancho, c["inicio"]) for c in comps]


def _area_poligono(pts):
    x, y = pts[:, 0].astype(float), pts[:, 1].astype(float)
    return abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2


def test_mascara_vacia_no_tiene_componentes():
    assert mp.analizar_componentes(np.zeros((20, 20), bool), np.zeros((20, 20), np.float32)) == []


def test_rectangulo_area_caja_y_contorno():
    m = np.zeros((30, 40), bool)
    m[5:15, 10:30] = True
    comps, conts = _contornos(m)
    assert len(comps) == 1
    c = comps[0]
    assert (c["area"], c["x0"], c["y0"], c["x1"], c["y1"]) == (200, 10, 5, 30, 15)
    assert c["inicio"] == (10, 5)
    assert c["prob_media"] == pytest.approx(0.9)
    # el contorno pasa por los píxeles del borde: 2*(20+10)-4 = 56
    assert len(conts[0]) == 56
    assert _area_poligono(conts[0]) == pytest.approx(19 * 9)


def test_conectividad_8_une_diagonales_y_4_no_aplica():
    m = np.zeros((10, 10), bool)
    m[2, 2] = m[3, 3] = m[4, 4] = True  # solo se tocan en diagonal
    comps = mp.analizar_componentes(m, np.ones((10, 10), np.float32))
    assert len(comps) == 1 and comps[0]["area"] == 3


def test_componentes_separadas_y_orden_por_area():
    m = np.zeros((30, 30), bool)
    m[1:4, 1:4] = True       # 9 px
    m[10:20, 10:20] = True   # 100 px
    m[25:27, 5:8] = True     # 6 px
    comps = mp.analizar_componentes(m, np.ones((30, 30), np.float32))
    assert [c["area"] for c in comps] == [100, 9, 6]


def test_forma_en_u_se_une_por_abajo():
    m = np.zeros((20, 20), bool)
    m[2:15, 2:5] = True
    m[2:15, 10:13] = True
    m[12:15, 2:13] = True  # une las dos patas
    comps, _ = _contornos(m)
    assert len(comps) == 1


def test_anillo_solo_contorno_externo_y_area_cuenta_el_agujero_como_fondo():
    m = np.zeros((30, 30), bool)
    m[5:25, 5:25] = True
    m[10:20, 10:20] = False
    comps, conts = _contornos(m)
    assert len(comps) == 1 and comps[0]["area"] == 400 - 100
    assert len(conts[0]) == 4 * 19  # solo el borde externo, no el del agujero


def test_pixel_aislado():
    m = np.zeros((5, 5), bool)
    m[2, 3] = True
    comps, conts = _contornos(m)
    assert comps[0]["area"] == 1
    assert conts[0].tolist() == [[3, 2]]


def test_prob_media_por_componente():
    m = np.zeros((10, 10), bool)
    m[1:3, 1:3] = True
    m[6:8, 6:8] = True
    prob = np.zeros((10, 10), np.float32)
    prob[1:3, 1:3] = 0.6
    prob[6:8, 6:8] = 0.8
    comps = mp.analizar_componentes(m, prob)
    por_inicio = {c["inicio"]: c["prob_media"] for c in comps}
    assert por_inicio[(1, 1)] == pytest.approx(0.6, abs=1e-6)
    assert por_inicio[(6, 6)] == pytest.approx(0.8, abs=1e-6)


def test_rdp_reduce_rectangulo_a_4_vertices():
    m = np.zeros((30, 40), bool)
    m[5:15, 10:30] = True
    _, conts = _contornos(m)
    s = mp.simplificar_cerrado(conts[0], 1.0)
    assert len(s) == 4
    assert _area_poligono(s) == pytest.approx(19 * 9)


def test_rdp_conserva_forma_circular_dentro_de_tolerancia():
    yy, xx = np.mgrid[:101, :101]
    m = (yy - 50) ** 2 + (xx - 50) ** 2 <= 40 ** 2
    _, conts = _contornos(m)
    s = mp.simplificar_cerrado(conts[0], 1.5)
    assert 8 < len(s) < len(conts[0]) / 3
    assert _area_poligono(s) == pytest.approx(_area_poligono(conts[0]), rel=0.03)


def _mascara_aleatoria(semilla, forma=(160, 200), umbral=0.5):
    rng = np.random.default_rng(semilla)
    ruido = rng.random(forma).astype(np.float32)
    # suavizado con filtro de caja para obtener manchas orgánicas
    k = 9
    acum = np.cumsum(np.cumsum(np.pad(ruido, k // 2, mode="edge"), 0), 1)
    acum = np.pad(acum, ((1, 0), (1, 0)))
    suave = (acum[k:, k:] - acum[:-k, k:] - acum[k:, :-k] + acum[:-k, :-k])[: forma[0], : forma[1]] / (k * k)
    return suave > (np.median(suave) + 0.0 * umbral), suave


@necesita_cv2
@pytest.mark.parametrize("semilla", [0, 1, 2, 3, 4])
def test_equivale_a_opencv_en_manchas_organicas(semilla):
    mascara, prob = _mascara_aleatoria(semilla)
    m8 = mascara.astype(np.uint8)

    n_cv, _, stats, _ = cv2.connectedComponentsWithStats(m8, connectivity=8)
    comps, conts = _contornos(mascara, prob.astype(np.float32))
    assert len(comps) == n_cv - 1
    assert sorted(c["area"] for c in comps) == sorted(int(a) for a in stats[1:, cv2.CC_STAT_AREA])

    cs_cv, _ = cv2.findContours(m8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    # Diferencia a propósito: RETR_EXTERNAL de cv2 descarta las "islas" que
    # quedan dentro del agujero de otra mancha; aquí se conservan (son
    # corrosión real, y method_unet las perdería). Por eso cv2 puede tener
    # algunas menos, nunca más.
    assert len(cs_cv) <= len(conts)
    # Las que sobran respecto a cv2 son exactamente las islas: componentes
    # cuyo píxel de inicio cae dentro del relleno de un contorno externo ajeno.
    relleno = np.zeros(m8.shape, np.uint8)
    cv2.drawContours(relleno, cs_cv, -1, 1, thickness=cv2.FILLED)
    refs_set = {frozenset(map(tuple, c.reshape(-1, 2).tolist())) for c in cs_cv}
    extra = [c for c, k in zip(comps, conts) if frozenset(map(tuple, k.tolist())) not in refs_set]
    assert len(extra) == len(conts) - len(cs_cv)
    assert all(relleno[c["inicio"][1], c["inicio"][0]] for c in extra)
    # Todo contorno de cv2 aparece idéntico (mismos píxeles de borde; el
    # punto de partida y el orden pueden variar) entre los míos.
    mios = {frozenset(map(tuple, c.tolist())) for c in conts}
    refs = {frozenset(map(tuple, c.reshape(-1, 2).tolist())) for c in cs_cv}
    assert refs <= mios
