"""
pf-corrosion - Lambda CRUD de puntos de medición.

Almacenamiento: tabla fusionada puntos+mediciones. Los registros de punto
usan sort key constante "METADATA"; las mediciones usan "MED#{timestamp}"
(ver lambda_src/api_mediciones y lambda_src/inference).

Rutas:
  GET  /puntos                    → listar todos (cualquier rol)
  GET  /puntos/{id_punto}         → detalle con historial_cambios (cualquier rol)
  POST /puntos                    → crear directamente (solo admin)
  PUT  /puntos/{id_punto}         → actualizar con auditoría (solo admin)
  DELETE /puntos/{id_punto}       → eliminar (solo admin)

Nota: la ruta GET /puntos/buscar del sistema original fue eliminada en esta
migración (ver README del proyecto).
"""
import json
import logging
import os
from decimal import Decimal
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLA_PUNTOS = os.environ["TABLA_PUNTOS"]
REGION = os.environ["REGION"]

SK_METADATA = "METADATA"

dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla = dynamodb.Table(TABLA_PUNTOS)


# ── Helpers ──────────────────────────────────────────────────────────────────

def floats_to_decimal(obj):
    """Convierte recursivamente floats a Decimal para compatibilidad con DynamoDB."""
    if isinstance(obj, list):
        return [floats_to_decimal(x) for x in obj]
    elif isinstance(obj, dict):
        return {k: floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    return obj


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
    """Extrae los claims del JWT desde el contexto del autorizador Cognito."""
    return event.get("requestContext", {}).get("authorizer", {}).get("claims", {})


def _grupos(event: dict) -> set[str]:
    """Extrae los grupos Cognito del JWT desde el contexto del autorizador."""
    raw = _claims(event).get("cognito:groups", "") or ""
    return set(raw.split(",")) if raw else set()


def _es_admin(event: dict) -> bool:
    return "admin" in _grupos(event)


def _email_usuario(event: dict) -> str:
    """Extrae el email del claim JWT del autorizador Cognito."""
    return _claims(event).get("email", "desconocido")


def _construir_historial_cambio(item_actual: dict, campos_nuevos: dict, email: str) -> dict | None:
    """
    Compara item_actual con campos_nuevos y devuelve un entrada de auditoría
    con solo los campos que realmente cambiaron, o None si no hubo cambios.
    """
    campos_excluidos = {"id_punto", "sk", "historial_cambios", "fecha_creacion"}
    diferencias = {}
    for k, v_nuevo in campos_nuevos.items():
        if k in campos_excluidos:
            continue
        v_actual = item_actual.get(k)
        # Normalizar Decimal → float para comparación justa
        if isinstance(v_actual, Decimal):
            v_actual = float(v_actual)
        if isinstance(v_nuevo, Decimal):
            v_nuevo = float(v_nuevo)
        if v_actual != v_nuevo:
            diferencias[k] = {"antes": v_actual, "despues": v_nuevo}

    if not diferencias:
        return None

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "usuario": email,
        "cambios": diferencias,
    }


