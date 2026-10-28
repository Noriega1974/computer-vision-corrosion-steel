"""
Máscara binaria -> componentes conexas -> polígonos, solo con numpy.

La capa de la Lambda solo trae numpy, Pillow y onnxruntime. OpenCV
(`findContours`) no cabe: opencv-python-headless descomprimido pesa ~136 MB y
la capa actual ya ocupa ~131 MB contra el límite de 250 MB de Lambda. Por eso
este módulo reimplementa lo mínimo que hace `method_unet.py` con cv2:

  * componentes conexas con conectividad 8 (cv2.connectedComponents),
    por corridas (runs) de píxeles + union-find: O(corridas), no O(píxeles);
  * contorno externo de cada componente (cv2.findContours, RETR_EXTERNAL),
    por seguimiento de borde de Moore;
  * simplificación Ramer-Douglas-Peucker (cv2.approxPolyDP).

No importa boto3, PIL ni onnxruntime: se puede probar aislado.
"""
from __future__ import annotations

import numpy as np

# Direcciones en sentido horario (coordenadas de imagen, y hacia abajo):
# E, SE, S, SO, O, NO, N, NE.
_DX = (1, 1, 0, -1, -1, -1, 0, 1)
_DY = (0, 1, 1, 1, 0, -1, -1, -1)
_INDICE_DIR = {(dx, dy): i for i, (dx, dy) in enumerate(zip(_DX, _DY))}


def _corridas(mascara: np.ndarray):
    """Corridas horizontales de True. Devuelve (y, inicio, fin_exclusivo),
    ordenadas por fila y luego por columna."""
    alto, ancho = mascara.shape
    relleno = np.zeros((alto, ancho + 2), dtype=np.int8)
    relleno[:, 1:-1] = mascara
    d = np.diff(relleno, axis=1)
    ys, xs_ini = np.nonzero(d == 1)
    _, xs_fin = np.nonzero(d == -1)
    return ys, xs_ini, xs_fin


def _raiz(padre: list[int], i: int) -> int:
    while padre[i] != i:
        padre[i] = padre[padre[i]]
        i = padre[i]
    return i


def analizar_componentes(mascara: np.ndarray, probabilidad: np.ndarray) -> list[dict]:
    """Componentes conexas (8-conectividad) de `mascara` (bool HxW).

    Por componente devuelve: area (px), x0,y0,x1,y1 (caja, fin exclusivo),
    prob_media (media de `probabilidad` sobre sus píxeles) e `inicio`
    (x, y) = píxel más arriba y a la izquierda (siempre es borde).
    Ordenadas de mayor a menor área.
    """
    alto, _ = mascara.shape
    ys, ini, fin = _corridas(mascara)
    n = len(ys)
    if n == 0:
        return []

    # Índice del primer run de cada fila (ys está ordenado).
    inicio_fila = np.searchsorted(ys, np.arange(alto + 1)).tolist()
    ini_l, fin_l = ini.tolist(), fin.tolist()

    padre = list(range(n))
    for fila in range(alto - 1):
        i, i_fin = inicio_fila[fila], inicio_fila[fila + 1]
        j, j_fin = inicio_fila[fila + 1], inicio_fila[fila + 2]
        while i < i_fin and j < j_fin:
            # 8-conectividad: [ini_i, fin_i) y [ini_j, fin_j) se tocan
            # (incluso en diagonal) si ini_i <= fin_j y ini_j <= fin_i.
            if ini_l[i] <= fin_l[j] and ini_l[j] <= fin_l[i]:
                ri, rj = _raiz(padre, i), _raiz(padre, j)
                if ri != rj:
                    padre[rj] = ri
            if fin_l[i] <= fin_l[j]:
                i += 1
            else:
                j += 1

    raices = np.array([_raiz(padre, k) for k in range(n)])
    # np.unique devuelve (valores, primer_índice, inverso): el primer índice
    # de cada raíz es el primer run (arriba-izquierda) de su componente.
    _, primera, etiqueta = np.unique(raices, return_index=True, return_inverse=True)
    etiqueta = etiqueta.ravel()
    ncomp = len(primera)

    largo = (fin - ini).astype(np.float64)
    acum = np.zeros((alto, mascara.shape[1] + 1), dtype=np.float64)
    np.cumsum(probabilidad, axis=1, dtype=np.float64, out=acum[:, 1:])
    suma_prob_run = acum[ys, fin] - acum[ys, ini]

    area = np.bincount(etiqueta, weights=largo, minlength=ncomp)
    suma_prob = np.bincount(etiqueta, weights=suma_prob_run, minlength=ncomp)
    x0 = np.full(ncomp, np.iinfo(np.int64).max)
    y0 = np.full(ncomp, np.iinfo(np.int64).max)
    x1 = np.zeros(ncomp, dtype=np.int64)
    y1 = np.zeros(ncomp, dtype=np.int64)
    np.minimum.at(x0, etiqueta, ini)
    np.minimum.at(y0, etiqueta, ys)
    np.maximum.at(x1, etiqueta, fin)
    np.maximum.at(y1, etiqueta, ys + 1)

    comps = []
    for c in range(ncomp):
        k = primera[c]  # primer run en orden fila-columna = arriba-izquierda
        comps.append({
            "area": int(area[c]),
            "x0": int(x0[c]), "y0": int(y0[c]), "x1": int(x1[c]), "y1": int(y1[c]),
            "prob_media": float(suma_prob[c] / area[c]),
            "inicio": (int(ini[k]), int(ys[k])),
        })
    comps.sort(key=lambda d: -d["area"])
    return comps


