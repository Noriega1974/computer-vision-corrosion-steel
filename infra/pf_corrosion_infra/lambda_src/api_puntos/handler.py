"""
pf-corrosion - Lambda CRUD de bloques.

Almacenamiento: tabla `bloques`; las mediciones viven en la tabla fusionada
puntos+mediciones con sort key "MED#{timestamp}" (ver lambda_src/api_mediciones
y lambda_src/inference). Solo se consulta esa tabla para contar mediciones.

Rutas:
  GET    /bloques                 → listar bloques de la empresa del caller (super_admin: todos,
                                    o los de ?empresa_id=); cada uno con cantidad_mediciones
  POST   /bloques                 → crear bloque (tecnico/admin/super_admin; super_admin debe
                                    mandar empresa_id, tecnico/admin quedan forzados a la suya);
                                    requiere coordenadas, ciudad y departamento -- el bloque
                                    absorbió el rol del punto viejo como entidad que lleva
                                    mediciones (ver POST /medicion en lambda_src/inference)
  PUT    /bloques/{id_bloque}     → editar nombre/descripcion/activo/coordenadas/ciudad/
                                    departamento/tipo_estructura/grosor_mm (solo super_admin o
                                    admin de esa empresa -- tecnico crea pero no edita)
  DELETE /bloques/{id_bloque}     → eliminar (solo super_admin o admin de esa empresa; 409 si
                                    tiene mediciones -- tecnico no puede borrar)
  POST   /bloques/{id}/portada/upload-url → POST prefirmado de S3 para la foto del punto
                                    (JPEG/PNG/WebP, máx. 5 MB); body {content_type}
  PUT    /bloques/{id}/portada    → fija `portada_key` (la de upload-url) y borra la anterior
  DELETE /bloques/{id}/portada    → quita la foto del punto (atributo + objeto en S3)
                                    Las tres: super_admin cualquier punto; admin y tecnico solo
                                    los de su empresa; cliente 403. GET /bloques devuelve
                                    `portada_url` (GET prefirmado, 15 min) cuando hay portada.

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
`coordenadas`, `ciudad`, `departamento` y `tipo_estructura`.
`tipo_material` NO vive acá -- es propiedad de la zona/empresa completa
(ver POST/PUT /empresas en api_usuarios/handler.py), no de cada punto por
separado. Las rutas /puntos del sistema original (y /puntos/buscar) fueron
eliminadas: no tenían consumidor tras esta fusión.

RBAC multi-empresa: `empresa_id` de un bloque nuevo se resuelve SIEMPRE del
usuario autenticado (`_usuario_actual`, replicado de api_usuarios/handler.py
-- no hay módulo compartido entre lambdas, ver README), nunca de un campo del
body, EXCEPTO para super_admin (que no tiene empresa_id propio): en ese caso
`empresa_id` es obligatorio en el body y se valida contra la tabla
`empresas`.
"""
import json
import logging
import os
import re
import uuid
from decimal import Decimal
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key
from botocore.config import Config
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLA_PUNTOS = os.environ["TABLA_PUNTOS"]
TABLA_USUARIOS = os.environ["TABLA_USUARIOS"]
TABLA_EMPRESAS = os.environ["TABLA_EMPRESAS"]
TABLA_BLOQUES = os.environ["TABLA_BLOQUES"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
REGION = os.environ["REGION"]

dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla = dynamodb.Table(TABLA_PUNTOS)
tabla_usuarios = dynamodb.Table(TABLA_USUARIOS)
tabla_empresas = dynamodb.Table(TABLA_EMPRESAS)
tabla_bloques = dynamodb.Table(TABLA_BLOQUES)
# Solo para dejar el marcador `empresas/{empresa_id}/{id_bloque}/` al crear
# un bloque (grant acotado a PutObject bajo ese prefijo, ver CorriaComputeStack).
# También firma el POST/GET de la portada (`empresas/{e}/{b}/portada/*`): firma v4.
s3 = boto3.client("s3", region_name=REGION, config=Config(signature_version="s3v4"))

# Foto de portada del punto: solo imágenes, máx. 5 MB, subida directa a S3.
PORTADA_MAX_BYTES = 5 * 1024 * 1024
EXPIRA_SUBIDA_S = 600       # vigencia del POST prefirmado
EXPIRA_LECTURA_S = 900      # vigencia del GET prefirmado de la portada
EXTENSIONES_IMAGEN = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_EXT_PORTADA = "|".join(EXTENSIONES_IMAGEN.values())
_CLAVE_PORTADA = re.compile(rf"^empresas/[^/]+/[^/]+/portada/[0-9a-f-]{{36}}\.({_EXT_PORTADA})$")


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


def _validar_coordenadas(coordenadas) -> tuple[int, str] | None:
    """Valida `coordenadas` como `{lat, lng}` con ambos numéricos. Devuelve
    (codigo_http, mensaje) si NO es válido, o None si está todo bien."""
    if not isinstance(coordenadas, dict):
        return 400, "Marca la ubicación del punto en el mapa"
    lat, lng = coordenadas.get("lat"), coordenadas.get("lng")
    if not isinstance(lat, (int, float)) or isinstance(lat, bool) or not isinstance(lng, (int, float)) or isinstance(lng, bool):
        return 400, "La ubicación del punto no es válida. Márcala de nuevo en el mapa"
    return None


def _crear_marcador_s3_bloque(empresa_id: str, id_bloque: str) -> None:
    """Objeto vacío `empresas/{empresa_id}/{id_bloque}/` para que la carpeta
    exista en S3 aunque todavía no tenga mediciones. No bloqueante: si S3
    falla se loguea y se sigue, el ítem en DynamoDB es lo que manda."""
    try:
        s3.put_object(Bucket=BUCKET_NAME, Key=f"empresas/{empresa_id}/{id_bloque}/", Body=b"")
    except Exception as e:
        logger.warning("No se pudo crear el marcador S3 del bloque %s: %s", id_bloque, e)


def _puede_gestionar_portada(creador: dict | None, bloque: dict) -> bool:
    """super_admin: cualquier punto. admin y tecnico: solo los de su empresa.
    cliente (o sin registro / sin empresa): nunca."""
    if not creador:
        return False
    rol = creador.get("rol")
    if rol == "super_admin":
        return True
    empresa = creador.get("empresa_id")
    return rol in ("admin", "tecnico") and bool(empresa) and bloque.get("empresa_id") == empresa


def _url_portada(clave: str | None) -> str | None:
    """GET prefirmado de corta vigencia; None si no hay portada o falla la firma."""
    if not clave:
        return None
    try:
        return s3.generate_presigned_url(
            "get_object", Params={"Bucket": BUCKET_NAME, "Key": clave}, ExpiresIn=EXPIRA_LECTURA_S
        )
    except Exception as e:
        logger.warning("No se pudo firmar la portada %s: %s", clave, e)
        return None


def _con_portada_url(bloque: dict) -> dict:
    """Copia del bloque con `portada_url` (si tiene `portada_key`)."""
    out = dict(bloque)
    url = _url_portada(bloque.get("portada_key"))
    if url:
        out["portada_url"] = url
    return out


def _borrar_objeto(clave: str | None) -> None:
    """Borrado best-effort de la portada anterior: el ítem en DynamoDB manda. Un
    reintento; si sigue fallando deja una línea ERROR greppable (ORPHAN_S3)."""
    if not clave:
        return
    error = None
    for _ in range(2):
        try:
            s3.delete_object(Bucket=BUCKET_NAME, Key=clave)
            return
        except Exception as e:
            error = e
    logger.error("ORPHAN_S3 key=%s error=%s", clave, error)


def _portada_upload_url(event: dict, bloque: dict) -> dict:
    """POST /bloques/{id}/portada/upload-url -> POST prefirmado (clave, tipo y
    tamaño fijados por la política; S3 rechaza lo demás)."""
    try:
        body = json.loads(event.get("body") or "{}")
    except ValueError:
        return _respuesta(400, {"error": "No se pudo leer la solicitud. Recarga la página e inténtalo de nuevo"})
    content_type = str(body.get("content_type") or "").strip().lower()
    extension = EXTENSIONES_IMAGEN.get(content_type)
    if not extension:
        return _respuesta(400, {"error": "Tipo de imagen no soportado. Usa una imagen JPEG, PNG o WebP"})
    clave = f"empresas/{bloque['empresa_id']}/{bloque['id_bloque']}/portada/{uuid.uuid4()}.{extension}"
    post = s3.generate_presigned_post(
        Bucket=BUCKET_NAME,
        Key=clave,
        Fields={"Content-Type": content_type},
        Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, PORTADA_MAX_BYTES]],
        ExpiresIn=EXPIRA_SUBIDA_S,
    )
    return _respuesta(200, {
        "url": post["url"],
        "fields": post["fields"],
        "portada_key": clave,
        "max_bytes": PORTADA_MAX_BYTES,
        "expira_en_s": EXPIRA_SUBIDA_S,
    })


