"""
Camino U-Net v9 de la Lambda de inferencia (MODEL_TYPE=unet).

Contrato de salida: el MISMO que ya consumen la web y el móvil
(`detecciones`, `mascaras`, `area_corroida_pct`, `confianza_promedio`), pero
la U-Net es segmentación SEMÁNTICA: no hay instancias ni cajas ni confianza
por detección. Se emulan así (decisión documentada en docs/runbook_unet.md):

  * una "pseudo-detección" por componente conexa de la máscara (>= MIN_AREA_PX
    píxeles; las UNET_MAX_COMPONENTS más grandes);
  * `detecciones[i]` = caja que envuelve la componente (x, y = centro; w, h),
    `confianza` = media de la probabilidad sigmoide sobre los píxeles de la
    componente, `clase` = "corrosion";
  * `mascaras[i]` = contorno externo de la componente, simplificado, en
    coordenadas normalizadas [0, 1] de la FOTO (no del lienzo de 1024);
  * `area_corroida_pct` = píxeles de la máscara completa (umbral 0.5) sobre
    el área de la foto reescalada (sin el relleno del lienzo). Mismo
    significado que con YOLO: % de la foto cubierto por la unión de
    corrosión, sin doble conteo. Cuenta TODA la máscara, también las
    manchas menores a MIN_AREA_PX que no se dibujan;
  * `confianza_promedio` = media de `confianza` de las pseudo-detecciones
    (igual que YOLO: media de las confianzas de lo que se devuelve).

Preprocesamiento idéntico a 4_corrida3/scripts/method_unet.py y a
3_modelo_galvanizado/colab_v9_unet_train/train_sem.py: lado largo a 1024 con
PIL BOX, lienzo 1024x1024 con la foto arriba-izquierda y relleno PAD_RGB,
normalización ImageNet. No se recorta la placa (ROI) como hace el
autoetiquetado: producción recibe la foto tal cual (la métrica 0,694 del
test es sin recorte).

El modelo lo descarga model_store.py (MODEL_BUCKET / MODEL_KEY) y la sesión
se reutiliza mientras viva el contenedor.
"""
from __future__ import annotations

import logging
import os
import time

import numpy as np
from PIL import Image

import mask_polygons as mp

logger = logging.getLogger()

SIZE = 1024                      # lienzo de entrenamiento (train_sem.py)
PAD_RGB = (124, 116, 104)        # relleno del lienzo (train_sem.py)
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)


def configuracion() -> dict:
    """Parámetros desde variables de entorno (se leen en cada llamada para
    poder cambiarlos en pruebas)."""
    e = os.environ
    return {
        "umbral": float(e.get("UNET_THRESHOLD", "0.5")),
        "min_area_px": int(e.get("UNET_MIN_AREA_PX", "25")),
        "max_componentes": int(e.get("UNET_MAX_COMPONENTS", "100")),
        # Tope de vértices en TODA la respuesta. Cada punto cuesta ~30 bytes
        # en DynamoDB (límite de 400 KB por ítem) y la lista de mediciones
        # devuelve `mascaras` completas al cliente (límite de 6 MB).
        "max_puntos": int(e.get("UNET_MAX_POINTS", "2000")),
        "eps_px": float(e.get("UNET_SIMPLIFY_EPS_PX", "1.0")),
    }


# ── Pre / post procesamiento ─────────────────────────────────────────────────

def preparar_entrada(imagen: Image.Image) -> tuple[np.ndarray, int, int]:
    """Imagen PIL RGB -> tensor (1,3,SIZE,SIZE) float32 + (w, h) de la foto
    reescalada dentro del lienzo. Idéntico a method_unet.unet_mask."""
    W, H = imagen.size
    s = SIZE / max(W, H)
    w, h = max(1, round(W * s)), max(1, round(H * s))
    foto = np.asarray(imagen.convert("RGB").resize((w, h), Image.BOX))
    lienzo = np.empty((SIZE, SIZE, 3), np.uint8)
    lienzo[:] = PAD_RGB
    lienzo[:h, :w] = foto
    x = lienzo.astype(np.float32) / 255.0
    x = (x - MEAN) / STD
    return np.ascontiguousarray(x.transpose(2, 0, 1)[None]), w, h


