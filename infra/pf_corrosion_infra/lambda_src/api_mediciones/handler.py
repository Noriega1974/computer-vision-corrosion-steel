"""
pf-corrosion - Lambda de mediciones.

Almacenamiento: tabla fusionada puntos+mediciones. Los registros de
medición usan sort key "MED#{timestamp}"; el registro del punto padre
usa sort key constante "METADATA" (ver lambda_src/api_puntos).

Rutas:
  GET    /mediciones/{id_punto}    → historial de un punto (cualquier rol)
  GET    /mediciones/recientes     → últimas N mediciones de todos los puntos (cualquier rol)
  DELETE /mediciones/{id_punto}    → elimina una medición puntual (solo admin)
                                      requiere querystring ?id_medicion=MED-...
"""
import json
import logging
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLA_MEDICIONES = os.environ["TABLA_MEDICIONES"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
REGION = os.environ["REGION"]

SK_MEDICION_PREFIJO = "MED#"

dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla = dynamodb.Table(TABLA_MEDICIONES)
s3 = boto3.client("s3", region_name=REGION)


class DecimalEncoder(json.JSONEncoder):
    """Convierte Decimal a float al serializar la respuesta JSON para el cliente."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def _respuesta(codigo: int, cuerpo) -> dict:
    return {
        "statusCode": codigo,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(cuerpo, ensure_ascii=False, cls=DecimalEncoder),
    }


def _claims(event: dict) -> dict:
    return event.get("requestContext", {}).get("authorizer", {}).get("claims", {})


def _es_admin(event: dict) -> bool:
    grupos = _claims(event).get("cognito:groups", "") or ""
    return "admin" in grupos.split(",")


def _agregar_url_imagen(items: list) -> list:
    """Agrega URLs prefirmadas S3 (válidas 1 hora) a cada medición."""
    for item in items:
        if item.get("s3_key_imagen"):
            try:
                item["url_imagen"] = s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": BUCKET_NAME, "Key": item["s3_key_imagen"]},
                    ExpiresIn=3600,
                )
            except Exception as e:
                logger.warning("No se pudo generar URL prefirmada para %s: %s", item["s3_key_imagen"], e)
                item["url_imagen"] = None
    return items


def _eliminar_medicion(event: dict, id_punto: str) -> dict:
    if not _es_admin(event):
        return _respuesta(403, {"error": "Solo administradores pueden eliminar mediciones"})

    qp = event.get("queryStringParameters") or {}
    id_medicion = qp.get("id_medicion")
    if not id_medicion:
        return _respuesta(400, {"error": "Falta id_medicion en la query string"})

    resp = tabla.query(
        KeyConditionExpression=Key("id_punto").eq(id_punto) & Key("sk").begins_with(SK_MEDICION_PREFIJO)
    )
    item = next((i for i in resp.get("Items", []) if i.get("id_medicion") == id_medicion), None)
    if not item:
        return _respuesta(404, {"error": "Medición no encontrada"})

    tabla.delete_item(Key={"id_punto": id_punto, "sk": item["sk"]})

    for campo in ("s3_key_imagen", "s3_key_resultado"):
        key = item.get(campo)
        if key:
            try:
                s3.delete_object(Bucket=BUCKET_NAME, Key=key)
            except Exception:
                logger.warning("No se pudo borrar %s de S3", key)

    return _respuesta(200, {"ok": True, "id_medicion": id_medicion})


def lambda_handler(event: dict, context) -> dict:
    resource = event.get("resource", "")
    http_method = event.get("httpMethod", "GET")
    path_params = event.get("pathParameters") or {}
    id_punto = path_params.get("id_punto")

    try:
        # ── DELETE /mediciones/{id_punto} ────────────────────────────────────
        if http_method == "DELETE" and id_punto:
            return _eliminar_medicion(event, id_punto)

        # ── GET /mediciones/recientes ────────────────────────────────────────
        if resource == "/mediciones/recientes":
            qp = event.get("queryStringParameters") or {}
            limite = min(int(qp.get("limit", 20)), 100)  # máximo 100

            # GSI tipo-timestamp-index: PK="medicion" constante, SK=timestamp DESC
            resp = tabla.query(
                IndexName="tipo-timestamp-index",
                KeyConditionExpression=Key("tipo_registro").eq("medicion"),
                ScanIndexForward=False,   # más reciente primero
                Limit=limite,
            )
            items = _agregar_url_imagen(resp.get("Items", []))
            return _respuesta(200, {
                "total": len(items),
                "mediciones": items,
            })

        # ── GET /mediciones/{id_punto} ───────────────────────────────────────
        elif id_punto:
            qp = event.get("queryStringParameters") or {}
            limite = min(int(qp.get("limite", 50)), 200)

            resp = tabla.query(
                KeyConditionExpression=Key("id_punto").eq(id_punto) & Key("sk").begins_with(SK_MEDICION_PREFIJO),
                ScanIndexForward=False,   # más reciente primero
                Limit=limite,
            )
            items = _agregar_url_imagen(resp.get("Items", []))
            return _respuesta(200, {
                "id_punto": id_punto,
                "total": len(items),
                "mediciones": items,
            })

        return _respuesta(400, {"error": "Ruta no reconocida"})

    except Exception as e:
        logger.exception("Error en api_mediciones: %s", e)
        return _respuesta(500, {"error": str(e)})