def _portada_fijar(event: dict, bloque: dict) -> dict:
    """PUT /bloques/{id}/portada: valida la clave (prefijo propio, formato y
    existencia), la guarda y borra la portada anterior."""
    try:
        body = json.loads(event.get("body") or "{}")
    except ValueError:
        return _respuesta(400, {"error": "No se pudo leer la solicitud. Recarga la página e inténtalo de nuevo"})
    clave = body.get("portada_key")
    prefijo = f"empresas/{bloque['empresa_id']}/{bloque['id_bloque']}/portada/"
    if not isinstance(clave, str) or not _CLAVE_PORTADA.match(clave) or not clave.startswith(prefijo):
        return _respuesta(400, {"error": "La foto de portada no es válida. Vuelve a subirla"})
    try:
        peso = s3.head_object(Bucket=BUCKET_NAME, Key=clave)["ContentLength"]
    except ClientError:
        return _respuesta(400, {"error": "No se encontró la imagen subida. Vuelve a subirla"})
    if peso > PORTADA_MAX_BYTES:
        _borrar_objeto(clave)
        return _respuesta(400, {"error": "La imagen supera los 5 MB. Elige una más liviana"})
    anterior = bloque.get("portada_key")
    tabla_bloques.update_item(
        Key={"id_bloque": bloque["id_bloque"]},
        UpdateExpression="SET portada_key = :k",
        ExpressionAttributeValues={":k": clave},
    )
    if anterior and anterior != clave:
        _borrar_objeto(anterior)
    return _respuesta(200, _con_portada_url(tabla_bloques.get_item(Key={"id_bloque": bloque["id_bloque"]}).get("Item", {})))


