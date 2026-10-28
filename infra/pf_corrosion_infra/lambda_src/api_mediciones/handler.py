"""
pf-corrosion - Lambda de mediciones.

Almacenamiento: tabla fusionada puntos+mediciones. Los registros de
medición usan sort key "MED#{timestamp}". `id_punto` es un identificador
opaco para este handler -- nunca resuelve un registro "padre" con
sk="METADATA" (eso era el punto viejo, retirado en la fusión punto→bloque,
ver lambda_src/api_puntos). Hoy `id_punto` vale el `id_bloque` (BLQ-...) de
la medición; a este handler no le importa, solo lo usa como clave.

Rutas:
  GET    /mediciones/{id_punto}    → historial de un punto, filtrado por empresa (cualquier rol)
                                      ?limite=N (def. 50, máx. 500), ?resumen=1 quita campos pesados,
                                      ?id_medicion=X devuelve solo esa medicion (completa)
  GET    /mediciones/recientes     → últimas N mediciones, filtrado por empresa (cualquier rol)
                                      ?limit=N (def. 20, máx. 1000), ?resumen=1 quita campos pesados
  DELETE /mediciones/{id_punto}    → elimina una medición puntual (super_admin/admin/tecnico)
                                      requiere querystring ?id_medicion=MED-...
  POST   /mediciones/lote/eliminar → elimina varias (máx. 100), body {"items":[{id_punto,id_medicion}]}
  POST   /mediciones/lote/mover    → mueve varias a otro punto, body {"items":[...],"destino_bloque_id"}
                                      ambas responden 200 {"ok":[id_medicion],"error":[{id_medicion,motivo}]}
  PATCH  /mediciones/{id_punto}    → renombra la foto de una medición (admin/super_admin)
                                      mismo ?id_medicion=MED-... y mismas reglas que DELETE;
                                      body {"nombre": "..."} ("" quita el nombre)

RBAC multi-empresa: no hay POST acá (la creación de mediciones ocurre en
lambda_src/inference, ver ese handler para el bloqueo de `cliente` y la
resolución de empresa_id al crear). Esta lambda solo lee/borra, así que el
único cambio es filtrar por el empresa_id del caller (`_usuario_actual`,
replicado de api_usuarios/handler.py — no hay módulo compartido entre
lambdas) salvo que sea super_admin, que ve todas las empresas.
"""
import json
import logging
import os
import re
import sys
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLA_MEDICIONES = os.environ["TABLA_MEDICIONES"]
TABLA_USUARIOS = os.environ["TABLA_USUARIOS"]
TABLA_BLOQUES = os.environ["TABLA_BLOQUES"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
REGION = os.environ["REGION"]

SK_MEDICION_PREFIJO = "MED#"

# Roles que pueden eliminar y mover mediciones (cliente solo lee).
ROLES_GESTION = ("super_admin", "admin", "tecnico")
CAMPOS_S3 = ("s3_key_imagen", "s3_key_thumbnail", "s3_key_resultado")
LOTE_MAX = 100

LIMITE_RECIENTES_MAX = 1000
LIMITE_PUNTO_MAX = 500
# Tope de páginas por consulta: acota el costo si el filtro por empresa
# descarta casi todo (el Limit de DynamoDB cuenta ítems ANTES del filtro).
MAX_PAGINAS = 40
# Campos que pesan (máscaras, detecciones, ...) y que la galería no usa: con
# ?resumen=1 se omiten para que 1000 mediciones quepan en los 6 MB de respuesta.
CAMPOS_PESADOS = ("mascaras", "detecciones", "inferencia_local", "clima")

# Mismo criterio que lambda_src/inference (_nombre_foto): no hay módulo
# compartido entre lambdas, así que se replica.
NOMBRE_MAX = 80
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla = dynamodb.Table(TABLA_MEDICIONES)
tabla_usuarios = dynamodb.Table(TABLA_USUARIOS)
tabla_bloques = dynamodb.Table(TABLA_BLOQUES)
# Cliente de bajo nivel (con la conversión de tipos de boto3) para TransactWriteItems.
cliente_ddb = dynamodb.meta.client
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


def _agregar_url_imagen(items: list) -> list:
    """Agrega URLs prefirmadas S3 (válidas 1 hora) a cada medición.

    `url_thumbnail` apunta a la miniatura (~400px) para las tarjetas de la
    galería. Las mediciones de antes de 2026-08-18 no tienen
    `s3_key_thumbnail` (nunca se generó una) -- para esas, url_thumbnail cae
    a la imagen original, así el frontend no necesita saber cuáles son
    viejas: siempre puede usar url_thumbnail si existe.
    """
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

        clave_thumb = item.get("s3_key_thumbnail")
        if clave_thumb:
            try:
                item["url_thumbnail"] = s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": BUCKET_NAME, "Key": clave_thumb},
                    ExpiresIn=3600,
                )
            except Exception as e:
                logger.warning("No se pudo generar URL prefirmada para %s: %s", clave_thumb, e)
                item["url_thumbnail"] = item.get("url_imagen")
        else:
            item["url_thumbnail"] = item.get("url_imagen")
    return items