def preparar_plano(mascara: np.ndarray) -> tuple[bytes, int]:
    """Máscara con 1 px de borde de ceros, aplanada a bytes (acceso rápido
    desde Python). Devuelve (bytes, ancho_con_borde)."""
    alto, ancho = mascara.shape
    p = np.zeros((alto + 2, ancho + 2), dtype=np.uint8)
    p[1:-1, 1:-1] = mascara
    return p.tobytes(), ancho + 2


def contorno_externo(plano: bytes, ancho_p: int, inicio: tuple[int, int]) -> np.ndarray:
    """Borde externo (seguimiento de Moore) de la componente que contiene el
    píxel `inicio` = (x, y), que debe ser su píxel más arriba y a la
    izquierda. Devuelve (K, 2) de (x, y) en píxeles, en sentido horario."""
    sx, sy = inicio[0] + 1, inicio[1] + 1  # coordenadas con borde
    cx, cy = sx, sy
    b = 4  # el vecino oeste es fondo (es el más a la izquierda de su fila)
    pts = [(cx, cy)]
    primero = None
    limite = 4 * len(plano) + 16
    for _ in range(limite):
        for k in range(1, 9):
            d = (b + k) % 8
            nx, ny = cx + _DX[d], cy + _DY[d]
            if plano[ny * ancho_p + nx]:
                break
        else:
            break  # píxel aislado
        if primero is None:
            primero = (nx, ny)
        elif (cx, cy) == (sx, sy) and (nx, ny) == primero:
            break  # cerró el ciclo (criterio de Jacob)
        # nuevo "backtrack": el vecino fondo examinado justo antes de n.
        d_prev = (d - 1) % 8
        px, py = cx + _DX[d_prev], cy + _DY[d_prev]
        cx, cy = nx, ny
        b = _INDICE_DIR[(px - cx, py - cy)]
        pts.append((cx, cy))
    if len(pts) > 1 and pts[-1] == pts[0]:
        pts.pop()
    return np.array(pts, dtype=np.int64) - 1


def _rdp(pts: np.ndarray, eps: float) -> np.ndarray:
    """Ramer-Douglas-Peucker sobre una polilínea abierta; devuelve la máscara
    de puntos conservados."""
    n = len(pts)
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    pila = [(0, n - 1)]
    while pila:
        i, j = pila.pop()
        if j <= i + 1:
            continue
        a, b = pts[i], pts[j]
        seg = pts[i + 1:j]
        ab = b - a
        norma = float(np.hypot(ab[0], ab[1]))
        if norma == 0.0:
            dist = np.hypot(seg[:, 0] - a[0], seg[:, 1] - a[1])
        else:
            dist = np.abs(ab[0] * (seg[:, 1] - a[1]) - ab[1] * (seg[:, 0] - a[0])) / norma
        k = int(np.argmax(dist))
        if dist[k] > eps:
            m = i + 1 + k
            keep[m] = True
            pila.append((i, m))
            pila.append((m, j))
    return keep


def simplificar_cerrado(contorno: np.ndarray, eps: float) -> np.ndarray:
    """RDP para un contorno cerrado: se parte en el punto 0 y el más lejano
    a él. Devuelve (M, 2) con M >= 3 cuando el contorno original tenía >= 3
    puntos distintos."""
    n = len(contorno)
    if n <= 3 or eps <= 0:
        return contorno
    pts = contorno.astype(np.float64)
    dist0 = np.hypot(pts[:, 0] - pts[0, 0], pts[:, 1] - pts[0, 1])
    m = int(np.argmax(dist0))
    if m == 0:
        return contorno[:1]
    mitad1 = pts[: m + 1]
    mitad2 = np.vstack([pts[m:], pts[:1]])
    k1 = _rdp(mitad1, eps)
    k2 = _rdp(mitad2, eps)
    # k1 ya incluye el punto 0 y el m; k2 repite m al inicio y 0 al final.
    idx = np.concatenate([np.nonzero(k1)[0], m + np.nonzero(k2)[0][1:-1]])
    return contorno[idx]