def _portada_quitar(bloque: dict) -> dict:
    """DELETE /bloques/{id}/portada: quita el atributo y el objeto."""
    anterior = bloque.get("portada_key")
    if anterior:
        tabla_bloques.update_item(
            Key={"id_bloque": bloque["id_bloque"]},
            UpdateExpression="REMOVE portada_key",
        )
        _borrar_objeto(anterior)
    return _respuesta(200, _con_portada_url(tabla_bloques.get_item(Key={"id_bloque": bloque["id_bloque"]}).get("Item", {})))


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
            url = _url_portada(b.get("portada_key"))
            if url:
                b["portada_url"] = url
        return _respuesta(200, {"bloques": bloques})

    # Foto de portada: super_admin cualquier punto; admin y tecnico solo los de
    # su empresa; cliente nunca (ver _puede_gestionar_portada). Va antes del
    # bloqueo de PUT/DELETE de abajo, que es de edición/borrado del punto.
    if id_bloque and event.get("resource", "").startswith("/bloques/{id_bloque}/portada"):
        bloque = tabla_bloques.get_item(Key={"id_bloque": id_bloque}).get("Item")
        if not bloque:
            return _respuesta(404, {"error": "No se encontró el punto. Actualiza la lista e inténtalo de nuevo"})
        if not _puede_gestionar_portada(creador, bloque):
            return _respuesta(403, {"error": "No tienes permiso para cambiar la foto de este punto"})
        recurso = event["resource"]
        if metodo == "POST" and recurso.endswith("/upload-url"):
            return _portada_upload_url(event, bloque)
        if metodo == "PUT" and recurso.endswith("/portada"):
            return _portada_fijar(event, bloque)
        if metodo == "DELETE" and recurso.endswith("/portada"):
            return _portada_quitar(bloque)
        return _respuesta(405, {"error": "Esta acción no está disponible. Recarga la página e inténtalo de nuevo"})

    # POST (crear un punto): también tecnico, además de admin/super_admin --
    # pedido explícito del usuario ("en Puntos... esta sección sí le saldrá
    # a admin y super_admin y técnico"). tecnico queda forzado a su propia
    # empresa igual que admin (ver más abajo, rama `else` de empresa_id) --
    # nunca puede elegir otra.
    if metodo == "POST" and not id_bloque and rol not in ("tecnico", "admin", "super_admin"):
        return _respuesta(403, {"error": "No tienes permiso para crear puntos. Pide ayuda a un administrador"})
    # PUT/DELETE (editar/eliminar un punto ya existente): solo admin/
    # super_admin -- tecnico puede crear pero no modificar ni borrar.
    if metodo in ("PUT", "DELETE") and rol not in ("admin", "super_admin"):
        return _respuesta(403, {"error": "Solo los administradores pueden editar o eliminar puntos. Pide ayuda a un administrador"})

    # ── POST /bloques ────────────────────────────────────────────────────
    if metodo == "POST" and not id_bloque:
        body = json.loads(event.get("body") or "{}")
        nombre = body.get("nombre")
        if not isinstance(nombre, str) or not nombre.strip():
            return _respuesta(400, {"error": "Escribe el nombre del punto"})
        nombre = nombre.strip()
        descripcion = body.get("descripcion")
        if descripcion is not None and not isinstance(descripcion, str):
            return _respuesta(400, {"error": "La descripción debe ser un texto. Corrígela e inténtalo de nuevo"})

        # coordenadas/ciudad/departamento: requeridos -- el bloque absorbió
        # el rol del punto viejo como entidad que lleva mediciones, y sin
        # coordenadas un punto de monitoreo no tiene sentido.
        error_coords = _validar_coordenadas(body.get("coordenadas"))
        if error_coords:
            return _respuesta(error_coords[0], {"error": error_coords[1]})
        coordenadas = body.get("coordenadas")

        ciudad = body.get("ciudad")
        if not isinstance(ciudad, str) or not ciudad.strip():
            return _respuesta(400, {"error": "Indica la ciudad del punto"})
        ciudad = ciudad.strip()

        departamento = body.get("departamento")
        if not isinstance(departamento, str) or not departamento.strip():
            return _respuesta(400, {"error": "Indica el departamento del punto"})
        departamento = departamento.strip()

        # tipo_estructura: opcional, texto libre -- mismo criterio que tenía
        # POST /puntos (sin validar contra una lista fija). tipo_material NO
        # va acá: es propiedad de la zona/empresa completa (POST /empresas),
        # no de cada punto individual.
        tipo_estructura = body.get("tipo_estructura")
        if tipo_estructura is not None and not isinstance(tipo_estructura, str):
            return _respuesta(400, {"error": "El tipo de estructura debe ser un texto. Corrígelo e inténtalo de nuevo"})

        # grosor_mm: opcional, numérico -- mismo campo que tenía el punto
        # original (sistema fuente), recuperado a pedido del usuario.
        grosor_mm = body.get("grosor_mm")
        if grosor_mm is not None and (not isinstance(grosor_mm, (int, float)) or isinstance(grosor_mm, bool)):
            return _respuesta(400, {"error": "El grosor debe ser un número en milímetros. Corrígelo e inténtalo de nuevo"})

        # empresa_id: SOLO super_admin lo manda (y es obligatorio para él),
        # validado contra la tabla empresas — mismo patrón que POST /usuarios
        # y POST /puntos. Para admin se fuerza al suyo, nunca del body.
        if rol == "super_admin":
            empresa_id = body.get("empresa_id")
            if not empresa_id:
                return _respuesta(400, {"error": "Selecciona la zona donde quedará el punto"})
            if not tabla_empresas.get_item(Key={"id_empresa": empresa_id}).get("Item"):
                return _respuesta(404, {"error": "No se encontró la zona seleccionada. Actualiza la lista e inténtalo de nuevo"})
        else:
            empresa_id = creador.get("empresa_id")
            if not empresa_id:
                return _respuesta(400, {"error": "Tu usuario no tiene una zona asignada. Contacta a un superadministrador para que te la asigne"})

        if _nombre_bloque_repetido(empresa_id, nombre):
            return _respuesta(409, {"error": f"Ya existe un punto llamado '{nombre}' en esta zona. Elige otro nombre"})

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
        return _respuesta(405, {"error": "Esta acción no está disponible. Recarga la página e inténtalo de nuevo"})
    bloque = tabla_bloques.get_item(Key={"id_bloque": id_bloque}).get("Item")
    if not bloque:
        return _respuesta(404, {"error": "No se encontró el punto. Actualiza la lista e inténtalo de nuevo"})
    if rol != "super_admin" and bloque.get("empresa_id") != creador.get("empresa_id"):
        return _respuesta(403, {"error": "No puedes modificar puntos de otra zona"})

    # ── PUT /bloques/{id_bloque} ─────────────────────────────────────────
    if metodo == "PUT":
        body = json.loads(event.get("body") or "{}")
        nombre = body.get("nombre")
        descripcion = body.get("descripcion")
        activo = body.get("activo")
        coordenadas = body.get("coordenadas")
        ciudad = body.get("ciudad")
        departamento = body.get("departamento")
        tipo_estructura = body.get("tipo_estructura")
        grosor_mm = body.get("grosor_mm")
        if all(
            v is None
            for v in (nombre, descripcion, activo, coordenadas, ciudad, departamento, tipo_estructura, grosor_mm)
        ):
            return _respuesta(400, {"error": "No hay cambios para guardar. Modifica al menos un dato"})

        campos = {}
        if nombre is not None:
            if not isinstance(nombre, str):
                return _respuesta(400, {"error": "El nombre del punto debe ser un texto. Corrígelo e inténtalo de nuevo"})
            nombre = nombre.strip()
            if not nombre:
                return _respuesta(400, {"error": "El nombre del punto no puede estar vacío. Escribe un nombre"})
            if _nombre_bloque_repetido(bloque.get("empresa_id"), nombre, excluir_id=id_bloque):
                return _respuesta(409, {"error": f"Ya existe un punto llamado '{nombre}' en esta zona. Elige otro nombre"})
            campos["nombre"] = nombre
        if descripcion is not None:
            if not isinstance(descripcion, str):
                return _respuesta(400, {"error": "La descripción debe ser un texto. Corrígela e inténtalo de nuevo"})
            campos["descripcion"] = descripcion
        if activo is not None:
            if not isinstance(activo, bool):
                return _respuesta(400, {"error": "No se pudo cambiar el estado del punto. Recarga la página e inténtalo de nuevo"})
            campos["activo"] = activo
        # coordenadas/ciudad/departamento/tipo_estructura: opcionales en PUT
        # (a diferencia de POST, donde son requeridos) -- un bloque ya
        # existente puede editarse campo por campo. tipo_material NO va acá
        # (ver PUT /empresas/{id_empresa}, es propiedad de la zona).
        if coordenadas is not None:
            error_coords = _validar_coordenadas(coordenadas)
            if error_coords:
                return _respuesta(error_coords[0], {"error": error_coords[1]})
            campos["coordenadas"] = coordenadas
        if ciudad is not None:
            if not isinstance(ciudad, str) or not ciudad.strip():
                return _respuesta(400, {"error": "Indica la ciudad del punto"})
            campos["ciudad"] = ciudad.strip()
        if departamento is not None:
            if not isinstance(departamento, str) or not departamento.strip():
                return _respuesta(400, {"error": "Indica el departamento del punto"})
            campos["departamento"] = departamento.strip()
        if tipo_estructura is not None:
            if not isinstance(tipo_estructura, str):
                return _respuesta(400, {"error": "El tipo de estructura debe ser un texto. Corrígelo e inténtalo de nuevo"})
            campos["tipo_estructura"] = tipo_estructura
        if grosor_mm is not None:
            if not isinstance(grosor_mm, (int, float)) or isinstance(grosor_mm, bool):
                return _respuesta(400, {"error": "El grosor debe ser un número en milímetros. Corrígelo e inténtalo de nuevo"})
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
        return _respuesta(200, _con_portada_url(tabla_bloques.get_item(Key={"id_bloque": id_bloque}).get("Item", {})))

    # ── DELETE /bloques/{id_bloque} ──────────────────────────────────────
    if metodo == "DELETE":
        # Borrar un bloque con mediciones adentro las dejaría apuntando a un
        # bloque_id inexistente (huérfanas). Bloqueamos en vez de borrar en
        # cascada. El marcador S3 no se toca: puede quedar, es inocuo.
        if _contar_mediciones_de_bloque(id_bloque) > 0:
            return _respuesta(409, {"error": "No se puede eliminar el punto porque tiene mediciones. Elimina o mueve primero sus mediciones"})
        tabla_bloques.delete_item(Key={"id_bloque": id_bloque})
        # Carrera: el conteo de arriba y las altas de mediciones (otra Lambda,
        # otra tabla) no son atómicos. Se vuelve a contar YA borrado el punto:
        # si entró una medición en el medio, se restaura el punto (solo si
        # sigue sin existir) y se responde el mismo 409.
        if _contar_mediciones_de_bloque(id_bloque) > 0:
            try:
                tabla_bloques.put_item(Item=bloque, ConditionExpression="attribute_not_exists(id_bloque)")
            except Exception as e:
                logger.error("RESTAURAR_PUNTO_FALLO id_bloque=%s error=%s", id_bloque, e)
            return _respuesta(409, {"error": "No se puede eliminar el punto porque tiene mediciones. Elimina o mueve primero sus mediciones"})
        _borrar_objeto(bloque.get("portada_key"))
        return _respuesta(204, None)

    return _respuesta(405, {"error": "Esta acción no está disponible. Recarga la página e inténtalo de nuevo"})


# ── Handler principal ────────────────────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:
    metodo = event.get("httpMethod", "")
    resource = event.get("resource", "")
    path_params = event.get("pathParameters") or {}

    try:
        # ── /bloques y /bloques/{id_bloque} — misma Lambda, rutas aparte ─────
        if resource.startswith("/bloques"):
            return _handle_bloques(event, metodo, path_params.get("id_bloque"))

        return _respuesta(405, {"error": "Esta acción no está disponible. Recarga la página e inténtalo de nuevo"})

    except Exception as e:
        logger.exception("Error en api_puntos (bloques): %s", e)
        return _respuesta(500, {"error": "Ocurrió un error inesperado. Inténtalo de nuevo; si persiste, contacta a un administrador"})
