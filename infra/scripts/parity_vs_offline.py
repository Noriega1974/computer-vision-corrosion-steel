#!/usr/bin/env python3
"""
Local parity check: runs the REAL handler code path (handler.lambda_handler,
with in-memory S3/DynamoDB doubles, no AWS calls) on a deterministic sample of
validation photos and compares `area_corroida_pct` and `nivel_corrosion` with
the offline evaluator (eval_final/evaluar_mascaras.py, per-image JSON with
`gt_pct` and `pred_pct`).

Sample: N_NEG photos without corrosion (gt_pct == 0) + N_POS with corrosion
(gt_pct > 0), evenly spaced over the name-sorted list, so it is reproducible.

Usage (Python 3.11 + the layer versions of numpy/Pillow/onnxruntime):

    python scripts/parity_vs_offline.py --images <valid/images> \\
        --yolo-onnx yolo_final_ep80_1024.onnx --offline-yolo per_conf_0.25.json \\
        --unet-onnx unet_final_1024.onnx      --offline-unet per_conf_0.5.json \\
        --threads 2

Prints, per model: median / p95 / max of |handler % - offline %| in
percentage points, level agreement (ISO 10289 levels of `_calcular_nivel`
applied to both percentages) and the local CPU time per photo.
"""
import argparse
import base64
import json
import logging
import os
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
for k, v in {
    "AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test", "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_CONFIG_FILE": os.devnull, "AWS_SHARED_CREDENTIALS_FILE": os.devnull, "AWS_EC2_METADATA_DISABLED": "true",
    "BUCKET_NAME": "local", "TABLA_MEDICIONES": "t", "TABLA_USUARIOS": "t", "TABLA_BLOQUES": "t", "REGION": "us-east-1",
}.items():
    os.environ[k] = v
os.environ.pop("AWS_PROFILE", None)
sys.path.insert(0, str(RAIZ / "pf_corrosion_infra" / "lambda_src" / "inference"))
sys.path.insert(0, str(RAIZ / "tests" / "unit"))

import fakes  # noqa: E402