def _consultar(kwargs: dict, limite: int) -> list:
    """Corre `tabla.query` paginando hasta juntar `limite` ítems que pasan el
    FilterExpression (o hasta agotar las páginas / MAX_PAGINAS)."""
    items = []
    for _ in range(MAX_PAGINAS):
        resp = tabla.query(**kwargs)
        items.extend(resp.get("Items", []))
        ultima = resp.get("LastEvaluatedKey")
        if len(items) >= limite or not ultima:
            break
        kwargs = {**kwargs, "ExclusiveStartKey": ultima}
    return items[:limite]


def _mediciones_de_punto(id_punto: str) -> list:
    """Todas las mediciones de un punto (sin filtrar por empresa)."""
    return _consultar(
        {"KeyConditionExpression": Key("id_punto").eq(id_punto) & Key("sk").begins_with(SK_MEDICION_PREFIJO)},
        sys.maxsize,
    )


def _puede_gestionar(usuario: dict | None) -> bool:
    return bool(usuario) and usuario.get("rol") in ROLES_GESTION


def _item_permitido(usuario: dict, item: dict) -> bool:
    """super_admin ve todo; el resto solo mediciones de su propia empresa
    (y un usuario sin empresa no ve ninguna)."""
    if usuario.get("rol") == "super_admin":
        return True
    empresa = usuario.get("empresa_id")
    return bool(empresa) and item.get("empresa_id") == empresa


def _sin_campos_pesados(items: list) -> list:
    for item in items:
        for campo in CAMPOS_PESADOS:
            item.pop(campo, None)
    return items


ADVERTENCIA_S3 = "La medición se eliminó, pero una de sus imágenes no se pudo borrar del almacenamiento."


def _borrar_objeto_s3(key: str, contexto: str) -> bool:
    """Borra un objeto de S3 con un reintento. Si sigue fallando deja una línea
    ERROR greppable (`ORPHAN_S3 key=...`) en CloudWatch y devuelve False; nunca
    lanza: el ítem de DynamoDB ya manda y un objeto huérfano no rompe nada."""
    error = None
    for _ in range(2):
        try:
            s3.delete_object(Bucket=BUCKET_NAME, Key=key)
            return True
        except Exception as e:
            error = e
    logger.error("ORPHAN_S3 key=%s contexto=%s error=%s", key, contexto, error)
    return False


def _borrar_medicion(item: dict) -> list:
    """Borra el ítem de DynamoDB y sus objetos en S3. Devuelve las claves S3
    que no se pudieron borrar (tras un reintento): el ítem ya no existe, así
    que no se falla, pero quedan registradas como ORPHAN_S3."""
    tabla.delete_item(Key={"id_punto": item["id_punto"], "sk": item["sk"]})
    huerfanas = []
    for campo in CAMPOS_S3:
        key = item.get(campo)
        if key and not _borrar_objeto_s3(key, "borrar_medicion"):
            huerfanas.append(key)
    return huerfanas