# ── Handler principal ────────────────────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:
    metodo = event.get("httpMethod", "")
    path_params = event.get("pathParameters") or {}
    id_punto = path_params.get("id_punto")

    try:
        # ── GET /puntos — listar todos ───────────────────────────────────────
        if metodo == "GET" and not id_punto:
            # Scan filtrado a registros METADATA — la tabla también contiene
            # mediciones (sk="MED#...") que no deben aparecer en este listado.
            resp = tabla.scan(FilterExpression=Attr("sk").eq(SK_METADATA))
            return _respuesta(200, resp.get("Items", []))

        # ── GET /puntos/{id_punto} ───────────────────────────────────────────
        elif metodo == "GET" and id_punto:
            resp = tabla.get_item(Key={"id_punto": id_punto, "sk": SK_METADATA})
            item = resp.get("Item")
            if not item:
                return _respuesta(404, {"error": f"Punto {id_punto} no encontrado"})
            return _respuesta(200, item)

        # ── POST /puntos — crear (solo admin) ────────────────────────────────
        elif metodo == "POST":
            if not _es_admin(event):
                return _respuesta(403, {"error": "Solo administradores pueden crear puntos directamente. Use POST /medicion para el flujo normal."})

            body = json.loads(event.get("body") or "{}")
            id_punto_nuevo = body.get("id_punto")
            if not id_punto_nuevo:
                return _respuesta(400, {"error": "id_punto es requerido"})

            sede = body.get("sede", "")
            ciudad = body.get("ciudad", "")

            creado_por_id = _claims(event).get("sub", "")
            ahora = datetime.now(timezone.utc).isoformat()

            grosor = body.get("grosor_mm")
            item = {
                "id_punto": id_punto_nuevo,
                "sk": SK_METADATA,
                "nombre_punto": body.get("nombre_punto", ""),
                "clave_logica": f"{sede}-{ciudad}",
                "coordenadas": body.get("coordenadas", {}),
                "ciudad": ciudad,
                "departamento": body.get("departamento", ""),
                "tipo_material": body.get("tipo_material", ""),
                "tipo_estructura": body.get("tipo_estructura", ""),
                "grosor_mm": grosor,
                "sede": sede,
                "fecha_creacion": ahora,
                "timestamp": ahora,
            }
            if grosor is None:
                del item["grosor_mm"]
            # GSI de búsqueda inversa por usuario (usuario_id/timestamp) — ver
            # CorriaStorageStack. DynamoDB rechaza strings vacíos como clave
            # de GSI, así que "usuario_id" solo se agrega cuando hay un
            # usuario real (sparse index).
            if creado_por_id:
                item["creado_por_id"] = creado_por_id
                item["usuario_id"] = creado_por_id
            # lat/lng vienen como float desde el frontend — DynamoDB requiere Decimal
            item = floats_to_decimal(item)
            tabla.put_item(Item=item)
            return _respuesta(201, item)

        # ── PUT /puntos/{id_punto} — actualizar con auditoría (solo admin) ─────
        elif metodo == "PUT" and id_punto:
            if not _es_admin(event):
                return _respuesta(403, {"error": "Solo administradores pueden modificar puntos"})

            body = json.loads(event.get("body") or "{}")
            campos = {k: v for k, v in body.items() if k not in ("id_punto", "sk")}
            if not campos:
                return _respuesta(400, {"error": "No hay campos para actualizar"})

            # Leer item actual para auditoría y recalcular clave_logica si aplica
            punto_actual = tabla.get_item(Key={"id_punto": id_punto, "sk": SK_METADATA}).get("Item")
            if not punto_actual:
                return _respuesta(404, {"error": f"Punto {id_punto} no encontrado"})

            if any(k in campos for k in ("sede", "ciudad")):
                sede = campos.get("sede", punto_actual.get("sede", ""))
                ciudad = campos.get("ciudad", punto_actual.get("ciudad", ""))
                campos["clave_logica"] = f"{sede}-{ciudad}"

            # Construir entrada de auditoría con los campos que realmente cambiaron
            email = _email_usuario(event)
            entrada_cambio = _construir_historial_cambio(punto_actual, campos, email)

            expr_parts = [f"#{k} = :{k}" for k in campos]
            nombres = {f"#{k}": k for k in campos}
            # floats en coordenadas u otros campos numéricos → Decimal
            valores = floats_to_decimal({f":{k}": v for k, v in campos.items()})

            if entrada_cambio:
                # Serializar el cambio con Decimal para DynamoDB
                entrada_decimal = floats_to_decimal(entrada_cambio)
                historial_actual = punto_actual.get("historial_cambios", [])

                if len(historial_actual) >= 50:
                    # Mantener las 49 entradas más recientes + la nueva
                    historial_recortado = historial_actual[-(49):]
                    valores[":historial"] = floats_to_decimal(historial_recortado + [entrada_decimal])
                    expr_parts.append("#historial_cambios = :historial")
                    nombres["#historial_cambios"] = "historial_cambios"
                else:
                    # Agregar al final con list_append
                    valores[":nueva_entrada"] = [entrada_decimal]
                    valores[":lista_vacia"] = []
                    expr_parts.append(
                        "#historial_cambios = list_append(if_not_exists(#historial_cambios, :lista_vacia), :nueva_entrada)"
                    )
                    nombres["#historial_cambios"] = "historial_cambios"

            tabla.update_item(
                Key={"id_punto": id_punto, "sk": SK_METADATA},
                UpdateExpression="SET " + ", ".join(expr_parts),
                ExpressionAttributeNames=nombres,
                ExpressionAttributeValues=valores,
            )
            return _respuesta(200, {"mensaje": "Punto actualizado", "id_punto": id_punto})

        # ── DELETE /puntos/{id_punto} — eliminar (solo admin) ────────────────
        elif metodo == "DELETE" and id_punto:
            if not _es_admin(event):
                return _respuesta(403, {"error": "Solo administradores pueden eliminar puntos"})

            tabla.delete_item(Key={"id_punto": id_punto, "sk": SK_METADATA})
            return _respuesta(200, {"mensaje": "Punto eliminado", "id_punto": id_punto})

        return _respuesta(405, {"error": f"Método {metodo} no permitido"})

    except Exception as e:
        logger.exception("Error en api_puntos: %s", e)
        return _respuesta(500, {"error": str(e)})
