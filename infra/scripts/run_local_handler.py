#!/usr/bin/env python3
"""
Corre handler.lambda_handler EN LOCAL sobre fotos reales, con S3 y DynamoDB en
memoria (tests/unit/fakes.py). No hace ninguna llamada a AWS: las credenciales
son falsas, los archivos de configuración de AWS se anulan y el cliente S3
del handler se reemplaza por un doble que "baja" el modelo de un archivo local
(imita el flujo de arranque en frío: descarga a una caché y sesión ONNX).

Uso (entorno con onnxruntime, Pillow, numpy y boto3; idealmente python 3.11 y
las versiones de la capa para que los tiempos se parezcan a la Lambda):

    python scripts/run_local_handler.py --yolo-onnx yolo_final_ep80_1024.onnx \\
        --unet-onnx unet_final_1024.onnx --models yolo unet --threads 2 --repeat 3 fotos/*.jpg

Imprime una fila por foto y modelo: tiempo total del handler, de la
inferencia (log TIEMPOS_INFERENCIA), área, nº de regiones, vértices y tamaño
estimado del ítem de DynamoDB. Los tiempos son de ESTA máquina, no de AWS.
"""
import argparse
import base64
import io
import json
import logging
import os
import resource
import sys
import tempfile
import time
from pathlib import Path

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
from contrato import validar_contrato  # noqa: E402


class _CapturaLog(logging.Handler):
    def __init__(self):
        super().__init__()
        self.tiempos = []

    def emit(self, record):
        m = record.getMessage()
        if m.startswith("TIEMPOS_INFERENCIA "):
            self.tiempos.append(json.loads(m.split(" ", 1)[1]))


def dibujar(foto: Path, cuerpo: dict, destino: Path) -> None:
    from PIL import Image, ImageDraw

    img = Image.open(foto).convert("RGB")
    img.thumbnail((1400, 1400))
    w, h = img.size
    capa = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    for m in cuerpo["mascaras"]:
        pts = [(p["x"] * w, p["y"] * h) for p in m["puntos"]]
        d.polygon(pts, fill=(220, 38, 38, 110), outline=(255, 255, 0, 255))
    Image.alpha_composite(img.convert("RGBA"), capa).convert("RGB").save(destino, quality=88)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("fotos", nargs="+", type=Path)
    ap.add_argument("--models", nargs="+", default=["yolo", "unet"], choices=["yolo", "unet"])
    ap.add_argument("--unet-onnx", type=Path, help="ONNX de la U-Net (obligatorio si --models incluye unet)")
    ap.add_argument("--yolo-onnx", type=Path, help="ONNX de YOLO (obligatorio si --models incluye yolo)")
    ap.add_argument("--threads", type=int, help="hilos de onnxruntime (Lambda 3008 MB ~ 2 vCPU)")
    ap.add_argument("--repeat", type=int, default=2, help="veces por foto (la 1a de todas es en frío)")
    ap.add_argument("--overlay-dir", type=Path, help="guarda foto + polígonos devueltos")
    ap.add_argument("--json-dir", type=Path, help="guarda el cuerpo de respuesta de cada foto")
    args = ap.parse_args()
    onnx = {"unet": args.unet_onnx, "yolo": args.yolo_onnx}
    for m in args.models:
        if not onnx[m]:
            ap.error(f"--{m}-onnx es obligatorio con --models {m}")

    import handler
    import model_store

    captura = _CapturaLog()
    logging.getLogger().addHandler(captura)

    evento_base = {"requestContext": {"authorizer": {"claims": {"sub": "sub-local"}}}}
    for modelo in args.models:
        key = f"{modelo}/{onnx[modelo].name}"
        os.environ.update({"MODEL_TYPE": modelo, "MODEL_BUCKET": "bucket-local", "MODEL_KEY": key,
                           "MODEL_CACHE_DIR": tempfile.mkdtemp(prefix="model_cache_")})
        if args.threads:
            os.environ["MODEL_ORT_THREADS"] = str(args.threads)
        handler.s3 = fakes.FakeS3({("bucket-local", key): onnx[modelo]})
        handler.tabla_mediciones = fakes.FakeTabla()
        handler.tabla_usuarios = fakes.FakeTabla([{"rol": "tecnico", "empresa_id": "E", "nombre": "local"}])
        handler.tabla_bloques = fakes.FakeTabla([{"id_bloque": "B", "empresa_id": "E", "nombre": "B", "activo": True}])
        handler._obtener_clima = lambda *a, **k: None
        handler._primera_inferencia = True
        model_store.reiniciar_cache()

        print(f"\n== MODEL_TYPE={modelo}" + (f"  hilos={args.threads}" if args.threads else ""))
        print(f"{'foto':44s} {'rep':>3s} {'frio':>4s} {'handler_s':>9s} {'infer_s':>7s} {'area%':>6s} {'regiones':>8s} {'vertices':>8s} {'item_KB':>7s} {'resp_KB':>7s}")
        for foto in args.fotos:
            b64 = base64.b64encode(foto.read_bytes()).decode()
            evento = {**evento_base, "body": json.dumps({"imagen_base64": b64, "bloque_id": "B"})}
            for rep in range(1, args.repeat + 1):
                n0 = len(captura.tiempos)
                t0 = time.perf_counter()
                resp = handler.lambda_handler(evento, None)
                dt = time.perf_counter() - t0
                if resp["statusCode"] != 200:
                    print(f"{foto.name[:44]:44s} ERROR {resp['body']}")
                    break
                cuerpo = json.loads(resp["body"])
                validar_contrato(cuerpo)
                t = captura.tiempos[n0]
                item_kb = fakes.tamano_item_dynamodb(handler.tabla_mediciones.escritos[-1]) / 1024
                print(f"{foto.name[:44]:44s} {rep:>3d} {str(t['arranque_en_frio'])[0]:>4s} {dt:9.2f} {t['inferencia_ms']/1000:7.2f} "
                      f"{cuerpo['area_corroida_pct']:6.2f} {len(cuerpo['detecciones']):8d} "
                      f"{sum(len(m['puntos']) for m in cuerpo['mascaras']):8d} {item_kb:7.1f} {len(resp['body'])/1024:7.1f}")
                if rep == 1:
                    if args.overlay_dir:
                        args.overlay_dir.mkdir(parents=True, exist_ok=True)
                        dibujar(foto, cuerpo, args.overlay_dir / f"{modelo}_{foto.stem}.jpg")
                    if args.json_dir:
                        args.json_dir.mkdir(parents=True, exist_ok=True)
                        (args.json_dir / f"{modelo}_{foto.stem}.json").write_text(resp["body"])
        print(f"   pico de memoria del proceso (ru_maxrss, acumulado): {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024:.0f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
