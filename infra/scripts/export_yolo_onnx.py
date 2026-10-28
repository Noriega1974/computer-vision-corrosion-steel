#!/usr/bin/env python3
"""
Exports the final YOLOv8n-seg checkpoint (Ultralytics .pt) to ONNX and checks
the result numerically against PyTorch.

DEVELOPMENT tool: needs ultralytics and torch (conda env `corrosion-ml`),
which do NOT ship in the Lambda. The resulting .onnx (~13 MB) is not
versioned in git; it lives in corrosion-ml/4_corrida3/modelos/ and is
uploaded to S3 by hand (see docs/runbook_unet.md).

Usage:
    python scripts/export_yolo_onnx.py \\
        --weights .../modelo_final_ft_fp32/weights/epoch80.pt \\
        --out     ~/projects/corrosion-ml/4_corrida3/modelos/yolo_final_ep80_1024.onnx \\
        --check-images foto1.jpg foto2.jpg foto3.jpg

Decisions:
  * opset 17 (onnxruntime 1.16.3 in the Lambda layer supports up to 19).
  * fixed 1x3x1024x1024 input, no NMS in the graph: NMS, mask decoding and
    the letterbox are done in yolo_model.py, the same code the Lambda runs.
  * simplify=False: no extra dependency (onnxslim) and a graph that maps 1:1
    to the PyTorch model.
"""
import argparse
import hashlib
import shutil
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "pf_corrosion_infra" / "lambda_src" / "inference"))
import yolo_model  # noqa: E402  (the same preprocessing the Lambda uses)


def exportar(weights: Path, salida: Path, opset: int) -> None:
    from ultralytics import YOLO

    generado = Path(YOLO(str(weights)).export(
        format="onnx", imgsz=yolo_model.IMGSZ, opset=opset, simplify=False, dynamic=False, half=False, nms=False, batch=1,
    ))
    salida.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(generado), str(salida))

    import onnx

    onnx.checker.check_model(str(salida))


def verificar(weights: Path, ruta_onnx: Path, imagenes: list[Path], conf: float) -> bool:
    """PyTorch fp32 (CPU) vs ONNX Runtime on the same letterboxed input.
    Pass criteria: box coordinates (canvas pixels) within 0.1 px, confidence
    and mask coefficients within 1e-3, prototypes within 1e-3, and the same
    number of cells above `conf`."""
    import onnxruntime as ort
    import torch
    from ultralytics import YOLO

    modelo = YOLO(str(weights)).model.float().eval().cpu()
    sesion = ort.InferenceSession(str(ruta_onnx), providers=["CPUExecutionProvider"])
    nombre = sesion.get_inputs()[0].name
    todo_ok = True
    for ruta in imagenes:
        x, _ = yolo_model.letterbox(Image.open(ruta).convert("RGB"))
        with torch.no_grad():
            salida = modelo(torch.from_numpy(x))
        pred_t, proto_t = (t.numpy() for t in salida[0])             # [1, 37, N], [1, 32, 256, 256]
        t0 = time.perf_counter()
        pred_o, proto_o = sesion.run(None, {nombre: x})
        dt = time.perf_counter() - t0
        d_box = float(np.abs(pred_t[:, :4] - pred_o[:, :4]).max())
        d_pred = float(np.abs(pred_t[:, 4:] - pred_o[:, 4:]).max())
        d_proto = float(np.abs(proto_t - proto_o).max())
        n_t, n_o = int((pred_t[0, 4] > conf).sum()), int((pred_o[0, 4] > conf).sum())
        ok = d_box < 0.1 and d_pred < 1e-3 and d_proto < 1e-3 and n_t == n_o
        todo_ok &= ok
        print(f"{ruta.name}: max|d_box|={d_box:.2e}px  max|d_conf+coefs|={d_pred:.2e}  max|d_proto|={d_proto:.2e}  "
              f"cells>{conf}: torch={n_t} onnx={n_o}  onnx_run={dt:.2f}s  {'OK' if ok else 'FAILS'}")
    return todo_ok


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--weights", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--opset", type=int, default=17)
    ap.add_argument("--conf", type=float, default=0.25)
    ap.add_argument("--check-images", type=Path, nargs="*", default=[])
    ap.add_argument("--skip-export", action="store_true", help="only verify an already exported .onnx")
    args = ap.parse_args()

    if not args.skip_export:
        exportar(args.weights, args.out, args.opset)
    h = hashlib.sha256(args.out.read_bytes()).hexdigest()
    print(f"onnx: {args.out}  {args.out.stat().st_size / 1e6:.1f} MB  opset={args.opset}  sha256={h}")

    if args.check_images:
        return 0 if verificar(args.weights, args.out, args.check_images, args.conf) else 1
    print("WARNING: without --check-images the ONNX was not verified numerically")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