def _eliminar_medicion(event: dict, id_punto: str) -> dict:
    creador = _usuario_actual(event)
    if not _puede_gestionar(creador):
        return _respuesta(403, {"error": "No tienes permiso para eliminar mediciones. Pide ayuda a un administrador"})

    qp = event.get("queryStringParameters") or {}
    id_medicion = qp.get("id_medicion")
    if not id_medicion:
        return _respuesta(400, {"error": "No se indicó qué medición usar. Recarga la página e inténtalo de nuevo"})

    item = next((i for i in _mediciones_de_punto(id_punto) if i.get("id_medicion") == id_medicion), None)
    if not item or not _item_permitido(creador, item):
        return _respuesta(404, {"error": "No se encontró la medición. Actualiza la lista e inténtalo de nuevo"})

    huerfanas = _borrar_medicion(item)
    cuerpo = {"ok": True, "id_medicion": id_medicion}
    if huerfanas:
        cuerpo["advertencias"] = [{"id_medicion": id_medicion, "motivo": ADVERTENCIA_S3}]
    return _respuesta(200, cuerpo)


# ── Acciones en lote ─────────────────────────────────────────────────────────

def _leer_lote(event: dict) -> tuple[list, dict]:
    """Valida el body de un POST /mediciones/lote/*. Devuelve (items sin
    duplicados, body). Lanza ValueError con el mensaje para el 400."""
    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, ValueError):
        raise ValueError("No se pudo leer la solicitud. Recarga la página e inténtalo de nuevo")
    items = body.get("items") if isinstance(body, dict) else None
    if not isinstance(items, list) or not items:
        raise ValueError("Selecciona al menos una medición e inténtalo de nuevo")
    if len(items) > LOTE_MAX:
        raise ValueError(f"Puedes seleccionar máximo {LOTE_MAX} mediciones a la vez. Reduce la selección e inténtalo de nuevo")
    vistos, unicos = set(), []
    for it in items:
        if not isinstance(it, dict):
            raise ValueError("La selección de mediciones no es válida. Recarga la página e inténtalo de nuevo")
        par = (it.get("id_punto"), it.get("id_medicion"))
        if not all(isinstance(v, str) and v.strip() for v in par):
            raise ValueError("La selección de mediciones no es válida. Recarga la página e inténtalo de nuevo")
        if par not in vistos:
            vistos.add(par)
            unicos.append({"id_punto": par[0], "id_medicion": par[1]})
    return unicos, body


def _resolver_lote(creador: dict, pedidos: list) -> tuple[list, list]:
    """Busca cada medición pedida (una consulta por punto) y aplica la
    autorización por empresa. Devuelve (ítems encontrados, errores)."""
    por_punto: dict = {}
    encontrados, errores = [], []
    for p in pedidos:
        if p["id_punto"] not in por_punto:
            por_punto[p["id_punto"]] = {i.get("id_medicion"): i for i in _mediciones_de_punto(p["id_punto"])}
        item = por_punto[p["id_punto"]].get(p["id_medicion"])
        if item and _item_permitido(creador, item):
            encontrados.append(item)
        else:
            # Mismo mensaje para "no existe" y "es de otra empresa": no revela nada.
            errores.append({"id_medicion": p["id_medicion"], "motivo": "No se encontró la medición. Actualiza la lista e inténtalo de nuevo"})
    return encontrados, errores


def _lote_eliminar(event: dict) -> dict:
    creador = _usuario_actual(event)
    if not _puede_gestionar(creador):
        return _respuesta(403, {"error": "No tienes permiso para eliminar mediciones. Pide ayuda a un administrador"})
    try:
        pedidos, _ = _leer_lote(event)
    except ValueError as e:
        return _respuesta(400, {"error": str(e)})

    encontrados, errores = _resolver_lote(creador, pedidos)
    ok, advertencias = [], []
    for item in encontrados:
        try:
            huerfanas = _borrar_medicion(item)
            ok.append(item["id_medicion"])
            if huerfanas:
                advertencias.append({"id_medicion": item["id_medicion"], "motivo": ADVERTENCIA_S3})
        except Exception as e:
            logger.exception("No se pudo eliminar %s: %s", item.get("id_medicion"), e)
            errores.append({"id_medicion": item["id_medicion"], "motivo": "No se pudo eliminar. Inténtalo de nuevo"})
    cuerpo = {"ok": ok, "error": errores}
    if advertencias:
        cuerpo["advertencias"] = advertencias
    return _respuesta(200, cuerpo)


