"""
pf-corrosion - Lambda CRUD de puntos de medición.

Almacenamiento: tabla fusionada puntos+mediciones. Los registros de punto
usan sort key constante "METADATA"; las mediciones usan "MED#{timestamp}"
(ver lambda_src/api_mediciones y lambda_src/inference).

Rutas:
  GET  /puntos                    → listar, filtrado por empresa (excepto super_admin);
                                    cada punto con bloque_id trae bloque_nombre resuelto
  GET  /puntos/{id_punto}         → detalle con historial_cambios (cualquier rol)
  POST /puntos                    → crear directamente (admin/super_admin; cliente y tecnico: 403);
                                    acepta bloque_id opcional (debe existir, ser de la misma
                                    empresa y estar activo)
  PUT  /puntos/{id_punto}         → actualizar con auditoría (solo admin/super_admin);
                                    bloque_id se puede cambiar (mismas validaciones) o
                                    desasignar con bloque_id: null
  DELETE /puntos/{id_punto}       → eliminar (solo super_admin -- un punto es la "Zona",
                                    admin solo puede borrar bloques dentro de ella)

  GET    /bloques                 → listar bloques de la empresa del caller (super_admin: todos,
                                    o los de ?empresa_id=); cada uno con cantidad_mediciones
  POST   /bloques                 → crear bloque (tecnico/admin/super_admin; super_admin debe
                                    mandar empresa_id, tecnico/admin quedan forzados a la suya);
                                    requiere coordenadas, ciudad y departamento -- el bloque
                                    absorbió el rol del punto viejo como entidad que lleva
                                    mediciones (ver POST /medicion en lambda_src/inference)
  PUT    /bloques/{id_bloque}     → editar nombre/descripcion/activo/coordenadas/ciudad/
                                    departamento/tipo_material/tipo_estructura/grosor_mm (solo super_admin
                                    o admin de esa empresa -- tecnico crea pero no edita)
  DELETE /bloques/{id_bloque}     → eliminar (solo super_admin o admin de esa empresa; 409 si
                                    tiene mediciones -- tecnico no puede borrar)

Bloques: jerarquía de UN nivel, empresa → bloque → medición, sin
anidamiento. Un bloque es una "carpeta" dentro de una empresa (tabla
`bloques`, GSI `empresa_id-index`). Al crear un bloque se deja un marcador
vacío `empresas/{empresa_id}/{id_bloque}/` en el bucket de imágenes — es
solo cosmético (hace visible la carpeta en la consola), el ítem en
DynamoDB es la fuente de verdad.

Fusión punto→bloque: el bloque absorbió el rol del punto viejo como
entidad que lleva coordenadas y mediciones (POST /medicion en
lambda_src/inference ya no crea ni referencia ningún punto, solo un
bloque existente). Por eso POST/PUT /bloques ahora también aceptan
`coordenadas`, `ciudad`, `departamento`, `tipo_material` y
`tipo_estructura`. Las rutas /puntos de abajo quedaron sin consumidor
desde el frontend tras esta fusión — ver el comentario arriba de esas
rutas en `lambda_handler`.

Nota: la ruta GET /puntos/buscar del sistema original fue eliminada en esta
migración (ver README del proyecto).

RBAC multi-empresa: `empresa_id` de un punto nuevo se resuelve SIEMPRE del
usuario autenticado (`_usuario_actual`, replicado de api_usuarios/handler.py
— no hay módulo compartido entre lambdas, ver README), nunca de un campo del
body, EXCEPTO para super_admin (que no tiene empresa_id propio): en ese caso
`empresa_id` es obligatorio en el body y se valida contra la tabla
`empresas` (mismo patrón que POST /usuarios). GET /puntos filtra por el
empresa_id del caller salvo que sea super_admin (ve todas). `cliente` no
puede crear/editar/eliminar puntos.
"""
import json
import logging
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLA_PUNTOS = os.environ["TABLA_PUNTOS"]
TABLA_USUARIOS = os.environ["TABLA_USUARIOS"]
TABLA_EMPRESAS = os.environ["TABLA_EMPRESAS"]
TABLA_BLOQUES = os.environ["TABLA_BLOQUES"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
REGION = os.environ["REGION"]

SK_METADATA = "METADATA"

dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla = dynamodb.Table(TABLA_PUNTOS)
tabla_usuarios = dynamodb.Table(TABLA_USUARIOS)
tabla_empresas = dynamodb.Table(TABLA_EMPRESAS)
tabla_bloques = dynamodb.Table(TABLA_BLOQUES)
# Solo para dejar el marcador `empresas/{empresa_id}/{id_bloque}/` al crear
# un bloque (grant acotado a PutObject bajo ese prefijo, ver CorriaComputeStack).
s3 = boto3.client("s3", region_name=REGION)


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
    """`cuerpo=None` → respuesta sin body (p. ej. 204 No Content)."""
    return {
        "statusCode": codigo,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": "" if cuerpo is None else json.dumps(cuerpo, ensure_ascii=False, cls=DecimalEncoder),
    }


def _claims(event: dict) -> dict:
    """Extrae los claims del JWT desde el contexto del autorizador Cognito."""
    return event.get("requestContext", {}).get("authorizer", {}).get("claims", {})


def _grupos(event: dict) -> set[str]:
    """Extrae los grupos Cognito del JWT desde el contexto del autorizador."""
    raw = _claims(event).get("cognito:groups", "") or ""
    return set(raw.split(",")) if raw else set()


def _es_admin(event: dict) -> bool:
    return bool(_grupos(event) & {"admin", "super_admin"})


def _email_usuario(event: dict) -> str:
    """Extrae el email del claim JWT del autorizador Cognito."""
    return _claims(event).get("email", "desconocido")


def _usuario_actual(event: dict) -> dict | None:
    """Resuelve el ítem completo (rol, empresa_id, id_usuario, ...) del
    usuario autenticado a partir de `sub` (claim del JWT), vía el GSI
    cognito-sub-index de la tabla `usuarios`. Necesario porque `id_usuario`
    (PK, `USR-<uuid>` generado por la app) NO es el mismo valor que
    `cognito_sub`. Replicado igual en api_usuarios/handler.py — no hay
    módulo compartido entre lambdas en este proyecto (cada una es un asset
    standalone para CDK), así que se duplica el helper en vez de extraer un
    paquete compartido."""
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


# ── Helpers de bloques ───────────────────────────────────────────────────────

def _bloques_de_empresa(empresa_id: str | None) -> list[dict]:
    """Todos los bloques de una empresa vía el GSI empresa_id-index.
    Con empresa_id None (usuario sin empresa) devuelve lista vacía en vez de
    consultar por vacío por accidente."""
    if not empresa_id:
        return []
    items: list[dict] = []
    kwargs = dict(
        IndexName="empresa_id-index",
        KeyConditionExpression=Key("empresa_id").eq(empresa_id),
    )
    while True:
        resp = tabla_bloques.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def _todos_los_bloques() -> list[dict]:
    """Scan completo de la tabla de bloques (solo super_admin sin filtro)."""
    items: list[dict] = []
    kwargs: dict = {}
    while True:
        resp = tabla_bloques.scan(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def _contar_mediciones_de_bloque(id_bloque: str) -> int:
    """Cuenta las mediciones colgadas de un bloque. Tras la fusión
    punto→bloque, `POST /medicion` escribe la medición con `id_punto =
    id_bloque` (mismo atributo de siempre en la tabla fusionada, ahora con
    forma BLQ-...) y `sk = "MED#{timestamp}"` -- eso es justo el PK+prefijo
    de sk, así que esto es una Query directa por partición, no un scan."""
    total = 0
    kwargs = dict(
        KeyConditionExpression=Key("id_punto").eq(id_bloque) & Key("sk").begins_with("MED#"),
        Select="COUNT",
    )
    while True:
        resp = tabla.query(**kwargs)
        total += resp.get("Count", 0)
        if "LastEvaluatedKey" not in resp:
            return total
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def _nombre_bloque_repetido(empresa_id: str | None, nombre: str, excluir_id: str | None = None) -> bool:
    """True si ya existe otro bloque con ese nombre (case-insensitive) en la
    misma empresa. Mismo criterio que POST/PUT /empresas en api_usuarios."""
    objetivo = nombre.strip().lower()
    return any(
        (b.get("nombre") or "").strip().lower() == objetivo and b.get("id_bloque") != excluir_id
        for b in _bloques_de_empresa(empresa_id)
    )


def _validar_bloque_para_punto(bloque_id, empresa_id_punto: str | None) -> tuple[int, str] | None:
    """Valida que `bloque_id` pueda asignarse a un punto de `empresa_id_punto`.
    Devuelve (codigo_http, mensaje) si NO es válido, o None si está todo bien.
    Reglas: debe ser string, existir (404), pertenecer a la misma empresa
    que el punto (400) y estar activo (400)."""
    if not isinstance(bloque_id, str) or not bloque_id.strip():
        return 400, "bloque_id debe ser un texto no vacío"
    bloque = tabla_bloques.get_item(Key={"id_bloque": bloque_id}).get("Item")
    if not bloque:
        return 404, f"Bloque {bloque_id} no encontrado"
    if bloque.get("empresa_id") != empresa_id_punto:
        return 400, "El bloque pertenece a otra empresa"
    if bloque.get("activo") is False:
        return 400, "El bloque está inactivo. Actívalo antes de asignarle puntos"
    return None


def _mapa_nombres_bloques(creador: dict | None) -> dict[str, str]:
    """id_bloque → nombre, cargado UNA vez para no hacer un get_item por punto
    en el listado. super_admin (sin empresa propia) carga todos; el resto
    solo los de su empresa (que es lo único que puede ver en GET /puntos)."""
    if creador and creador.get("rol") == "super_admin":
        bloques = _todos_los_bloques()
    else:
        bloques = _bloques_de_empresa(creador.get("empresa_id") if creador else None)
    return {b["id_bloque"]: b.get("nombre", "") for b in bloques if b.get("id_bloque")}


def _anexar_bloque_nombre(puntos: list[dict], nombres: dict[str, str]) -> list[dict]:
    for p in puntos:
        if p.get("bloque_id"):
            p["bloque_nombre"] = nombres.get(p["bloque_id"])
    return puntos


def _validar_coordenadas(coordenadas) -> tuple[int, str] | None:
    """Valida `coordenadas` como `{lat, lng}` con ambos numéricos. Devuelve
    (codigo_http, mensaje) si NO es válido, o None si está todo bien."""
    if not isinstance(coordenadas, dict):
        return 400, "coordenadas debe ser un objeto {lat, lng}"
    lat, lng = coordenadas.get("lat"), coordenadas.get("lng")
    if not isinstance(lat, (int, float)) or isinstance(lat, bool) or not isinstance(lng, (int, float)) or isinstance(lng, bool):
        return 400, "coordenadas.lat y coordenadas.lng deben ser numéricos"
    return None


def _crear_marcador_s3_bloque(empresa_id: str, id_bloque: str) -> None:
    """Objeto vacío `empresas/{empresa_id}/{id_bloque}/` para que la carpeta
    exista en S3 aunque todavía no tenga mediciones. No bloqueante: si S3
    falla se loguea y se sigue, el ítem en DynamoDB es lo que manda."""
    try:
        s3.put_object(Bucket=BUCKET_NAME, Key=f"empresas/{empresa_id}/{id_bloque}/", Body=b"")
    except Exception as e:
        logger.warning("No se pudo crear el marcador S3 del bloque %s: %s", id_bloque, e)


# ── Rutas /bloques ───────────────────────────────────────────────────────────

def _handle_bloques(event: dict, metodo: str, id_bloque: str | None) -> dict:
    creador = _usuario_actual(event)
    rol = creador.get("rol") if creador else None

    # ── GET /bloques ─────────────────────────────────────────────────────
    if metodo == "GET" and not id_bloque:
        qp = event.get("queryStringParameters") or {}
        if rol == "super_admin":
            filtro_empresa = qp.get("empresa_id")
            bloques = _bloques_de_empresa(filtro_empresa) if filtro_empresa else _todos_los_bloques()
        else:
            # Ver bloques de otra empresa es exclusivo de super_admin.
            bloques = _bloques_de_empresa(creador.get("empresa_id") if creador else None)
        for b in bloques:
            b["cantidad_mediciones"] = _contar_mediciones_de_bloque(b["id_bloque"])
        return _respuesta(200, {"bloques": bloques})

    # POST (crear un punto): también tecnico, además de admin/super_admin --
    # pedido explícito del usuario ("en Puntos... esta sección sí le saldrá
    # a admin y super_admin y técnico"). tecnico queda forzado a su propia
    # empresa igual que admin (ver más abajo, rama `else` de empresa_id) --
    # nunca puede elegir otra.
    if metodo == "POST" and not id_bloque and rol not in ("tecnico", "admin", "super_admin"):
        return _respuesta(403, {"error": "No tienes permiso para crear puntos"})
    # PUT/DELETE (editar/eliminar un punto ya existente): solo admin/
    # super_admin -- tecnico puede crear pero no modificar ni borrar.
    if metodo in ("PUT", "DELETE") and rol not in ("admin", "super_admin"):
        return _respuesta(403, {"error": "Solo administradores pueden gestionar bloques"})

    # ── POST /bloques ────────────────────────────────────────────────────
    if metodo == "POST" and not id_bloque:
        body = json.loads(event.get("body") or "{}")
        nombre = body.get("nombre")
        if not isinstance(nombre, str) or not nombre.strip():
            return _respuesta(400, {"error": "nombre es requerido"})
        nombre = nombre.strip()
        descripcion = body.get("descripcion")
        if descripcion is not None and not isinstance(descripcion, str):
            return _respuesta(400, {"error": "descripcion debe ser un texto"})

        # coordenadas/ciudad/departamento: requeridos -- el bloque absorbió
        # el rol del punto viejo como entidad que lleva mediciones, y sin
        # coordenadas un punto de monitoreo no tiene sentido.
        error_coords = _validar_coordenadas(body.get("coordenadas"))
        if error_coords:
            return _respuesta(error_coords[0], {"error": error_coords[1]})
        coordenadas = body.get("coordenadas")

        ciudad = body.get("ciudad")
        if not isinstance(ciudad, str) or not ciudad.strip():
            return _respuesta(400, {"error": "ciudad es requerida"})
        ciudad = ciudad.strip()

        departamento = body.get("departamento")
        if not isinstance(departamento, str) or not departamento.strip():
            return _respuesta(400, {"error": "departamento es requerido"})
        departamento = departamento.strip()

        # tipo_material/tipo_estructura: opcionales, texto libre -- mismo
        # criterio que tenía POST /puntos (sin validar contra una lista fija).
        tipo_material = body.get("tipo_material")
        if tipo_material is not None and not isinstance(tipo_material, str):
            return _respuesta(400, {"error": "tipo_material debe ser un texto"})
        tipo_estructura = body.get("tipo_estructura")
        if tipo_estructura is not None and not isinstance(tipo_estructura, str):
            return _respuesta(400, {"error": "tipo_estructura debe ser un texto"})

        # grosor_mm: opcional, numérico -- mismo campo que tenía el punto
        # original (sistema fuente), recuperado a pedido del usuario.
        grosor_mm = body.get("grosor_mm")
        if grosor_mm is not None and (not isinstance(grosor_mm, (int, float)) or isinstance(grosor_mm, bool)):
            return _respuesta(400, {"error": "grosor_mm debe ser numérico"})

        # empresa_id: SOLO super_admin lo manda (y es obligatorio para él),
        # validado contra la tabla empresas — mismo patrón que POST /usuarios
        # y POST /puntos. Para admin se fuerza al suyo, nunca del body.
        if rol == "super_admin":
            empresa_id = body.get("empresa_id")
            if not empresa_id:
                return _respuesta(400, {"error": "super_admin debe indicar empresa_id al crear un bloque"})
            if not tabla_empresas.get_item(Key={"id_empresa": empresa_id}).get("Item"):
                return _respuesta(404, {"error": f"Empresa {empresa_id} no encontrada"})
        else:
            empresa_id = creador.get("empresa_id")
            if not empresa_id:
                return _respuesta(400, {"error": "Tu usuario no tiene empresa asignada. Contacta a un super_admin"})

        if _nombre_bloque_repetido(empresa_id, nombre):
            return _respuesta(409, {"error": f"Ya existe un bloque llamado '{nombre}' en esta empresa"})

        id_bloque_nuevo = f"BLQ-{uuid.uuid4()}"
        item = {
            "id_bloque": id_bloque_nuevo,
            "empresa_id": empresa_id,
            "nombre": nombre,
            "coordenadas": coordenadas,
            "ciudad": ciudad,
            "departamento": departamento,
            "activo": True,
            "fecha_creacion": datetime.now(timezone.utc).isoformat(),
            "creado_por_id": creador.get("id_usuario", ""),
        }
        if descripcion is not None:
            item["descripcion"] = descripcion
        if tipo_material is not None:
            item["tipo_material"] = tipo_material
        if tipo_estructura is not None:
            item["tipo_estructura"] = tipo_estructura
        if grosor_mm is not None:
            item["grosor_mm"] = grosor_mm
        # Foto fija del nombre del creador (mismo patrón que puntos/mediciones:
        # sigue siendo legible aunque la cuenta se borre después).
        if creador.get("nombre"):
            item["creado_por_nombre"] = creador.get("nombre")
        # lat/lng vienen como float desde el frontend — DynamoDB requiere Decimal.
        item = floats_to_decimal(item)
        tabla_bloques.put_item(Item=item)
        _crear_marcador_s3_bloque(empresa_id, id_bloque_nuevo)
        return _respuesta(201, item)

    # PUT/DELETE necesitan el bloque y el chequeo de alcance por empresa.
    if not id_bloque:
        return _respuesta(405, {"error": f"Método {metodo} no permitido"})
    bloque = tabla_bloques.get_item(Key={"id_bloque": id_bloque}).get("Item")
    if not bloque:
        return _respuesta(404, {"error": f"Bloque {id_bloque} no encontrado"})
    if rol != "super_admin" and bloque.get("empresa_id") != creador.get("empresa_id"):
        return _respuesta(403, {"error": "No puedes modificar bloques de otra empresa"})

    # ── PUT /bloques/{id_bloque} ─────────────────────────────────────────
    if metodo == "PUT":
        body = json.loads(event.get("body") or "{}")
        nombre = body.get("nombre")
        descripcion = body.get("descripcion")
        activo = body.get("activo")
        coordenadas = body.get("coordenadas")
        ciudad = body.get("ciudad")
        departamento = body.get("departamento")
        tipo_material = body.get("tipo_material")
        tipo_estructura = body.get("tipo_estructura")
        grosor_mm = body.get("grosor_mm")
        if all(
            v is None
            for v in (nombre, descripcion, activo, coordenadas, ciudad, departamento, tipo_material, tipo_estructura, grosor_mm)
        ):
            return _respuesta(400, {"error": "Debes indicar al menos un campo para actualizar"})

        campos = {}
        if nombre is not None:
            if not isinstance(nombre, str):
                return _respuesta(400, {"error": "nombre debe ser un texto"})
            nombre = nombre.strip()
            if not nombre:
                return _respuesta(400, {"error": "nombre no puede estar vacío"})
            if _nombre_bloque_repetido(bloque.get("empresa_id"), nombre, excluir_id=id_bloque):
                return _respuesta(409, {"error": f"Ya existe un bloque llamado '{nombre}' en esta empresa"})
            campos["nombre"] = nombre
        if descripcion is not None:
            if not isinstance(descripcion, str):
                return _respuesta(400, {"error": "descripcion debe ser un texto"})
            campos["descripcion"] = descripcion
        if activo is not None:
            if not isinstance(activo, bool):
                return _respuesta(400, {"error": "activo debe ser un booleano"})
            campos["activo"] = activo
        # coordenadas/ciudad/departamento/tipo_material/tipo_estructura:
        # opcionales en PUT (a diferencia de POST, donde son requeridos) --
        # un bloque ya existente puede editarse campo por campo.
        if coordenadas is not None:
            error_coords = _validar_coordenadas(coordenadas)
            if error_coords:
                return _respuesta(error_coords[0], {"error": error_coords[1]})
            campos["coordenadas"] = coordenadas
        if ciudad is not None:
            if not isinstance(ciudad, str) or not ciudad.strip():
                return _respuesta(400, {"error": "ciudad debe ser un texto no vacío"})
            campos["ciudad"] = ciudad.strip()
        if departamento is not None:
            if not isinstance(departamento, str) or not departamento.strip():
                return _respuesta(400, {"error": "departamento debe ser un texto no vacío"})
            campos["departamento"] = departamento.strip()
        if tipo_material is not None:
            if not isinstance(tipo_material, str):
                return _respuesta(400, {"error": "tipo_material debe ser un texto"})
            campos["tipo_material"] = tipo_material
        if tipo_estructura is not None:
            if not isinstance(tipo_estructura, str):
                return _respuesta(400, {"error": "tipo_estructura debe ser un texto"})
            campos["tipo_estructura"] = tipo_estructura
        if grosor_mm is not None:
            if not isinstance(grosor_mm, (int, float)) or isinstance(grosor_mm, bool):
                return _respuesta(400, {"error": "grosor_mm debe ser numérico"})
            campos["grosor_mm"] = grosor_mm

        expr = "SET " + ", ".join(f"#{k} = :{k}" for k in campos)
        nombres = {f"#{k}": k for k in campos}
        # lat/lng vienen como float desde el frontend — DynamoDB requiere Decimal.
        valores = floats_to_decimal({f":{k}": v for k, v in campos.items()})
        tabla_bloques.update_item(
            Key={"id_bloque": id_bloque},
            UpdateExpression=expr,
            ExpressionAttributeNames=nombres,
            ExpressionAttributeValues=valores,
        )
        return _respuesta(200, tabla_bloques.get_item(Key={"id_bloque": id_bloque}).get("Item", {}))

    # ── DELETE /bloques/{id_bloque} ──────────────────────────────────────
    if metodo == "DELETE":
        # Borrar un bloque con mediciones adentro las dejaría apuntando a un
        # bloque_id inexistente (huérfanas). Bloqueamos en vez de borrar en
        # cascada. El marcador S3 no se toca: puede quedar, es inocuo.
        if _contar_mediciones_de_bloque(id_bloque) > 0:
            return _respuesta(409, {"error": "No se puede eliminar: el bloque tiene mediciones asociadas"})
        tabla_bloques.delete_item(Key={"id_bloque": id_bloque})
        return _respuesta(204, None)

    return _respuesta(405, {"error": f"Método {metodo} no permitido"})


# ── Handler principal ────────────────────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:
    metodo = event.get("httpMethod", "")
    resource = event.get("resource", "")
    path_params = event.get("pathParameters") or {}
    id_punto = path_params.get("id_punto")

    try:
        # ── /bloques y /bloques/{id_bloque} — misma Lambda, rutas aparte ─────
        if resource.startswith("/bloques"):
            return _handle_bloques(event, metodo, path_params.get("id_bloque"))

        # ── Rutas /puntos (desde acá hasta el final de este handler) ─────────
        # Sin consumidor desde el frontend: la fusión punto→bloque hizo que
        # el "punto" (coordenadas + mediciones) pasara a ser el "bloque"
        # (ver docstring del módulo y POST /medicion en lambda_src/inference,
        # que ya no crea ni referencia ningún punto). Se dejan tal cual,
        # intencionalmente sin borrar, por si hiciera falta revertir algo.

        # ── GET /puntos — listar todos, filtrado por empresa ─────────────────
        if metodo == "GET" and not id_punto:
            creador = _usuario_actual(event)
            # Scan filtrado a registros METADATA — la tabla también contiene
            # mediciones (sk="MED#...") que no deben aparecer en este listado.
            f_expr = Attr("sk").eq(SK_METADATA)
            if not creador or creador.get("rol") != "super_admin":
                # Ver datos de otra empresa es exclusivo de super_admin — si
                # no se pudo resolver el usuario, se trata como sin empresa
                # (empresa_id=None) para no filtrar por vacío por accidente.
                empresa_id = creador.get("empresa_id") if creador else None
                f_expr = f_expr & Attr("empresa_id").eq(empresa_id)
            resp = tabla.scan(FilterExpression=f_expr)
            puntos = resp.get("Items", [])
            # bloque_nombre resuelto con una sola carga de bloques (no un
            # get_item por punto).
            if any(p.get("bloque_id") for p in puntos):
                _anexar_bloque_nombre(puntos, _mapa_nombres_bloques(creador))
            return _respuesta(200, puntos)

        # ── GET /puntos/{id_punto} ───────────────────────────────────────────
        elif metodo == "GET" and id_punto:
            resp = tabla.get_item(Key={"id_punto": id_punto, "sk": SK_METADATA})
            item = resp.get("Item")
            if not item:
                return _respuesta(404, {"error": f"Punto {id_punto} no encontrado"})
            creador = _usuario_actual(event)
            if (not creador or creador.get("rol") != "super_admin") and item.get("empresa_id") != (creador.get("empresa_id") if creador else None):
                # Ver datos de otra empresa es exclusivo de super_admin — 404
                # en vez de 403 para no revelar que el punto existe.
                return _respuesta(404, {"error": f"Punto {id_punto} no encontrado"})
            if item.get("bloque_id"):
                bloque = tabla_bloques.get_item(Key={"id_bloque": item["bloque_id"]}).get("Item")
                item["bloque_nombre"] = bloque.get("nombre") if bloque else None
            return _respuesta(200, item)

        # ── POST /puntos — crear (admin/super_admin) ──────────────────────────
        elif metodo == "POST":
            creador = _usuario_actual(event)
            if not creador or creador.get("rol") not in ("admin", "super_admin"):
                return _respuesta(403, {"error": "Solo administradores pueden crear puntos directamente. Use POST /medicion para el flujo normal."})

            body = json.loads(event.get("body") or "{}")
            # El id_punto siempre lo genera el backend (mismo patrón que
            # _resolver_punto en la Lambda de inferencia) — el cliente nunca
            # debería tener que inventar un ID de recurso al crearlo.
            id_punto_nuevo = f"PT-{uuid.uuid4()}"

            sede = body.get("sede", "")
            ciudad = body.get("ciudad", "")

            creado_por_id = _claims(event).get("sub", "")
            ahora = datetime.now(timezone.utc).isoformat()

            grosor = body.get("grosor_mm")
            item = {
                "id_punto": id_punto_nuevo,
                "sk": SK_METADATA,
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
            # empresa_id del recurso se resuelve del creador autenticado,
            # nunca de un campo del body (evita que cualquier usuario escriba
            # datos "de" otra empresa cambiando un parámetro) -- salvo
            # super_admin, que no tiene empresa_id propio y por eso es el
            # único caso donde el body decide, validado contra la tabla real.
            if creador.get("rol") == "super_admin":
                empresa_id_body = body.get("empresa_id")
                if not empresa_id_body:
                    return _respuesta(400, {"error": "super_admin debe indicar empresa_id al crear un punto"})
                if not tabla_empresas.get_item(Key={"id_empresa": empresa_id_body}).get("Item"):
                    return _respuesta(404, {"error": f"Empresa {empresa_id_body} no encontrada"})
                item["empresa_id"] = empresa_id_body
            elif creador.get("empresa_id"):
                item["empresa_id"] = creador.get("empresa_id")
            # bloque_id opcional: debe existir, ser de la misma empresa que
            # el punto (la recién resuelta arriba) y estar activo.
            bloque_id = body.get("bloque_id")
            if bloque_id is not None:
                error_bloque = _validar_bloque_para_punto(bloque_id, item.get("empresa_id"))
                if error_bloque:
                    return _respuesta(error_bloque[0], {"error": error_bloque[1]})
                item["bloque_id"] = bloque_id
            # GSI de búsqueda inversa por usuario (usuario_id/timestamp) — ver
            # CorriaStorageStack. DynamoDB rechaza strings vacíos como clave
            # de GSI, así que "usuario_id" solo se agrega cuando hay un
            # usuario real (sparse index).
            if creado_por_id:
                item["creado_por_id"] = creado_por_id
                item["usuario_id"] = creado_por_id
                # Foto fija del nombre al momento de crear el punto — no se
                # actualiza si el usuario después cambia su nombre, y sigue
                # siendo legible aunque esa cuenta se borre más adelante
                # (a diferencia de creado_por_id/usuario_id, que dejan de
                # resolverse a nadie si la cuenta ya no existe).
                if creador.get("nombre"):
                    item["creado_por_nombre"] = creador.get("nombre")
            # lat/lng vienen como float desde el frontend — DynamoDB requiere Decimal
            item = floats_to_decimal(item)
            tabla.put_item(Item=item)
            return _respuesta(201, item)

        # ── PUT /puntos/{id_punto} — actualizar con auditoría (admin/super_admin) ──
        elif metodo == "PUT" and id_punto:
            creador = _usuario_actual(event)
            if not creador or creador.get("rol") not in ("admin", "super_admin"):
                return _respuesta(403, {"error": "Solo administradores pueden modificar puntos"})

            body = json.loads(event.get("body") or "{}")
            campos = {k: v for k, v in body.items() if k not in ("id_punto", "sk", "empresa_id")}
            if not campos:
                return _respuesta(400, {"error": "No hay campos para actualizar"})

            # Leer item actual para auditoría y recalcular clave_logica si aplica
            punto_actual = tabla.get_item(Key={"id_punto": id_punto, "sk": SK_METADATA}).get("Item")
            if not punto_actual:
                return _respuesta(404, {"error": f"Punto {id_punto} no encontrado"})
            if creador.get("rol") != "super_admin" and punto_actual.get("empresa_id") != creador.get("empresa_id"):
                return _respuesta(404, {"error": f"Punto {id_punto} no encontrado"})

            if any(k in campos for k in ("sede", "ciudad")):
                sede = campos.get("sede", punto_actual.get("sede", ""))
                ciudad = campos.get("ciudad", punto_actual.get("ciudad", ""))
                campos["clave_logica"] = f"{sede}-{ciudad}"

            # bloque_id: cambiar (mismas validaciones que POST, contra la
            # empresa del punto — nunca la del caller, que para super_admin
            # no existe) o desasignar con `bloque_id: null` → REMOVE.
            desasignar_bloque = "bloque_id" in campos and campos["bloque_id"] is None
            if "bloque_id" in campos and not desasignar_bloque:
                error_bloque = _validar_bloque_para_punto(campos["bloque_id"], punto_actual.get("empresa_id"))
                if error_bloque:
                    return _respuesta(error_bloque[0], {"error": error_bloque[1]})

            # Construir entrada de auditoría con los campos que realmente
            # cambiaron (incluye bloque_id → None cuando se desasigna).
            email = _email_usuario(event)
            entrada_cambio = _construir_historial_cambio(punto_actual, campos, email)

            campos_set = {k: v for k, v in campos.items() if not (k == "bloque_id" and v is None)}
            expr_parts = [f"#{k} = :{k}" for k in campos_set]
            nombres = {f"#{k}": k for k in campos_set}
            # floats en coordenadas u otros campos numéricos → Decimal
            valores = floats_to_decimal({f":{k}": v for k, v in campos_set.items()})
            remove_parts = []
            if desasignar_bloque:
                nombres["#bloque_id"] = "bloque_id"
                remove_parts.append("#bloque_id")

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

            expresion = ""
            if expr_parts:
                expresion = "SET " + ", ".join(expr_parts)
            if remove_parts:
                # Un PUT con solo `bloque_id: null` no tiene cláusula SET, y
                # DynamoDB rechaza un ExpressionAttributeValues vacío.
                expresion = (expresion + " " if expresion else "") + "REMOVE " + ", ".join(remove_parts)

            kwargs_update = dict(
                Key={"id_punto": id_punto, "sk": SK_METADATA},
                UpdateExpression=expresion,
                ExpressionAttributeNames=nombres,
            )
            if valores:
                kwargs_update["ExpressionAttributeValues"] = valores
            tabla.update_item(**kwargs_update)
            return _respuesta(200, {"mensaje": "Punto actualizado", "id_punto": id_punto})

        # ── DELETE /puntos/{id_punto} — eliminar (solo super_admin) ──────────
        # Un punto es la "Zona" (= la empresa vista en el mapa); borrar una
        # zona entera es demasiado destructivo para dejarlo en manos de un
        # admin -- admin solo borra bloques (las subcarpetas dentro de su
        # empresa, ver DELETE /bloques), nunca el punto/zona en sí.
        elif metodo == "DELETE" and id_punto:
            creador = _usuario_actual(event)
            if not creador or creador.get("rol") != "super_admin":
                return _respuesta(403, {"error": "Solo super_admin puede eliminar puntos"})

            punto_actual = tabla.get_item(Key={"id_punto": id_punto, "sk": SK_METADATA}).get("Item")
            if not punto_actual:
                return _respuesta(404, {"error": f"Punto {id_punto} no encontrado"})

            # Si el punto tiene mediciones asociadas, borrarlo las deja
            # huérfanas (referencian un id_punto que ya no existe). Bloqueamos
            # en vez de borrar en cascada silenciosamente — es la opción
            # segura por defecto con datos de tesis: nunca perder mediciones
            # sin que un admin lo decida explícitamente.
            tiene_mediciones = tabla.query(
                KeyConditionExpression=Key("id_punto").eq(id_punto) & Key("sk").begins_with("MED#"),
                Limit=1,
            ).get("Items", [])
            if tiene_mediciones:
                return _respuesta(409, {"error": "No se puede eliminar: el punto tiene mediciones asociadas"})

            tabla.delete_item(Key={"id_punto": id_punto, "sk": SK_METADATA})
            return _respuesta(200, {"mensaje": "Punto eliminado", "id_punto": id_punto})

        return _respuesta(405, {"error": f"Método {metodo} no permitido"})

    except Exception as e:
        logger.exception("Error en api_puntos: %s", e)
        return _respuesta(500, {"error": str(e)})
