"""
Separador de placa (modelo secundario, opcional) de la Lambda de inferencia.

Segmenta la superficie metálica (la placa) para que el % de corrosión se
calcule sobre la placa y no sobre toda la foto (el fondo -- piso, pared,
cielo -- diluía el porcentaje). U-Net smp con encoder MobileNetV2, entrada
`images` 1x3x512x512, salida `logits` 1x1x512x512 (logit > 0 = placa).

Preprocesamiento idéntico al validado en 8_pruebas/2026-10-29_placa_fondo_sam/
eval_separador_experto.py: lado largo a 512 con PIL BILINEAR, lienzo 512x512
con la foto arriba-izquierda y relleno NEGRO (0, 0, 0) -- el entrenamiento
rellena con negro ANTES de normalizar, así que el relleno normalizado vale
(0 - media) / std --, normalización ImageNet.

Postproceso: logits > 0 sobre la región de la foto (sin el relleno) y solo la
componente conexa más grande. Solo numpy y Pillow (la capa de la Lambda no
trae OpenCV ni scipy); no importa onnxruntime, así que se puede probar aislado.
El modelo lo descarga model_store.py (PLATE_MODEL_KEY / PLATE_MODEL_LOCAL_PATH).
"""
from __future__ import annotations

import time

import numpy as np
from PIL import Image

import mask_polygons as mp

SIZE = 512                       # lienzo de entrenamiento del separador
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)

# Por debajo de este % de la foto la máscara de placa se considera inválida
# (separador fallido) y el handler vuelve al % sobre la foto completa.
MIN_PLACA_PCT_FOTO = 3.0
# Contorno de la placa: tolerancia RDP en píxeles del lienzo de 512 y tope de
# vértices (~30 bytes cada uno en DynamoDB; una placa necesita muy pocos).
EPS_PX = 1.5
MAX_PUNTOS = 200


def preparar_entrada(imagen: Image.Image) -> tuple[np.ndarray, int, int]:
    """Imagen PIL RGB -> tensor (1,3,512,512) float32 + (w, h) de la foto
    reescalada dentro del lienzo."""
    W, H = imagen.size
    s = SIZE / max(W, H)
    w, h = max(1, round(W * s)), max(1, round(H * s))
    foto = np.asarray(imagen.convert("RGB").resize((w, h), Image.BILINEAR))
    lienzo = np.zeros((SIZE, SIZE, 3), np.uint8)  # relleno negro
    lienzo[:h, :w] = foto
    x = (lienzo.astype(np.float32) / 255.0 - MEAN) / STD
    return np.ascontiguousarray(x.transpose(2, 0, 1)[None]), w, h


def postprocesar(logits: np.ndarray, w: int, h: int) -> np.ndarray:
    """Logits (512,512) -> máscara bool (h, w) de la placa: solo la
    componente conexa más grande de `logits > 0` dentro de la foto."""
    return mp.componente_mayor(logits[:h, :w] > 0)


def contorno(mascara: np.ndarray) -> dict | None:
    """Contorno externo simplificado de la máscara (la componente única de
    `postprocesar`) como {"puntos": [{x, y}]} en coordenadas normalizadas
    [0, 1] de la foto. None si la máscara está vacía o degenerada."""
    h, w = mascara.shape
    comps = mp.analizar_componentes(mascara, mascara.astype(np.float32))
    if not comps:
        return None
    plano, ancho_p = mp.preparar_plano(mascara)
    crudo = mp.contorno_externo(plano, ancho_p, comps[0]["inicio"])
    eps = EPS_PX
    for _ in range(12):
        poli = mp.simplificar_cerrado(crudo, eps)
        if len(poli) <= MAX_PUNTOS:
            break
        eps *= 1.5
    if len(poli) < 3:
        return None
    # +0.5: el píxel i cubre [i, i+1) -> su centro es i + 0.5.
    return {"puntos": [
        {"x": round(min(1.0, (float(px) + 0.5) / w), 4),
         "y": round(min(1.0, (float(py) + 0.5) / h), 4)}
        for px, py in poli
    ]}


def separar(imagen: Image.Image, sesion) -> tuple[np.ndarray, int]:
    """Foto PIL -> (máscara bool (h, w) de la placa en la resolución del
    lienzo de 512, onnx_ms)."""
    x, w, h = preparar_entrada(imagen)
    t0 = time.perf_counter()
    logits = sesion.run(None, {sesion.get_inputs()[0].name: x})[0]
    onnx_ms = round((time.perf_counter() - t0) * 1000)
    return postprocesar(logits[0, 0].astype(np.float32, copy=False), w, h), onnx_ms


def remuestrear(mascara: np.ndarray, ancho: int, alto: int) -> np.ndarray:
    """Máscara bool al tamaño (ancho, alto) por vecino más cercano."""
    if mascara.shape == (alto, ancho):
        return mascara
    img = Image.fromarray(mascara.astype(np.uint8) * 255)
    return np.asarray(img.resize((ancho, alto), Image.NEAREST)) > 0