def _copiar_resultado(origen: str, destino: str, id_punto: str, claves_nuevas: dict) -> None:
    """Copia el JSON de resultado actualizando su id_punto y sus claves S3 (es
    una foto del análisis, pero así no queda apuntando al punto viejo). Si no
    se puede interpretar como JSON se copia tal cual."""
    cuerpo = s3.get_object(Bucket=BUCKET_NAME, Key=origen)["Body"].read()
    try:
        datos = json.loads(cuerpo)
        if isinstance(datos, dict):
            datos["id_punto"] = id_punto
            for campo, key in claves_nuevas.items():
                if campo in datos:
                    datos[campo] = key
            cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
    except ValueError:
        pass
    s3.put_object(Bucket=BUCKET_NAME, Key=destino, Body=cuerpo, ContentType="application/json")


def _mover_medicion(item: dict, bloque: dict) -> None:
    """Mueve una medición al bloque destino.

    `id_punto` es la partition key, así que mover = escribir el ítem bajo el
    destino y borrar el viejo, en una sola TransactWriteItems (Put con
    attribute_not_exists + Delete con attribute_exists). S3: se copian los
    objetos al prefijo del destino ANTES de la transacción y los viejos se
    borran solo DESPUÉS de que confirma; si algo falla se quitan las copias.
    """
    destino = bloque["id_bloque"]
    prefijo = f"empresas/{bloque.get('empresa_id') or 'sin-empresa'}/{destino}"
    viejas = {c: item[c] for c in CAMPOS_S3 if item.get(c)}
    nuevas = {c: f"{prefijo}/{k.rsplit('/', 1)[-1]}" for c, k in viejas.items()}

    nuevo = dict(item)
    nuevo["id_punto"] = destino
    nuevo["bloque_id"] = destino
    nuevo.update(nuevas)
    if bloque.get("nombre"):
        nuevo["bloque_nombre"] = bloque["nombre"]
    else:
        nuevo.pop("bloque_nombre", None)
    if bloque.get("empresa_id"):
        nuevo["empresa_id"] = bloque["empresa_id"]
    else:
        nuevo.pop("empresa_id", None)

    copiadas = []
    try:
        for campo, vieja in viejas.items():
            if campo == "s3_key_resultado":
                _copiar_resultado(vieja, nuevas[campo], destino, nuevas)
            else:
                s3.copy_object(Bucket=BUCKET_NAME, Key=nuevas[campo], CopySource={"Bucket": BUCKET_NAME, "Key": vieja})
            copiadas.append(nuevas[campo])
        cliente_ddb.transact_write_items(TransactItems=[
            {"Put": {
                "TableName": TABLA_MEDICIONES, "Item": nuevo,
                "ConditionExpression": "attribute_not_exists(id_punto)",
            }},
            {"Delete": {
                "TableName": TABLA_MEDICIONES, "Key": {"id_punto": item["id_punto"], "sk": item["sk"]},
                "ConditionExpression": "attribute_exists(id_punto)",
            }},
        ])
    except Exception:
        for key in copiadas:
            _borrar_objeto_s3(key, "mover_rollback_copia")
        raise

    for key in viejas.values():
        _borrar_objeto_s3(key, "mover_borrar_original")


