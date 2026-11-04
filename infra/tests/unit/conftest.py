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
    "TABLA_EMPRESAS": "t-emp",
    "REGION": "us-east-1",
}.items():
    os.environ[k] = v
os.environ.pop("AWS_PROFILE", None)

sys.path.insert(0, str(Path(__file__).parent))  # fakes, contrato
sys.path.insert(0, str(INFERENCE_DIR))
sys.path.insert(0, str(RAIZ))


import pytest  # noqa: E402


class _RecursoSinRed:
    """boto3.resource('dynamodb') de prueba: cada Table es una FakeTabla vacía,
    así un handler cargado en una prueba nunca sale a la red por una tabla que
    la prueba no configuró (p. ej. `empresas`)."""

    def Table(self, nombre):  # noqa: N802 - API de boto3
        import fakes
        return fakes.FakeTabla()

    class meta:  # noqa: N801
        client = None


@pytest.fixture(autouse=True)
def _dynamodb_sin_red(monkeypatch):
    import boto3
    real = boto3.resource
    monkeypatch.setattr(
        boto3, "resource",
        lambda servicio, *a, **k: _RecursoSinRed() if servicio == "dynamodb" else real(servicio, *a, **k),
    )
