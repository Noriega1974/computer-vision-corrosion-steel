"""Dobles en memoria de S3 y DynamoDB para probar handler.py sin AWS."""
import io
import shutil
from decimal import Decimal

from botocore.exceptions import ClientError


class FakeS3:
    def __init__(self, archivos_descargables=None):
        self.objetos = {}
        self.eliminados = []
        # {(bucket, key): ruta_local} que download_file "baja" copiando.
        self.archivos_descargables = archivos_descargables or {}
        self.descargas = []

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.objetos[(Bucket, Key)] = Body

    def copy_object(self, Bucket, Key, CopySource):
        self.objetos[(Bucket, Key)] = self._obj(CopySource["Bucket"], CopySource["Key"])

    def delete_object(self, Bucket, Key):
        self.eliminados.append((Bucket, Key))
        self.objetos.pop((Bucket, Key), None)

    def _obj(self, Bucket, Key):
        if (Bucket, Key) not in self.objetos:
            raise ClientError({"Error": {"Code": "NoSuchKey", "Message": "no existe"}}, "GetObject")
        return self.objetos[(Bucket, Key)]

    def head_object(self, Bucket, Key):
        return {"ContentLength": len(self._obj(Bucket, Key))}

    def get_object(self, Bucket, Key):
        return {"Body": io.BytesIO(self._obj(Bucket, Key))}

    def download_file(self, bucket, key, destino):
        self.descargas.append((bucket, key))
        if (bucket, key) not in self.archivos_descargables:
            raise FileNotFoundError(f"s3://{bucket}/{key} no existe en el doble")
        shutil.copyfile(self.archivos_descargables[(bucket, key)], destino)


class FakeTabla:
    def __init__(self, items=None, claves=("id",)):
        self.items = list(items or [])
        self.claves = claves
        self.escritos = []

    def get_item(self, Key):
        for it in self.items:
            if all(it.get(k) == v for k, v in Key.items()):
                return {"Item": it}
        return {}

    def query(self, **kwargs):
        return {"Items": list(self.items)}

    def put_item(self, Item):
        _rechazar_floats(Item)
        self.escritos.append(Item)


def _rechazar_floats(obj, ruta="item"):
    """boto3 lanza TypeError si un ítem de DynamoDB contiene float."""
    if isinstance(obj, float):
        raise TypeError(f"Float no permitido por DynamoDB en {ruta}: {obj!r}")
    if isinstance(obj, dict):
        for k, v in obj.items():
            _rechazar_floats(v, f"{ruta}.{k}")
    elif isinstance(obj, (list, tuple)):
        for i, v in enumerate(obj):
            _rechazar_floats(v, f"{ruta}[{i}]")


def tamano_item_dynamodb(obj) -> int:
    """Estimación del tamaño de un ítem según las reglas documentadas de
    DynamoDB (nombres de atributo + valores; mapas/listas +3 bytes y +1 por
    elemento; números ~ dígitos/2 + 1). Es una cota aproximada, no exacta."""
    if isinstance(obj, dict):
        return 3 + sum(len(str(k).encode()) + tamano_item_dynamodb(v) + 1 for k, v in obj.items())
    if isinstance(obj, (list, tuple)):
        return 3 + sum(tamano_item_dynamodb(v) + 1 for v in obj)
    if isinstance(obj, str):
        return len(obj.encode())
    if isinstance(obj, (int, Decimal)):
        digitos = len(str(obj).replace("-", "").replace(".", "")) or 1
        return digitos // 2 + 2
    if obj is None or isinstance(obj, bool):
        return 1
    raise TypeError(type(obj))