class _Tiempos(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lineas = []

    def emit(self, record):
        m = record.getMessage()
        if m.startswith("TIEMPOS_INFERENCIA "):
            self.lineas.append(json.loads(m.split(" ", 1)[1]))


def muestra(offline: list[dict], n_neg: int, n_pos: int) -> list[str]:
    def repartir(items, n):
        items = sorted(items, key=lambda i: i["image"])
        return [items[int(j)]["image"] for j in np.linspace(0, len(items) - 1, n).round()]

    return repartir([i for i in offline if i["gt_pct"] == 0], n_neg) + repartir([i for i in offline if i["gt_pct"] > 0], n_pos)


def correr(modelo, onnx, fotos, offline, threads, handler, model_store, log):
    key = f"{modelo}/{onnx.name}"
    os.environ.update({"MODEL_TYPE": modelo, "MODEL_BUCKET": "bucket-local", "MODEL_KEY": key,
                       "MODEL_CACHE_DIR": tempfile.mkdtemp(prefix="model_cache_")})
    if threads:
        os.environ["MODEL_ORT_THREADS"] = str(threads)
    handler.s3 = fakes.FakeS3({("bucket-local", key): onnx})
    handler.tabla_mediciones = fakes.FakeTabla()
    handler.tabla_usuarios = fakes.FakeTabla([{"rol": "tecnico", "empresa_id": "E", "nombre": "local"}])
    handler.tabla_bloques = fakes.FakeTabla([{"id_bloque": "B", "empresa_id": "E", "nombre": "B", "activo": True}])
    handler._obtener_clima = lambda *a, **k: None
    handler._primera_inferencia = True
    model_store.reiniciar_cache()

    filas = []
    for foto in fotos:
        evento = {"requestContext": {"authorizer": {"claims": {"sub": "s"}}},
                  "body": json.dumps({"imagen_base64": base64.b64encode(foto.read_bytes()).decode(), "bloque_id": "B"})}
        n0 = len(log.lineas)
        resp = handler.lambda_handler(evento, None)
        assert resp["statusCode"] == 200, resp["body"]
        cuerpo = json.loads(resp["body"])
        t = log.lineas[n0]
        off = offline[foto.stem]["pred_pct"]
        filas.append({
            "foto": foto.stem, "gt_pct": offline[foto.stem]["gt_pct"], "handler_pct": cuerpo["area_corroida_pct"],
            "offline_pct": off, "diff_pp": abs(cuerpo["area_corroida_pct"] - off),
            "nivel_handler": cuerpo["nivel_corrosion"], "nivel_offline": handler._calcular_nivel(off),
            "frio": t["arranque_en_frio"], "inferencia_ms": t["inferencia_ms"], "onnx_ms": t["onnx_ms"], "total_ms": t["total_ms"],
        })
    return filas


def resumen(modelo, filas) -> dict:
    d = np.array([f["diff_pp"] for f in filas])
    acuerdo = np.mean([f["nivel_handler"] == f["nivel_offline"] for f in filas]) * 100
    calientes = [f for f in filas if not f["frio"]]
    out = {
        "modelo": modelo, "n": len(filas), "mediana_pp": round(float(np.median(d)), 3),
        "p95_pp": round(float(np.percentile(d, 95)), 3), "max_pp": round(float(d.max()), 3),
        "acuerdo_nivel_pct": round(float(acuerdo), 1),
        "inferencia_ms_mediana": round(float(np.median([f["inferencia_ms"] for f in calientes]))),
        "onnx_ms_mediana": round(float(np.median([f["onnx_ms"] for f in calientes]))),
        "total_handler_ms_mediana": round(float(np.median([f["total_ms"] for f in calientes]))),
    }
    print(json.dumps(out))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--images", type=Path, required=True, help="folder with the validation photos")
    ap.add_argument("--yolo-onnx", type=Path)
    ap.add_argument("--offline-yolo", type=Path)
    ap.add_argument("--unet-onnx", type=Path)
    ap.add_argument("--offline-unet", type=Path)
    ap.add_argument("--n-neg", type=int, default=10)
    ap.add_argument("--n-pos", type=int, default=30)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--csv", type=Path, help="per-photo output (one CSV per model: <csv>.<model>.csv)")
    args = ap.parse_args()

    import handler
    import model_store

    log = _Tiempos()
    logging.getLogger().addHandler(log)
    resultados = []
    for modelo, onnx, off_json in (("yolo", args.yolo_onnx, args.offline_yolo), ("unet", args.unet_onnx, args.offline_unet)):
        if not (onnx and off_json):
            continue
        offline_lista = json.loads(off_json.read_text())
        offline = {i["image"]: i for i in offline_lista}
        nombres = muestra(offline_lista, args.n_neg, args.n_pos)
        fotos = [next(args.images.glob(f"{n}.*")) for n in nombres]
        t0 = time.perf_counter()
        filas = correr(modelo, onnx, fotos, offline, args.threads, handler, model_store, log)
        print(f"== {modelo}: {len(fotos)} fotos en {time.perf_counter() - t0:.0f} s")
        resultados.append(resumen(modelo, filas))
        peores = sorted(filas, key=lambda f: -f["diff_pp"])[:5]
        for f in peores:
            print(f"   peor: {f['foto']} handler={f['handler_pct']} offline={f['offline_pct']:.2f} gt={f['gt_pct']:.2f} "
                  f"niveles {f['nivel_handler']}/{f['nivel_offline']}")
        if args.csv:
            import csv
            ruta = args.csv.with_name(f"{args.csv.name}.{modelo}.csv")
            with ruta.open("w", newline="") as fh:
                w = csv.DictWriter(fh, fieldnames=list(filas[0]))
                w.writeheader()
                w.writerows(filas)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