def _lote_mover(event: dict) -> dict:
    creador = _usuario_actual(event)
    if not _puede_gestionar(creador):
        return _respuesta(403, {"error": "No tienes permiso para mover mediciones. Pide ayuda a un administrador"})
    try:
        pedidos, body = _leer_lote(event)
        destino = body.get("destino_bloque_id")
        if not isinstance(destino, str) or not destino.strip():
            raise ValueError("Elige el punto de destino")
    except ValueError as e:
        return _respuesta(400, {"error": str(e)})

    bloque = tabla_bloques.get_item(Key={"id_bloque": destino}).get("Item")
    if not bloque:
        return _respuesta(404, {"error": "No se encontró el punto de destino. Actualiza la lista e inténtalo de nuevo"})
    if creador.get("rol") != "super_admin" and (
        not creador.get("empresa_id") or bloque.get("empresa_id") != creador.get("empresa_id")
    ):
        return _respuesta(403, {"error": "El punto de destino pertenece a otra zona. Elige un punto de tu zona"})
    if bloque.get("activo") is False:
        return _respuesta(400, {"error": "El punto de destino está inactivo. Actívalo o elige otro punto"})

    encontrados, errores = _resolver_lote(creador, pedidos)
    ok = []
    for item in encontrados:
        if item["id_punto"] == destino:
            ok.append(item["id_medicion"])   # ya está ahí: nada que hacer
            continue
        try:
            _mover_medicion(item, bloque)
            ok.append(item["id_medicion"])
        except Exception as e:
            logger.exception("No se pudo mover %s: %s", item.get("id_medicion"), e)
            errores.append({"id_medicion": item["id_medicion"], "motivo": "No se pudo mover. Inténtalo de nuevo"})
    return _respuesta(200, {"ok": ok, "error": errores})


def _nombre_foto(valor) -> str:
    """Sin caracteres de control, espacios colapsados, recortado y truncado a 80."""
    limpio = " ".join(_CONTROL_RE.sub(" ", valor).split())
    return limpio[:NOMBRE_MAX].rstrip()


def _renombrar_medicion(event: dict, id_punto: str) -> dict:
    """Misma identificación y autorización por empresa que `_eliminar_medicion`
    (pero solo admin/super_admin: tecnico no renombra). La fuente
    de verdad del nombre es DynamoDB; el JSON de resultado en S3 es una foto del
    análisis y no se reescribe (la web lee `nombre` del ítem)."""
    creador = _usuario_actual(event)
    if not creador or creador.get("rol") not in ("admin", "super_admin"):
        return _respuesta(403, {"error": "Solo los administradores pueden renombrar mediciones. Pide ayuda a un administrador"})

    qp = event.get("queryStringParameters") or {}
    id_medicion = qp.get("id_medicion")
    if not id_medicion:
        return _respuesta(400, {"error": "No se indicó qué medición usar. Recarga la página e inténtalo de nuevo"})

    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, ValueError):
        body = None
    if not isinstance(body, dict) or not isinstance(body.get("nombre"), str):
        return _respuesta(400, {"error": "No se pudo leer el nombre nuevo. Escríbelo de nuevo e inténtalo otra vez"})
    nombre = _nombre_foto(body["nombre"])

    item = next((i for i in _mediciones_de_punto(id_punto) if i.get("id_medicion") == id_medicion), None)
    if not item or not _item_permitido(creador, item):
        return _respuesta(404, {"error": "No se encontró la medición. Actualiza la lista e inténtalo de nuevo"})

    # "name" es palabra reservada de DynamoDB: va por alias.
    if nombre:
        expr, valores = "SET #n = :n", {":n": nombre}
    else:
        expr, valores = "REMOVE #n", None
    kwargs = dict(
        Key={"id_punto": id_punto, "sk": item["sk"]},
        UpdateExpression=expr,
        ExpressionAttributeNames={"#n": "nombre"},
        ConditionExpression=Attr("id_medicion").eq(id_medicion),
    )
    if valores:
        kwargs["ExpressionAttributeValues"] = valores
    tabla.update_item(**kwargs)

    return _respuesta(200, {"ok": True, "id_medicion": id_medicion, "nombre": nombre})


