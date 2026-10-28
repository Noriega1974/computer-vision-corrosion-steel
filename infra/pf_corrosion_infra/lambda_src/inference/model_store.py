"""
Model file access shared by the YOLO and U-Net inference paths.

Both models live in the models S3 bucket (never in the Lambda package) and
are selected by configuration:

  MODEL_TYPE    "yolo" | "unet"
  MODEL_BUCKET  models bucket name
  MODEL_KEY     S3 key of the ONNX file (e.g. unet/unet_final_1024.onnx)
  MODEL_SHA256  optional; verified after the download
  MODEL_ORT_THREADS  optional; onnxruntime intra-op threads (local timing only)

The file is downloaded to /tmp once per cold start and the onnxruntime
session is cached for the life of the container. The download goes to a
`.part` file that is renamed when complete (and verified), so a container
that dies mid-download never leaves a truncated model behind.

Local development: MODEL_LOCAL_PATH points to an ONNX file and skips S3.
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from pathlib import Path

logger = logging.getLogger()

MODEL_TYPES = ("yolo", "unet")

_sesion = None
_sesion_ruta: str | None = None


def tipo_modelo() -> str:
    tipo = os.environ.get("MODEL_TYPE", "unet").strip().lower()
    if tipo not in MODEL_TYPES:
        raise ValueError(f"Invalid MODEL_TYPE: {tipo!r} (valid: {', '.join(MODEL_TYPES)})")
    return tipo


def etiqueta_modelo(tipo: str) -> str:
    """Short identifier stored in every measurement (`unet:<file>`), so each
    measurement records which model produced it."""
    origen = os.environ.get("MODEL_LOCAL_PATH") or os.environ.get("MODEL_KEY") or "unknown"
    return f"{tipo}:{Path(origen).name}"


def ruta_modelo(s3_client=None) -> tuple[Path, int]:
    """Local path of the ONNX file, downloading it from S3 if needed.
    Returns (path, download_ms); download_ms is 0 when the file was cached."""
    local = os.environ.get("MODEL_LOCAL_PATH")
    if local:
        return Path(local), 0

    bucket = os.environ.get("MODEL_BUCKET")
    key = os.environ.get("MODEL_KEY")
    if not bucket or not key:
        raise RuntimeError("MODEL_BUCKET and MODEL_KEY are required (or MODEL_LOCAL_PATH in development)")
    if s3_client is None:
        raise RuntimeError("An S3 client is required to download the model")

    destino = Path(os.environ.get("MODEL_CACHE_DIR", "/tmp/model")) / Path(key).name
    if destino.exists() and destino.stat().st_size > 0:
        return destino, 0

    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(destino.name + ".part")
    logger.info("Downloading model s3://%s/%s -> %s", bucket, key, destino)
    t0 = time.perf_counter()
    s3_client.download_file(bucket, key, str(parcial))

    esperado = os.environ.get("MODEL_SHA256", "").strip().lower()
    if esperado:
        h = hashlib.sha256()
        with open(parcial, "rb") as f:
            for bloque in iter(lambda: f.read(1 << 20), b""):
                h.update(bloque)
        if h.hexdigest() != esperado:
            parcial.unlink(missing_ok=True)
            raise RuntimeError("The downloaded model does not match MODEL_SHA256")
    os.replace(parcial, destino)
    return destino, round((time.perf_counter() - t0) * 1000)


def obtener_sesion(s3_client=None, size: int = 1024):
    """onnxruntime (CPU) session cached per container.

    Returns (session, timings) with timings = {"descarga_ms", "carga_ms"};
    both are 0 on warm invocations. `size` is the square input side the
    model must have (validated once, at load time).
    """
    global _sesion, _sesion_ruta
    ruta, descarga_ms = ruta_modelo(s3_client)
    carga_ms = 0
    if _sesion is None or _sesion_ruta != str(ruta):
        import onnxruntime as ort  # lazy: keeps the module importable without onnxruntime

        t0 = time.perf_counter()
        opciones = ort.SessionOptions()
        hilos = os.environ.get("MODEL_ORT_THREADS")
        if hilos:
            opciones.intra_op_num_threads = int(hilos)
        sesion = ort.InferenceSession(str(ruta), opciones, providers=["CPUExecutionProvider"])
        forma = sesion.get_inputs()[0].shape
        if list(forma[2:]) != [size, size]:
            raise RuntimeError(f"The ONNX model expects input {forma}, expected 1x3x{size}x{size}")
        _sesion, _sesion_ruta = sesion, str(ruta)
        carga_ms = round((time.perf_counter() - t0) * 1000)
    return _sesion, {"descarga_ms": descarga_ms, "carga_ms": carga_ms}


def reiniciar_cache() -> None:
    """Drops the cached session (tests and local scripts)."""
    global _sesion, _sesion_ruta
    _sesion = _sesion_ruta = None
