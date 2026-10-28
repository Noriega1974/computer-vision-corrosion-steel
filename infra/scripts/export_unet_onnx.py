#!/usr/bin/env python3
"""
Exporta la U-Net v9 (checkpoint .pt de train_sem.py) a ONNX y verifica
numéricamente el resultado contra PyTorch.

Herramienta de DESARROLLO: necesita torch y segmentation-models-pytorch
(entorno conda `corrosion-ml`), que NO van en la Lambda. El .onnx resultante
(~98 MB) no se versiona en git; vive en
corrosion-ml/4_corrida3/modelos/ y se sube a S3 a mano (ver
docs/runbook_unet.md).

Uso:
    python scripts/export_unet_onnx.py \\
        --weights ~/projects/corrosion-ml/4_corrida3/modelos/unet_v9_best.pt \\
        --out     ~/projects/corrosion-ml/4_corrida3/modelos/unet_v9_1024.onnx \\
        --check-images foto1.jpg foto2.jpg ...

Decisiones:
  * opset 17: el onnxruntime de la capa de la Lambda (1.16.3) soporta hasta
    opset 19; un opset mayor falla al cargar (gotcha ya vivido con YOLO).
  * entrada fija 1x3x1024x1024 (el lienzo de entrenamiento), salida = logits
    1x1x1024x1024. La normalización y la sigmoide se hacen en el handler
    (unet_model.py), no dentro del grafo.
  * dynamo=False: exportador clásico (TorchScript); no requiere onnxscript.
"""
import argparse
import hashlib
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "pf_corrosion_infra" / "lambda_src" / "inference"))
import unet_model  # noqa: E402  (la misma preparación de entrada que usa la Lambda)

SIZE = unet_model.SIZE


def cargar_modelo_torch(ruta_pt: Path):
    import segmentation_models_pytorch as smp
    import torch

    ck = torch.load(ruta_pt, map_location="cpu", weights_only=False)  # checkpoint propio de confianza
    cfg = ck["config"]
    modelo = getattr(smp, cfg["arch"])(encoder_name=cfg["encoder"], encoder_weights=None, in_channels=3, classes=1)
    modelo.load_state_dict(ck["model"])
    return modelo.eval(), cfg


def exportar(modelo, salida: Path, opset: int) -> None:
    import torch

    salida.parent.mkdir(parents=True, exist_ok=True)
    kwargs = dict(
        opset_version=opset,
        input_names=["x"],
        output_names=["y"],
        do_constant_folding=True,
    )
    with torch.no_grad():
        try:
            torch.onnx.export(modelo, torch.zeros(1, 3, SIZE, SIZE), str(salida), dynamo=False, **kwargs)
        except TypeError:  # torch < 2.5 no tiene el parámetro `dynamo`
            torch.onnx.export(modelo, torch.zeros(1, 3, SIZE, SIZE), str(salida), **kwargs)

    import onnx

    onnx.checker.check_model(str(salida))


def verificar(modelo, ruta_onnx: Path, imagenes: list[Path], umbral: float) -> bool:
    """Compara PyTorch fp32 (CPU) contra ONNX Runtime en las mismas entradas.
    Criterio de aceptación: diferencia máxima de probabilidad < 1e-3 y IoU de
    máscaras >= 0.999 (las diferencias de punto flotante pueden mover un
    puñado de píxeles pegados al umbral, no más)."""
    import onnxruntime as ort
    import torch

    sesion = ort.InferenceSession(str(ruta_onnx), providers=["CPUExecutionProvider"])
    nombre = sesion.get_inputs()[0].name
    todo_ok = True
    for ruta in imagenes:
        x, w, h = unet_model.preparar_entrada(Image.open(ruta).convert("RGB"))
        with torch.no_grad():
            p_torch = torch.sigmoid(modelo(torch.from_numpy(x)))[0, 0].numpy()
        t0 = time.perf_counter()
        logits = sesion.run(None, {nombre: x})[0]
        dt = time.perf_counter() - t0
        p_onnx = unet_model.sigmoide(logits[0, 0])
        dif = float(np.abs(p_torch - p_onnx).max())
        m_t, m_o = p_torch[:h, :w] > umbral, p_onnx[:h, :w] > umbral
        union = int((m_t | m_o).sum())
        iou = 1.0 if union == 0 else float((m_t & m_o).sum()) / union
        ok = dif < 1e-3 and iou >= 0.999
        todo_ok &= ok
        print(f"{ruta.name}: max|dp|={dif:.2e}  IoU(mask)={iou:.5f}  px_distintos={int((m_t ^ m_o).sum())}  "
              f"corrosion_torch={m_t.mean()*100:.2f}%  onnx_run={dt:.2f}s  {'OK' if ok else 'FALLA'}")
    return todo_ok


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--weights", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--opset", type=int, default=17)
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--check-images", type=Path, nargs="*", default=[])
    ap.add_argument("--skip-export", action="store_true", help="solo verificar un .onnx ya exportado")
    args = ap.parse_args()

    modelo, cfg = cargar_modelo_torch(args.weights)
    print(f"checkpoint: {cfg['arch']} / {cfg['encoder']}  canvas={cfg.get('canvas')}")
    if not args.skip_export:
        exportar(modelo, args.out, args.opset)
    h = hashlib.sha256(args.out.read_bytes()).hexdigest()
    print(f"onnx: {args.out}  {args.out.stat().st_size / 1e6:.1f} MB  opset={args.opset}  sha256={h}")

    if args.check_images:
        return 0 if verificar(modelo, args.out, args.check_images, args.threshold) else 1
    print("AVISO: sin --check-images no se verificó numéricamente el ONNX")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