def lambda_handler(event: dict, context) -> dict:
    resource = event.get("resource", "")
    http_method = event.get("httpMethod", "GET")
    path_params = event.get("pathParameters") or {}
    id_punto = path_params.get("id_punto")

    try:
        # ── POST /mediciones/lote/eliminar | /mediciones/lote/mover ──────────
        if http_method == "POST" and resource == "/mediciones/lote/eliminar":
            return _lote_eliminar(event)
        if http_method == "POST" and resource == "/mediciones/lote/mover":
            return _lote_mover(event)

        # ── DELETE /mediciones/{id_punto} ────────────────────────────────────
        if http_method == "DELETE" and id_punto:
            return _eliminar_medicion(event, id_punto)

        # ── PATCH /mediciones/{id_punto} ─────────────────────────────────────
        if http_method == "PATCH" and id_punto:
            return _renombrar_medicion(event, id_punto)

        # ── GET /mediciones/recientes ────────────────────────────────────────
        if resource == "/mediciones/recientes":
            qp = event.get("queryStringParameters") or {}
            limite = min(int(qp.get("limit", 20)), LIMITE_RECIENTES_MAX)
            creador = _usuario_actual(event)

            # GSI tipo-timestamp-index: PK="medicion" constante, SK=timestamp DESC
            kwargs = dict(
                IndexName="tipo-timestamp-index",
                KeyConditionExpression=Key("tipo_registro").eq("medicion"),
                ScanIndexForward=False,   # más reciente primero
                Limit=limite,
            )
            if not creador or creador.get("rol") != "super_admin":
                # Ver datos de otra empresa es exclusivo de super_admin.
                empresa_id = creador.get("empresa_id") if creador else None
                kwargs["FilterExpression"] = Attr("empresa_id").eq(empresa_id)
            # Limit cuenta ítems antes del filtro: se pagina hasta juntar `limite`.
            items = _consultar(kwargs, limite)
            if qp.get("resumen") == "1":
                _sin_campos_pesados(items)
            items = _agregar_url_imagen(items)
            return _respuesta(200, {
                "total": len(items),
                "mediciones": items,
            })

        # ── GET /mediciones/{id_punto} ───────────────────────────────────────
        elif id_punto:
            qp = event.get("queryStringParameters") or {}
            limite = min(int(qp.get("limite", 50)), LIMITE_PUNTO_MAX)
            creador = _usuario_actual(event)
            # ?id_medicion=X: la página de detalle pide UNA medición (con todos
            # sus campos) aunque sea antigua. Se filtra en DynamoDB y se pagina
            # hasta hallarla; el Limit de cada página sigue siendo el máximo.
            id_medicion = qp.get("id_medicion")
            if id_medicion:
                limite_paginas, limite = LIMITE_PUNTO_MAX, 1
            else:
                limite_paginas = limite

            kwargs = dict(
                KeyConditionExpression=Key("id_punto").eq(id_punto) & Key("sk").begins_with(SK_MEDICION_PREFIJO),
                ScanIndexForward=False,   # más reciente primero
                Limit=limite_paginas,
            )
            filtro = None
            if id_medicion:
                filtro = Attr("id_medicion").eq(id_medicion)
            if not creador or creador.get("rol") != "super_admin":
                empresa_id = creador.get("empresa_id") if creador else None
                filtro_empresa = Attr("empresa_id").eq(empresa_id)
                filtro = filtro_empresa if filtro is None else filtro & filtro_empresa
            if filtro is not None:
                kwargs["FilterExpression"] = filtro
            items = _consultar(kwargs, limite)
            if qp.get("resumen") == "1":
                _sin_campos_pesados(items)
            items = _agregar_url_imagen(items)
            return _respuesta(200, {
                "id_punto": id_punto,
                "total": len(items),
                "mediciones": items,
            })

        return _respuesta(400, {"error": "Esta acción no está disponible. Recarga la página e inténtalo de nuevo"})

    except Exception as e:
        logger.exception("Error en api_mediciones: %s", e)
        return _respuesta(500, {"error": "Ocurrió un error inesperado. Inténtalo de nuevo; si persiste, contacta a un administrador"})
