"""
pf-corrosion - Lambda de alertas.
GET /alertas → mediciones con nivel_corrosion >= 2 (moderada/severa) de las últimas 24h.

Almacenamiento: tabla fusionada puntos+mediciones (TABLA_MEDICIONES apunta a
esa tabla). El GSI nivel-timestamp-index solo indexa registros de medición
(los registros de punto no tienen nivel_corrosion).

RBAC multi-empresa: se filtra por el empresa_id del usuario autenticado
(`_usuario_actual`, replicado de api_usuarios/handler.py — no hay módulo
compartido entre lambdas) salvo que sea super_admin, que ve alertas de
todas las empresas.
"""
import json
import logging
import os
from decimal import Decimal
from datetime import datetime, timedelta, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLA_MEDICIONES = os.environ["TABLA_MEDICIONES"]
TABLA_USUARIOS = os.environ["TABLA_USUARIOS"]
REGION = os.environ["REGION"]

dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla = dynamodb.Table(TABLA_MEDICIONES)
tabla_usuarios = dynamodb.Table(TABLA_USUARIOS)


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


def _usuario_actual(event: dict) -> dict | None:
    """Resuelve el ítem completo (rol, empresa_id, id_usuario, ...) del
    usuario autenticado a partir de `sub` (claim del JWT), vía el GSI
    cognito-sub-index de la tabla `usuarios`. Replicado igual en
    api_usuarios/handler.py — no hay módulo compartido entre lambdas."""
    sub = _claims(event).get("sub", "")
    if not sub:
        return None
    resp = tabla_usuarios.query(
        IndexName="cognito-sub-index",
        KeyConditionExpression=Key("cognito_sub").eq(sub),
        Limit=1,
    )
    items = resp.get("Items", [])
    return items[0] if items else None


def lambda_handler(event: dict, context) -> dict:
    try:
        query_params = event.get("queryStringParameters") or {}
        horas = int(query_params.get("horas", 24))
        nivel_minimo = int(query_params.get("nivel_minimo", 2))

        creador = _usuario_actual(event)
        filtrar_por_empresa = not creador or creador.get("rol") != "super_admin"
        empresa_id = creador.get("empresa_id") if creador else None

        # Timestamp de corte
        desde = (datetime.now(timezone.utc) - timedelta(hours=horas)).isoformat()

        # Usar el GSI nivel-timestamp-index para niveles moderado (2) y severo (3)
        alertas = []
        for nivel in range(nivel_minimo, 4):
            kwargs = dict(
                IndexName="nivel-timestamp-index",
                KeyConditionExpression=(
                    Key("nivel_corrosion").eq(nivel)
                    & Key("timestamp").gte(desde)
                ),
                ScanIndexForward=False,
            )
            if filtrar_por_empresa:
                # Ver datos de otra empresa es exclusivo de super_admin.
                kwargs["FilterExpression"] = Attr("empresa_id").eq(empresa_id)
            resp = tabla.query(**kwargs)
            alertas.extend(resp.get("Items", []))

        # Ordenar combinado por timestamp descendente
        alertas.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        return _respuesta(200, {
            "total": len(alertas),
            "desde": desde,
            "nivel_minimo": nivel_minimo,
            "alertas": alertas,
        })

    except Exception as e:
        logger.exception("Error en api_alertas: %s", e)
        return _respuesta(500, {"error": str(e)})
