"""
YOLOv8n-seg ONNX path of the inference Lambda (MODEL_TYPE=yolo).

Only used to time YOLO against the U-Net on the same infrastructure; the
production model is the U-Net (unet_model.py). Same response contract.

Model: YOLOv8n-seg, one class, exported to ONNX opset 17 at 1024x1024 with
no NMS in the graph (scripts/export_yolo_onnx.py):
  output0: [1, 37, 21504]  xywh (canvas pixels) + conf + 32 mask coefficients
  output1: [1, 32, 256, 256]  mask prototypes

Pipeline (mirrors Ultralytics predict so the numbers match the offline
evaluator):
  1. EXIF transpose happens in the handler, before this module.
  2. Letterbox: keep the aspect ratio, scale the long side to 1024, centre
     the photo on a 1024x1024 canvas padded with 114 (Ultralytics LetterBox
     auto=False, centre=True). Downscaling uses PIL BOX (area average, the
     same as cv2 INTER_AREA and, for the x2 reduction of the 2048 px
     dataset, identical to cv2 INTER_LINEAR).
  3. conf > CONF_MINIMA (default 0.25), NMS IoU 0.7, at most 1000 detections.
  4. Masks: coefficients @ prototypes -> crop to the box at prototype
     resolution -> bilinear upsample to 1024 -> logit > 0 (== prob > 0.5).
  5. The union of all masks is cut to the photo area of the canvas (the
     letterbox padding is dropped) and the % is computed over THAT area:
     corroded pixels / pixels of the full photo. Box and polygon coordinates
     are mapped back to normalised photo coordinates.
"""
from __future__ import annotations

import logging
import os
import time

import numpy as np
from PIL import Image

logger = logging.getLogger()

IMGSZ = 1024
PAD_VALUE = 114


def configuracion() -> dict:
    """Parameters from environment variables (read on each call)."""
    e = os.environ
    return {
        "conf": float(e.get("CONF_MINIMA", "0.25")),
        "iou": float(e.get("YOLO_IOU", "0.7")),
        "max_det": int(e.get("YOLO_MAX_DET", "1000")),
    }


# ── Preprocessing ────────────────────────────────────────────────────────────

def letterbox(imagen: Image.Image, imgsz: int = IMGSZ) -> tuple[np.ndarray, dict]:
    """PIL RGB image -> (1,3,imgsz,imgsz) float32 in [0,1] + placement info.

    Same geometry as Ultralytics LetterBox(auto=False, center=True,
    scaleup=True), including its rounding of the padding."""
    W, H = imagen.size
    r = min(imgsz / H, imgsz / W)
    nw, nh = int(round(W * r)), int(round(H * r))
    dw, dh = (imgsz - nw) / 2, (imgsz - nh) / 2
    top, left = int(round(dh - 0.1)), int(round(dw - 0.1))

    foto = imagen.convert("RGB")
    if (W, H) != (nw, nh):
        foto = foto.resize((nw, nh), Image.BOX if r < 1 else Image.BILINEAR)
    lienzo = np.full((imgsz, imgsz, 3), PAD_VALUE, np.uint8)
    lienzo[top:top + nh, left:left + nw] = np.asarray(foto)
    x = lienzo.astype(np.float32) / 255.0
    return np.ascontiguousarray(x.transpose(2, 0, 1)[None]), {"nw": nw, "nh": nh, "left": left, "top": top}


# ── Postprocessing ───────────────────────────────────────────────────────────