def sigmoide(logits: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(logits, -30.0, 30.0)))


def _poligono_caja(x0: int, y0: int, x1: int, y1: int, w: int, h: int) -> list[dict]:
    return [
        {"x": round(x0 / w, 4), "y": round(y0 / h, 4)},
        {"x": round(x1 / w, 4), "y": round(y0 / h, 4)},
        {"x": round(x1 / w, 4), "y": round(y1 / h, 4)},
        {"x": round(x0 / w, 4), "y": round(y1 / h, 4)},
    ]


def postprocesar(prob: np.ndarray, w: int, h: int, cfg: dict | None = None) -> dict:
    """Mapa de probabilidades (SIZE,SIZE) -> dict con el contrato de la API.
    `w`, `h`: tamaño de la foto dentro del lienzo (se ignora el relleno)."""
    cfg = cfg or configuracion()
    region = np.ascontiguousarray(prob[:h, :w])
    mascara = region > cfg["umbral"]
    area_pct = float(mascara.sum()) / (w * h) * 100.0

    comps = [c for c in mp.analizar_componentes(mascara, region) if c["area"] >= cfg["min_area_px"]]
    comps = comps[: cfg["max_componentes"]]

    detecciones: list[dict] = []
    mascaras: list[dict] = []
    if comps:
        plano, ancho_p = mp.preparar_plano(mascara)
        contornos = [mp.contorno_externo(plano, ancho_p, c["inicio"]) for c in comps]
        eps = cfg["eps_px"]
        simplificados = contornos
        for _ in range(12):
            simplificados = [mp.simplificar_cerrado(c, eps) for c in contornos]
            if sum(len(s) for s in simplificados) <= cfg["max_puntos"]:
                break
            eps *= 1.5

        for c, poli in zip(comps, simplificados):
            cx = (c["x0"] + c["x1"]) / 2 / w
            cy = (c["y0"] + c["y1"]) / 2 / h
            detecciones.append({
                "x": round(cx, 5),
                "y": round(cy, 5),
                "w": round((c["x1"] - c["x0"]) / w, 5),
                "h": round((c["y1"] - c["y0"]) / h, 5),
                "confianza": round(c["prob_media"], 4),
                "clase": "corrosion",
            })
            if len(poli) >= 3:
                # +0.5: el píxel i cubre [i, i+1) -> su centro es i + 0.5.
                puntos = [
                    {"x": round(min(1.0, (float(px) + 0.5) / w), 4),
                     "y": round(min(1.0, (float(py) + 0.5) / h), 4)}
                    for px, py in poli
                ]
            else:
                puntos = _poligono_caja(c["x0"], c["y0"], c["x1"], c["y1"], w, h)
            mascaras.append({"puntos": puntos})

    conf_prom = float(np.mean([d["confianza"] for d in detecciones])) if detecciones else 0.0
    return {
        "area_corroida_pct": round(area_pct, 2),
        "confianza_promedio": round(conf_prom, 4),
        "detecciones": detecciones,
        "mascaras": mascaras,
    }


def inferir(imagen: Image.Image, sesion) -> tuple[dict, int]:
    """Foto PIL -> (dict del contrato sin `nivel_corrosion`, onnx_ms). El
    handler calcula el nivel con la misma función que usa YOLO."""
    x, w, h = preparar_entrada(imagen)
    t0 = time.perf_counter()
    logits = sesion.run(None, {sesion.get_inputs()[0].name: x})[0]
    onnx_ms = round((time.perf_counter() - t0) * 1000)
    prob = sigmoide(logits[0, 0].astype(np.float32, copy=False))
    return postprocesar(prob, w, h), onnx_ms
