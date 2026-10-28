"""Configuración común de las pruebas unitarias (todas locales: sin red ni AWS).

Las variables de entorno se fijan ANTES de importar handler.py, que lee
BUCKET_NAME/TABLA_* al importarse y crea clientes boto3 (sin conectar). Las
credenciales son falsas y los archivos de configuración de AWS se anulan, así
que ninguna prueba puede tocar una cuenta real aunque falle un mock.
"""
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
INFERENCE_DIR = RAIZ / "pf_corrosion_infra" / "lambda_src" / "inference"

for k, v in {
    "AWS_ACCESS_KEY_ID": "test",
    "AWS_SECRET_ACCESS_KEY": "test",
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_CONFIG_FILE": os.devnull,
    "AWS_SHARED_CREDENTIALS_FILE": os.devnull,
    "AWS_EC2_METADATA_DISABLED": "true",
    "BUCKET_NAME": "bucket-de-prueba",
    "TABLA_MEDICIONES": "t-med",
    "TABLA_USUARIOS": "t-usr",
    "TABLA_BLOQUES": "t-blq",
    "REGION": "us-east-1",
}.items():
    os.environ[k] = v
os.environ.pop("AWS_PROFILE", None)

sys.path.insert(0, str(Path(__file__).parent))  # fakes, contrato
sys.path.insert(0, str(INFERENCE_DIR))
sys.path.insert(0, str(RAIZ))