def nms(cajas_xyxy: np.ndarray, confianzas: np.ndarray, iou_umbral: float = 0.7) -> list[int]:
    """Greedy Non-Maximum Suppression. `cajas_xyxy`: (N,4) as x1,y1,x2,y2.
    Returns the surviving indices, highest confidence first. A box is dropped
    when its IoU with a kept box is above `iou_umbral` (torchvision.ops.nms
    semantics, as used by Ultralytics)."""
    x1, y1, x2, y2 = cajas_xyxy[:, 0], cajas_xyxy[:, 1], cajas_xyxy[:, 2], cajas_xyxy[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    orden = confianzas.argsort()[::-1]

    sobreviven = []
    while orden.size > 0:
        i = orden[0]
        sobreviven.append(int(i))
        resto = orden[1:]
        if resto.size == 0:
            break
        inter = np.maximum(0.0, np.minimum(x2[i], x2[resto]) - np.maximum(x1[i], x1[resto])) * \
            np.maximum(0.0, np.minimum(y2[i], y2[resto]) - np.maximum(y1[i], y1[resto]))
        iou = inter / (areas[i] + areas[resto] - inter + 1e-9)
        orden = resto[iou <= iou_umbral]
    return sobreviven


def mascara_instancia(coefs: np.ndarray, protos: np.ndarray, caja_xyxy: np.ndarray, imgsz: int = IMGSZ) -> np.ndarray:
    """Binary mask (imgsz,imgsz) of ONE detection, canvas coordinates.

    Ultralytics process_mask(upsample=True): logits at prototype resolution,
    cropped to the (float) box, bilinear upsample, > 0."""
    c, mh, mw = protos.shape
    logits = (coefs @ protos.reshape(c, -1)).reshape(mh, mw).astype(np.float32)

    sx, sy = mw / imgsz, mh / imgsz
    x1, y1, x2, y2 = caja_xyxy[0] * sx, caja_xyxy[1] * sy, caja_xyxy[2] * sx, caja_xyxy[3] * sy
    cols = np.arange(mw, dtype=np.float32)[None, :]
    filas = np.arange(mh, dtype=np.float32)[:, None]
    logits = logits * ((cols >= x1) & (cols < x2) & (filas >= y1) & (filas < y2))

    grande = np.asarray(Image.fromarray(logits).resize((imgsz, imgsz), Image.BILINEAR))
    return grande > 0.0


def casco_convexo(mascara: np.ndarray) -> np.ndarray | None:
    """Convex hull (Andrew's monotone chain) of the True pixels, as (K,2)
    points (x,y) in pixels, or None if there are fewer than 3 distinct points.

    Only the leftmost and rightmost pixel of every row can be hull vertices,
    so the chain runs on at most 2 points per row instead of every pixel."""
    filas = np.flatnonzero(mascara.any(axis=1))
    if filas.size == 0:
        return None
    sub = mascara[filas]
    izq = sub.argmax(axis=1)
    der = sub.shape[1] - 1 - sub[:, ::-1].argmax(axis=1)
    puntos = sorted(set(zip(izq.tolist(), filas.tolist())) | set(zip(der.tolist(), filas.tolist())))
    if len(puntos) < 3:
        return None

    def cruz(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    inferior: list[tuple[int, int]] = []
    for p in puntos:
        while len(inferior) >= 2 and cruz(inferior[-2], inferior[-1], p) <= 0:
            inferior.pop()
        inferior.append(p)
    superior: list[tuple[int, int]] = []
    for p in reversed(puntos):
        while len(superior) >= 2 and cruz(superior[-2], superior[-1], p) <= 0:
            superior.pop()
        superior.append(p)
    casco = inferior[:-1] + superior[:-1]
    return np.array(casco) if len(casco) >= 3 else None


def _a_foto(x: float, y: float, lb: dict) -> tuple[float, float]:
    """Canvas pixel -> normalised photo coordinates, clipped to [0,1]."""
    return (min(1.0, max(0.0, (x - lb["left"]) / lb["nw"])),
            min(1.0, max(0.0, (y - lb["top"]) / lb["nh"])))


def postprocesar(salidas: list, lb: dict, cfg: dict | None = None, imgsz: int = IMGSZ) -> dict:
    """Raw ONNX outputs -> dict of the API contract (without `nivel_corrosion`,
    which the handler computes with the same function for every model)."""
    cfg = cfg or configuracion()
    dets_raw = salidas[0][0].T      # [N, 37]
    protos = salidas[1][0]          # [32, mh, mw]

    dets = dets_raw[dets_raw[:, 4] > cfg["conf"]]
    union = np.zeros((imgsz, imgsz), dtype=bool)
    detecciones: list[dict] = []
    mascaras: list[dict] = []
    confianzas: list[float] = []

    if dets.shape[0] > 0:
        cx, cy, w, h, conf = (dets[:, k] for k in range(5))
        cajas = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)
        for i in nms(cajas, conf, cfg["iou"])[: cfg["max_det"]]:
            bx1, by1 = _a_foto(cajas[i, 0], cajas[i, 1], lb)
            bx2, by2 = _a_foto(cajas[i, 2], cajas[i, 3], lb)
            detecciones.append({
                "x": round((bx1 + bx2) / 2, 5), "y": round((by1 + by2) / 2, 5),
                "w": round(bx2 - bx1, 5), "h": round(by2 - by1, 5),
                "confianza": round(float(conf[i]), 4), "clase": "corrosion",
            })
            confianzas.append(float(conf[i]))

            binaria = mascara_instancia(dets[i, 5:37], protos, cajas[i], imgsz)
            union |= binaria
            casco = casco_convexo(binaria)
            if casco is not None:
                # +0.5: pixel i covers [i, i+1), its centre is i + 0.5.
                puntos = [dict(zip(("x", "y"), (round(v, 5) for v in _a_foto(px + 0.5, py + 0.5, lb))))
                          for px, py in casco.tolist()]
            else:
                puntos = [{"x": round(bx1, 5), "y": round(by1, 5)}, {"x": round(bx2, 5), "y": round(by1, 5)},
                          {"x": round(bx2, 5), "y": round(by2, 5)}, {"x": round(bx1, 5), "y": round(by2, 5)}]
            mascaras.append({"puntos": puntos})

    # Drop the letterbox padding: the % is over the photo area only.
    foto = union[lb["top"]:lb["top"] + lb["nh"], lb["left"]:lb["left"] + lb["nw"]]
    area_pct = float(foto.sum()) / (lb["nw"] * lb["nh"]) * 100.0
    return {
        "area_corroida_pct": round(area_pct, 2),
        "confianza_promedio": round(float(np.mean(confianzas)) if confianzas else 0.0, 4),
        "detecciones": detecciones,
        "mascaras": mascaras,
    }


def inferir(imagen: Image.Image, sesion) -> tuple[dict, int]:
    """Photo -> (contract dict, onnx_ms)."""
    x, lb = letterbox(imagen)
    t0 = time.perf_counter()
    salidas = sesion.run(None, {sesion.get_inputs()[0].name: x})
    onnx_ms = round((time.perf_counter() - t0) * 1000)
    return postprocesar(salidas, lb), onnx_ms
