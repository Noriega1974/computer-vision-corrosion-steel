"""
CorrIA - Lambda de gestión de usuarios y colaboradores.

Rutas API Gateway:
  POST   /usuarios                        → crear usuario (según CREATABLE_ROLES del creador)
  GET    /usuarios                        → listar usuarios (admin/super_admin; tecnico y cliente: 403)
  GET    /usuarios/me                     → perfil propio (cualquier rol); incluye
                                             empresa_nombre/empresa_departamento/empresa_ciudad
                                             resueltos de su afiliación, para que admin/tecnico
                                             auto-completen esos datos al crear un punto
  PUT    /usuarios/me                     → actualizar perfil propio (cualquier rol)
  PUT    /usuarios/{id_usuario}           → actualizar usuario (admin/super_admin, con alcance de empresa)
  DELETE /usuarios/{id_usuario}/eliminar  → eliminar usuario permanentemente (admin/super_admin, con alcance de
                                             empresa; bloqueado con 409 si el usuario tiene puntos/mediciones
                                             asociados, para no dejarlos huérfanos — usar deshabilitar en ese
                                             caso, o ?forzar=true (solo super_admin) para saltarse el bloqueo;
                                             el nombre del creador ya queda guardado en cada punto/medición, así
                                             que el historial sigue siendo legible aunque la cuenta se borre)
  DELETE /usuarios/{id_usuario}           → deshabilitar usuario (admin/super_admin, con alcance de empresa)
  POST   /colaborador                     → crear colaborador temporal con nickname (admin/super_admin)
  GET    /empresas                        → listar empresas (solo super_admin)
  POST   /empresas                        → crear empresa (solo super_admin); requiere
                                             `departamento`/`ciudad` y `zonas` (1+ polígonos
                                             {puntos: [{lat,lng}, ...]}, 3+ puntos cada uno);
                                             acepta `tipo_material` opcional (propiedad del
                                             sitio completo, no de cada punto); deja además un
                                             marcador vacío `empresas/{id_empresa}/` en el
                                             bucket de imágenes
                                             (no bloqueante)
  PUT    /empresas/{id_empresa}           → editar nombre, activar-desactivar, departamento,
                                             ciudad, tipo_material y/o `zonas` (solo super_admin)

Evento directo (EventBridge cron diario):
  Sin httpMethod → ejecuta limpieza de colaboradores vencidos

RBAC multi-empresa:
  - 4 roles: super_admin (cross-empresa), admin, tecnico, cliente.
  - CREATABLE_ROLES define, de forma explícita (no por nivel numérico), qué
    roles puede crear cada rol — super_admin es la única excepción que puede
    crear su propio rango.
  - `empresa_id` de un usuario nuevo SIEMPRE se fuerza al `empresa_id` de
    quien lo crea, salvo que el creador sea super_admin (único rol que puede
    pasar un `empresa_id` explícito, validado contra la tabla `empresas`).
  - `_usuario_actual` resuelve el ítem completo (rol, empresa_id, id_usuario)
    del que llama a partir de su `sub` (JWT) vía el GSI `cognito-sub-index` —
    necesario porque `id_usuario` (PK, `USR-<uuid>`) no es `cognito_sub`.
"""
import json
import logging
import os
import re
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta

import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLA_USUARIOS           = os.environ["TABLA_USUARIOS"]
TABLA_EMPRESAS           = os.environ["TABLA_EMPRESAS"]
TABLA_PUNTOS_MEDICIONES  = os.environ["TABLA_PUNTOS_MEDICIONES"]
USER_POOL_ID             = os.environ["USER_POOL_ID"]
BUCKET_NAME              = os.environ["BUCKET_NAME"]
REGION                   = os.environ["REGION"]

dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla    = dynamodb.Table(TABLA_USUARIOS)
tabla_empresas = dynamodb.Table(TABLA_EMPRESAS)
tabla_puntos_mediciones = dynamodb.Table(TABLA_PUNTOS_MEDICIONES)
cognito  = boto3.client("cognito-idp", region_name=REGION)
# Solo para dejar el marcador `empresas/{id_empresa}/` al crear una empresa
# (grant acotado a PutObject bajo ese prefijo, ver CorriaComputeStack).
s3 = boto3.client("s3", region_name=REGION)

ROLES_VALIDOS = {"super_admin", "admin", "tecnico", "cliente"}
CAMPOS_PROTEGIDOS_ME    = {"email", "rol", "id_usuario", "cognito_sub", "fecha_creacion"}
CAMPOS_PERMITIDOS_ME    = {"nombre", "telefono", "cargo", "avatar_color", "fecha_ultimo_login"}
CAMPOS_PERMITIDOS_ADMIN = {"nombre", "rol", "telefono", "cargo"}

# Jerarquía explícita de creación de usuarios (NO por nivel numérico —
# super_admin es la única excepción que puede crear su propio rango).
CREATABLE_ROLES = {
    "super_admin": {"super_admin", "admin", "tecnico", "cliente"},
    "admin": {"tecnico", "cliente"},
    "tecnico": {"cliente"},
    "cliente": set(),
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _json_default(obj):
    """Serializador de respaldo para json.dumps: los Decimal (p. ej. los de
    `zonas` en empresas) se devuelven como número, todo lo demás sigue
    cayendo a str() como antes."""
    if isinstance(obj, Decimal):
        return float(obj)
    return str(obj)


def _respuesta(codigo: int, cuerpo) -> dict:
    return {
        "statusCode": codigo,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(cuerpo, ensure_ascii=False, default=_json_default),
    }


def floats_to_decimal(obj):
    """Convierte recursivamente floats a Decimal para compatibilidad con
    DynamoDB (usado para `zonas` en empresas). Mismo helper que ya existe en
    api_puntos/handler.py y lambda_src/inference/handler.py -- no hay módulo
    compartido entre lambdas en este proyecto."""
    if isinstance(obj, list):
        return [floats_to_decimal(x) for x in obj]
    elif isinstance(obj, dict):
        return {k: floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    return obj


def _validar_zonas(zonas) -> tuple[int, str] | None:
    """Valida `zonas`: lista de polígonos {puntos: [{lat,lng}, ...]},
    3+ puntos cada uno (mínimo para cerrar un área), 1+ polígonos (varias
    "manchas" separadas si el campus está partido). Requerido, no opcional."""
    if not isinstance(zonas, list) or not zonas:
        return 400, "zonas debe tener al menos un polígono dibujado"
    for zona in zonas:
        if not isinstance(zona, dict) or not isinstance(zona.get("puntos"), list):
            return 400, "cada zona debe ser un objeto {puntos: [{lat,lng}, ...]}"
        puntos = zona["puntos"]
        if len(puntos) < 3:
            return 400, "cada zona necesita al menos 3 puntos"
        for p in puntos:
            if not isinstance(p, dict):
                return 400, "cada punto debe ser un objeto {lat, lng}"
            for campo in ("lat", "lng"):
                valor = p.get(campo)
                if not isinstance(valor, (int, float)) or isinstance(valor, bool):
                    return 400, f"puntos[].{campo} debe ser numérico"
    return None

def _claims(event: dict) -> dict:
    return event.get("requestContext", {}).get("authorizer", {}).get("claims", {})

def _es_admin(event: dict) -> bool:
    """True si el llamante pertenece a admin o super_admin. Chequeo barato
    (solo lee claims del JWT, sin ir a DynamoDB) — usar cuando no hace falta
    conocer el empresa_id del llamante. Para rutas con alcance de empresa,
    usar `_usuario_actual` en su lugar."""
    grupos = set((_claims(event).get("cognito:groups", "") or "").split(","))
    return bool(grupos & {"admin", "super_admin"})

def _email_usuario(event: dict) -> str:
    return _claims(event).get("email", "")

def _buscar_por_email(email: str) -> dict | None:
    resp = tabla.query(
        IndexName="email-index",
        KeyConditionExpression=Key("email").eq(email),
        Limit=1,
    )
    items = resp.get("Items", [])
    return items[0] if items else None

def _usuario_actual(event: dict) -> dict | None:
    """Resuelve el ítem completo (rol, empresa_id, id_usuario, ...) del
    usuario autenticado a partir de `sub` (claim del JWT), vía el GSI
    cognito-sub-index. Necesario porque `id_usuario` (PK, `USR-<uuid>`
    generado por la app) NO es el mismo valor que `cognito_sub`. Devuelve
    None si no hay sub en el token o si no existe un ítem para ese sub
    (p. ej. una cuenta creada directo en Cognito sin pasar por POST
    /usuarios — ya no se auto-aprovisiona, ver _respuesta_sin_registro)."""
    sub = _claims(event).get("sub", "")
    if not sub:
        return None
    resp = tabla.query(
        IndexName="cognito-sub-index",
        KeyConditionExpression=Key("cognito_sub").eq(sub),
        Limit=1,
    )
    items = resp.get("Items", [])
    return items[0] if items else None

def _fuera_de_alcance(creador: dict, usuario_objetivo: dict) -> bool:
    """True si `creador` (no super_admin) intenta operar sobre un usuario de
    otra empresa. super_admin no tiene restricción de alcance — puede ver y
    editar usuarios de cualquier empresa."""
    if creador.get("rol") == "super_admin":
        return False
    return usuario_objetivo.get("empresa_id") != creador.get("empresa_id")

def _tiene_historial(cognito_sub: str) -> bool:
    """True si el usuario (identificado por su cognito_sub, que es el valor
    que puntos/mediciones guardan como `usuario_id`) creó al menos un punto
    o medición. Mismo criterio que ya usa api_puntos para bloquear el
    borrado de un punto con mediciones asociadas — nunca borrar en cascada
    silenciosamente y dejar `usuario_id` apuntando a nadie."""
    if not cognito_sub:
        return False
    resp = tabla_puntos_mediciones.query(
        IndexName="usuario-timestamp-index",
        KeyConditionExpression=Key("usuario_id").eq(cognito_sub),
        Limit=1,
    )
    return bool(resp.get("Items"))

def _emails_super_admins_activos() -> list[str]:
    """Correos de los super_admin activos en este momento, para el mensaje
    de error cuando un usuario autenticado no tiene cuenta registrada en la
    tabla (ya no se auto-aprovisiona una cuenta fantasma — alguien con ese
    rol tiene que darlo de alta a mano). 'Activo' usa el mismo criterio que
    _handle_cleanup: sin el campo `activo` (cuentas viejas) cuenta como
    activo, solo `activo=False` lo excluye."""
    resp = tabla.scan(
        FilterExpression=Attr("rol").eq("super_admin")
        & (Attr("activo").not_exists() | Attr("activo").eq(True))
    )
    return [i["email"] for i in resp.get("Items", []) if i.get("email")]

def _contacto_super_admins() -> str:
    """Cola del mensaje de bloqueo: nombra a los super_admin activos para que
    la persona sepa a quién escribirle. Si por algún motivo no hay ninguno
    (no debería pasar), cae a un texto genérico sin lista vacía."""
    emails = _emails_super_admins_activos()
    if emails:
        return "Contacta a un administrador para que te dé acceso: " + ", ".join(emails)
    return "Contacta a un administrador del sistema para que te dé acceso."

def _respuesta_sin_registro() -> dict:
    """403 para cuando el llamante autenticado (JWT válido) no tiene fila en
    la tabla usuarios. Antes esto auto-aprovisionaba una cuenta fantasma
    como `cliente` sin empresa_id — eliminado a propósito: la cuenta debe
    darla de alta un administrador real, con la empresa correcta."""
    return _respuesta(403, {"error": "Tu cuenta no está registrada. " + _contacto_super_admins()})

def _respuesta_afiliacion_inactiva(nombre_empresa: str) -> dict:
    """403 para cuando la afiliación del llamante fue desactivada por un
    super_admin (PUT /empresas/{id_empresa} con activa=false). Sin este
    chequeo, 'desactivar' solo cambiaría un badge en la tabla de empresas y
    los usuarios de esa afiliación seguirían entrando como si nada."""
    return _respuesta(403, {
        "error": f"La afiliación {nombre_empresa} está desactivada. " + _contacto_super_admins()
    })

def _sanitizar_nickname(nickname: str) -> str:
    """Convierte nickname a string seguro para usar como email local."""
    return re.sub(r"[^a-z0-9]", "", nickname.lower())

def _validar_password(password: str) -> str | None:
    """Valida contra la password policy real del User Pool (auth_stack.py:
    min 8, mayúscula, minúscula y dígito). Devuelve el mensaje de error si
    no cumple, o None si es válida. Se valida ANTES de tocar Cognito para
    que un intento inválido nunca llegue a crear el usuario."""
    faltantes = []
    if len(password) < 8:
        faltantes.append("mínimo 8 caracteres")
    if not re.search(r"[A-Z]", password):
        faltantes.append("al menos una mayúscula")
    if not re.search(r"[a-z]", password):
        faltantes.append("al menos una minúscula")
    if not re.search(r"[0-9]", password):
        faltantes.append("al menos un número")
    if not faltantes:
        return None
    return "La contraseña debe tener: " + ", ".join(faltantes)


def _rollback_usuario_cognito(username: str, motivo: Exception) -> None:
    """Deshace la creación en Cognito cuando un paso posterior falla, para
    que el usuario nunca quede huérfano (existe en Cognito, invisible en
    DynamoDB). Best-effort: si el rollback mismo falla, se loguea para
    revisión manual en vez de ocultar el problema."""
    try:
        cognito.admin_delete_user(UserPoolId=USER_POOL_ID, Username=username)
        logger.warning("Rollback OK: usuario Cognito '%s' eliminado tras fallo (%s)", username, motivo)
    except Exception as rollback_err:
        logger.error(
            "Rollback FALLÓ para '%s' (motivo original: %s) — requiere limpieza manual: %s",
            username, motivo, rollback_err,
        )


# ── Cleanup de colaboradores vencidos (EventBridge) ──────────────────────────

def _handle_cleanup() -> dict:
    ahora = datetime.now(timezone.utc).isoformat()
    resp = tabla.scan(
        FilterExpression=Attr("es_colaborador").eq(True)
            & Attr("activo").eq(True)
            & Attr("vence_en").lte(ahora)
    )
    deshabilitados = []
    for item in resp.get("Items", []):
        cognito_id = item.get("cognito_username") or item.get("email")
        id_usuario = item.get("id_usuario")
        try:
            cognito.admin_disable_user(UserPoolId=USER_POOL_ID, Username=cognito_id)
            tabla.update_item(
                Key={"id_usuario": id_usuario},
                UpdateExpression="SET #activo = :f, #fecha_des = :ahora",
                ExpressionAttributeNames={"#activo": "activo", "#fecha_des": "fecha_deshabilitacion"},
                ExpressionAttributeValues={":f": False, ":ahora": ahora},
            )
            deshabilitados.append(id_usuario)
            logger.info("Colaborador vencido deshabilitado: %s (%s)", item.get("nickname"), id_usuario)
        except Exception as e:
            logger.error("Error deshabilitando colaborador %s: %s", id_usuario, e)

    logger.info("Cleanup completado: %d colaboradores vencidos deshabilitados", len(deshabilitados))
    return {"statusCode": 200, "body": json.dumps({"deshabilitados": len(deshabilitados)})}


# ── Handler principal ─────────────────────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:
    # EventBridge scheduled event (sin httpMethod)
    if "httpMethod" not in event:
        return _handle_cleanup()

    metodo    = event.get("httpMethod", "")
    resource  = event.get("resource", "")
    path_params = event.get("pathParameters") or {}
    id_usuario  = path_params.get("id_usuario")
    id_empresa  = path_params.get("id_empresa")

    try:
        # ── GET /usuarios/me ─────────────────────────────────────────────────
        if metodo == "GET" and resource == "/usuarios/me":
            email = _email_usuario(event)
            if not email:
                return _respuesta(401, {"error": "No se pudo determinar el usuario"})
            usuario = _buscar_por_email(email)
            if not usuario:
                return _respuesta_sin_registro()
            # Resolver los datos legibles de la afiliacion -- el frontend solo
            # conoce empresa_id (un id opaco), y no puede resolverlos por su
            # cuenta porque GET /empresas es exclusivo de super_admin. Cada
            # usuario sí puede ver los de SU PROPIA afiliación acá. Además de
            # empresa_nombre, admin/tecnico necesitan departamento/ciudad para
            # que su Punto se auto-complete con la ubicación de su zona (no
            # las eligen ellos, solo super_admin administra zonas).
            if usuario.get("empresa_id"):
                empresa = tabla_empresas.get_item(Key={"id_empresa": usuario["empresa_id"]}).get("Item")
                # Afiliación desactivada → el usuario no entra. super_admin
                # nunca pasa por acá (no tiene empresa_id), así que siempre
                # queda alguien que pueda reactivarla.
                if empresa and empresa.get("activa") is False:
                    return _respuesta_afiliacion_inactiva(empresa.get("nombre", usuario["empresa_id"]))
                usuario = {
                    **usuario,
                    "empresa_nombre": empresa.get("nombre") if empresa else None,
                    "empresa_departamento": empresa.get("departamento") if empresa else None,
                    "empresa_ciudad": empresa.get("ciudad") if empresa else None,
                }
            return _respuesta(200, usuario)

        # ── PUT /usuarios/me ─────────────────────────────────────────────────
        elif metodo == "PUT" and resource == "/usuarios/me":
            email = _email_usuario(event)
            if not email:
                return _respuesta(401, {"error": "No se pudo determinar el usuario"})
            usuario = _buscar_por_email(email)
            if not usuario:
                return _respuesta_sin_registro()
            body = json.loads(event.get("body") or "{}")
            campos = {k: v for k, v in body.items() if k in CAMPOS_PERMITIDOS_ME}
            if not campos:
                return _respuesta(400, {"error": "No hay campos válidos para actualizar"})
            expr    = "SET " + ", ".join(f"#{k} = :{k}" for k in campos)
            nombres = {f"#{k}": k for k in campos}
            valores = {f":{k}": v for k, v in campos.items()}
            tabla.update_item(
                Key={"id_usuario": usuario["id_usuario"]},
                UpdateExpression=expr,
                ExpressionAttributeNames=nombres,
                ExpressionAttributeValues=valores,
            )
            return _respuesta(200, {"mensaje": "Perfil actualizado"})

        # ── GET /usuarios ─────────────────────────────────────────────────────
        elif metodo == "GET" and resource == "/usuarios":
            creador = _usuario_actual(event)
            if not creador or creador.get("rol") not in ("admin", "super_admin"):
                # tecnico solo puede dar de alta cliente (no lista, no
                # edita); cliente no tiene gestión de usuarios.
                return _respuesta(403, {"error": "No tenés permiso para listar usuarios"})

            if creador.get("rol") == "super_admin":
                resp = tabla.scan()
                return _respuesta(200, resp.get("Items", []))

            resp = tabla.query(
                IndexName="empresa-index",
                KeyConditionExpression=Key("empresa_id").eq(creador.get("empresa_id")),
            )
            return _respuesta(200, resp.get("Items", []))

        # ── POST /colaborador — crear colaborador temporal ────────────────────
        elif metodo == "POST" and resource == "/colaborador":
            if not _es_admin(event):
                return _respuesta(403, {"error": "Solo administradores pueden crear colaboradores"})

            body     = json.loads(event.get("body") or "{}")
            nickname = (body.get("nickname") or "").strip()
            password = body.get("password", "")
            dias     = int(body.get("dias", 30))
            rol      = body.get("rol", "tecnico")

            if not nickname:
                return _respuesta(400, {"error": "nickname es requerido"})
            error_password = _validar_password(password)
            if error_password:
                return _respuesta(400, {"error": error_password})
            if not 1 <= dias <= 30:
                return _respuesta(400, {"error": "dias debe estar entre 1 y 30"})
            if rol not in ROLES_VALIDOS:
                return _respuesta(400, {"error": f"rol debe ser uno de: {ROLES_VALIDOS}"})

            sanitizado = _sanitizar_nickname(nickname)
            if not sanitizado:
                return _respuesta(400, {"error": "El nickname no genera un identificador válido"})

            email_interno      = f"{sanitizado}@corria.app"
            cognito_username   = email_interno   # login identifier for the collaborator
            vence_en           = (datetime.now(timezone.utc) + timedelta(days=dias)).isoformat()
            creado_por         = _email_usuario(event)

            resp_cognito = cognito.admin_create_user(
                UserPoolId=USER_POOL_ID,
                Username=cognito_username,
                UserAttributes=[
                    {"Name": "email",          "Value": email_interno},
                    {"Name": "email_verified", "Value": "true"},
                    {"Name": "given_name",     "Value": nickname},
                ],
                MessageAction="SUPPRESS",
            )
            cognito_sub = next(
                (a["Value"] for a in resp_cognito["User"]["Attributes"] if a["Name"] == "sub"),
                None,
            )

            id_nuevo = f"USR-{uuid.uuid4()}"
            item = {
                "id_usuario":      id_nuevo,
                "email":           email_interno,
                "cognito_username": cognito_username,
                "nickname":        nickname,
                "cognito_sub":     cognito_sub,
                "rol":             rol,
                "es_colaborador":  True,
                "dias_max":        dias,
                "vence_en":        vence_en,
                "creado_por":      creado_por,
                "nombre":          nickname,
                "activo":          True,
                "fecha_creacion":  datetime.now(timezone.utc).isoformat(),
            }
            # Desde acá, cualquier fallo debe deshacer el admin_create_user de
            # arriba — si no, el usuario queda huérfano en Cognito (existe ahí,
            # invisible en esta tabla) y bloquea el nickname para siempre.
            try:
                cognito.admin_set_user_password(
                    UserPoolId=USER_POOL_ID,
                    Username=cognito_username,
                    Password=password,
                    Permanent=True,
                )
                cognito.admin_add_user_to_group(
                    UserPoolId=USER_POOL_ID,
                    Username=cognito_username,
                    GroupName=rol,
                )
                tabla.put_item(Item=item)
            except Exception as e:
                _rollback_usuario_cognito(cognito_username, e)
                raise

            logger.info("Colaborador creado: %s → %s (vence %s)", nickname, id_nuevo, vence_en)
            return _respuesta(201, {
                "mensaje":    f"Colaborador '{nickname}' creado correctamente",
                "id_usuario": id_nuevo,
                "nickname":   nickname,
                "vence_en":   vence_en,
                "login":      nickname,
                "password":   password,
            })

        # ── POST /usuarios ────────────────────────────────────────────────────
        elif metodo == "POST" and resource == "/usuarios":
            creador = _usuario_actual(event)
            if not creador:
                return _respuesta(403, {"error": "No se pudo verificar el usuario solicitante"})
            rol_creador = creador.get("rol")

            body    = json.loads(event.get("body") or "{}")
            email   = body.get("email")
            nombre  = body.get("nombre", "")
            cargo   = body.get("cargo", "")
            rol     = body.get("rol", "cliente")
            if not email:
                return _respuesta(400, {"error": "email es requerido"})
            if rol not in ROLES_VALIDOS:
                return _respuesta(400, {"error": f"rol debe ser uno de: {ROLES_VALIDOS}"})
            if rol not in CREATABLE_ROLES.get(rol_creador, set()):
                return _respuesta(403, {"error": f"Tu rol ({rol_creador}) no puede crear usuarios con rol '{rol}'"})

            # El empresa_id de un usuario nuevo SIEMPRE se fuerza al del
            # creador — nunca se toma del body — salvo que el creador sea
            # super_admin, el único rol que puede pasar un empresa_id
            # explícito (y debe hacerlo, validado contra la tabla empresas).
            if rol_creador == "super_admin":
                empresa_id = body.get("empresa_id")
                if not empresa_id:
                    return _respuesta(400, {"error": "empresa_id es requerido"})
                if not tabla_empresas.get_item(Key={"id_empresa": empresa_id}).get("Item"):
                    return _respuesta(404, {"error": f"Empresa {empresa_id} no encontrada"})
            else:
                empresa_id = creador.get("empresa_id")

            resp_cognito = cognito.admin_create_user(
                UserPoolId=USER_POOL_ID,
                Username=email,
                UserAttributes=[
                    {"Name": "email",          "Value": email},
                    {"Name": "email_verified", "Value": "true"},
                    {"Name": "given_name",     "Value": nombre},
                ],
                DesiredDeliveryMediums=["EMAIL"],
            )
            cognito_sub = next(
                (a["Value"] for a in resp_cognito["User"]["Attributes"] if a["Name"] == "sub"),
                None,
            )
            # Mismo riesgo que en /colaborador: si algo falla desde acá, hay
            # que deshacer el admin_create_user para no dejar un huérfano.
            try:
                cognito.admin_add_user_to_group(
                    UserPoolId=USER_POOL_ID, Username=email, GroupName=rol,
                )
                id_nuevo = f"USR-{uuid.uuid4()}"
                item_nuevo = {
                    "id_usuario":    id_nuevo,
                    "email":         email,
                    "cognito_sub":   cognito_sub,
                    "rol":           rol,
                    "nombre":        nombre,
                    "cargo":         cargo,
                    "fecha_creacion": datetime.now(timezone.utc).isoformat(),
                    "activo":        True,
                }
                if empresa_id:
                    item_nuevo["empresa_id"] = empresa_id
                tabla.put_item(Item=item_nuevo)
            except Exception as e:
                _rollback_usuario_cognito(email, e)
                raise
            return _respuesta(201, {"mensaje": f"Usuario creado. Se envió contraseña temporal a {email}"})

        # ── PUT /usuarios/{id_usuario} ────────────────────────────────────────
        elif metodo == "PUT" and resource == "/usuarios/{id_usuario}" and id_usuario:
            creador = _usuario_actual(event)
            if not creador or creador.get("rol") not in ("admin", "super_admin"):
                return _respuesta(403, {"error": "Solo administradores pueden modificar usuarios"})
            body = json.loads(event.get("body") or "{}")
            resp = tabla.get_item(Key={"id_usuario": id_usuario})
            usuario = resp.get("Item")
            if not usuario:
                return _respuesta(404, {"error": f"Usuario {id_usuario} no encontrado"})
            if _fuera_de_alcance(creador, usuario):
                return _respuesta(403, {"error": "No tenés permiso para modificar usuarios de otra empresa"})

            if body.get("reactivar") is True:
                email_objetivo = usuario.get("email")
                cognito.admin_enable_user(UserPoolId=USER_POOL_ID, Username=email_objetivo)
                ahora = datetime.now(timezone.utc).isoformat()
                try:
                    tabla.update_item(
                        Key={"id_usuario": id_usuario},
                        UpdateExpression="SET #activo = :verdad, #fecha_reac = :ahora REMOVE #fecha_des",
                        ExpressionAttributeNames={
                            "#activo": "activo",
                            "#fecha_reac": "fecha_reactivacion",
                            "#fecha_des": "fecha_deshabilitacion",
                        },
                        ExpressionAttributeValues={":verdad": True, ":ahora": ahora},
                    )
                except Exception as e:
                    # Sin esto, Cognito ya deja loguear al usuario mientras
                    # Dynamo lo sigue mostrando como inactivo — deshacemos el
                    # enable para que ambos sistemas queden de acuerdo.
                    try:
                        cognito.admin_disable_user(UserPoolId=USER_POOL_ID, Username=email_objetivo)
                    except Exception as rollback_err:
                        logger.error("Rollback de reactivación falló para '%s': %s", email_objetivo, rollback_err)
                    raise
                return _respuesta(200, tabla.get_item(Key={"id_usuario": id_usuario}).get("Item", {}))

            campos = {k: v for k, v in body.items() if k in CAMPOS_PERMITIDOS_ADMIN}
            if not campos:
                return _respuesta(400, {"error": "No hay campos válidos para actualizar"})
            rol_nuevo  = campos.get("rol")
            rol_actual = usuario.get("rol")
            email_usr  = usuario.get("email")
            cambio_rol_aplicado = False
            if rol_nuevo and rol_nuevo != rol_actual:
                if rol_nuevo not in ROLES_VALIDOS:
                    return _respuesta(400, {"error": f"rol debe ser uno de: {ROLES_VALIDOS}"})
                # Mismo límite que en la creación: si tu rol no puede CREAR ese
                # rol, tampoco podés otorgarlo editando a alguien ya existente
                # (si no, un admin podría auto-promoverse o promover a otro
                # usuario de su empresa a super_admin editando en vez de crear).
                if rol_nuevo not in CREATABLE_ROLES.get(creador.get("rol"), set()):
                    return _respuesta(403, {"error": f"Tu rol ({creador.get('rol')}) no puede asignar el rol '{rol_nuevo}'"})
                try:
                    if rol_actual in ROLES_VALIDOS:
                        cognito.admin_remove_user_from_group(
                            UserPoolId=USER_POOL_ID, Username=email_usr, GroupName=rol_actual,
                        )
                    cognito.admin_add_user_to_group(
                        UserPoolId=USER_POOL_ID, Username=email_usr, GroupName=rol_nuevo,
                    )
                    cambio_rol_aplicado = True
                except Exception as e:
                    # El remove pudo haber pegado antes de que el add fallara:
                    # sin este rollback el usuario queda sin ningún grupo en
                    # Cognito (sin permisos de ningún rol).
                    if rol_actual in ROLES_VALIDOS:
                        try:
                            cognito.admin_add_user_to_group(
                                UserPoolId=USER_POOL_ID, Username=email_usr, GroupName=rol_actual,
                            )
                        except Exception as rollback_err:
                            logger.error("Rollback de cambio de rol falló para '%s': %s", email_usr, rollback_err)
                    raise

            expr    = "SET " + ", ".join(f"#{k} = :{k}" for k in campos)
            nombres = {f"#{k}": k for k in campos}
            valores = {f":{k}": v for k, v in campos.items()}
            try:
                tabla.update_item(
                    Key={"id_usuario": id_usuario},
                    UpdateExpression=expr,
                    ExpressionAttributeNames=nombres,
                    ExpressionAttributeValues=valores,
                )
            except Exception as e:
                if cambio_rol_aplicado:
                    # Cognito ya tiene el rol nuevo pero Dynamo no se pudo
                    # actualizar — deshacer el cambio de grupo para que no
                    # queden en desacuerdo sobre qué rol tiene el usuario.
                    try:
                        cognito.admin_remove_user_from_group(
                            UserPoolId=USER_POOL_ID, Username=email_usr, GroupName=rol_nuevo,
                        )
                        if rol_actual in ROLES_VALIDOS:
                            cognito.admin_add_user_to_group(
                                UserPoolId=USER_POOL_ID, Username=email_usr, GroupName=rol_actual,
                            )
                    except Exception as rollback_err:
                        logger.error("Rollback de cambio de rol (post-Dynamo) falló para '%s': %s", email_usr, rollback_err)
                raise
            return _respuesta(200, {"mensaje": "Usuario actualizado", "id_usuario": id_usuario})

        # ── DELETE /usuarios/{id_usuario}/eliminar ────────────────────────────
        elif metodo == "DELETE" and resource == "/usuarios/{id_usuario}/eliminar" and id_usuario:
            creador = _usuario_actual(event)
            if not creador or creador.get("rol") not in ("admin", "super_admin"):
                return _respuesta(403, {"error": "Solo administradores pueden eliminar usuarios"})
            email_propio = _email_usuario(event)
            resp    = tabla.get_item(Key={"id_usuario": id_usuario})
            usuario = resp.get("Item")
            if not usuario:
                return _respuesta(404, {"error": f"Usuario {id_usuario} no encontrado"})
            if _fuera_de_alcance(creador, usuario):
                return _respuesta(403, {"error": "No tenés permiso para eliminar usuarios de otra empresa"})
            if usuario.get("email") == email_propio:
                return _respuesta(400, {"error": "No puedes eliminar tu propia cuenta"})
            query_params = event.get("queryStringParameters") or {}
            forzar = query_params.get("forzar") == "true" and creador.get("rol") == "super_admin"
            if _tiene_historial(usuario.get("cognito_sub", "")) and not forzar:
                return _respuesta(
                    409,
                    {"error": "Este usuario tiene puntos o mediciones asociados — "
                              "eliminarlo dejaría ese historial huérfano. "
                              "Usá deshabilitar (DELETE /usuarios/{id_usuario}) en su lugar, "
                              "o pedile a un super_admin que fuerce el borrado con ?forzar=true "
                              "(el nombre queda guardado en cada punto/medición, así que el "
                              "historial sigue siendo legible aunque la cuenta desaparezca)."},
                )
            email_objetivo = usuario.get("email")
            cognito.admin_delete_user(UserPoolId=USER_POOL_ID, Username=email_objetivo)
            try:
                tabla.delete_item(Key={"id_usuario": id_usuario})
            except Exception as e:
                # No hay forma segura de "deshacer" un admin_delete_user (no se
                # puede recrear el mismo usuario con su sub original) — a
                # diferencia de los otros casos, acá lo único que se puede
                # hacer es dejar un rastro fuerte para limpieza manual en vez
                # de fallar en silencio con una fila fantasma en la tabla.
                logger.error(
                    "INCONSISTENCIA: '%s' (%s) se borró de Cognito pero el delete en DynamoDB falló — "
                    "requiere borrar la fila a mano en pf-corrosion-usuarios: %s",
                    email_objetivo, id_usuario, e,
                )
                raise
            return _respuesta(200, {"mensaje": "Usuario eliminado permanentemente"})

        # ── DELETE /usuarios/{id_usuario} — deshabilitar ──────────────────────
        elif metodo == "DELETE" and resource == "/usuarios/{id_usuario}" and id_usuario:
            creador = _usuario_actual(event)
            if not creador or creador.get("rol") not in ("admin", "super_admin"):
                return _respuesta(403, {"error": "Solo administradores pueden deshabilitar usuarios"})
            resp    = tabla.get_item(Key={"id_usuario": id_usuario})
            usuario = resp.get("Item")
            if not usuario:
                return _respuesta(404, {"error": f"Usuario {id_usuario} no encontrado"})
            if _fuera_de_alcance(creador, usuario):
                return _respuesta(403, {"error": "No tenés permiso para deshabilitar usuarios de otra empresa"})
            email_objetivo = usuario.get("email")
            cognito.admin_disable_user(UserPoolId=USER_POOL_ID, Username=email_objetivo)
            ahora = datetime.now(timezone.utc).isoformat()
            try:
                tabla.update_item(
                    Key={"id_usuario": id_usuario},
                    UpdateExpression="SET #activo = :falso, #fecha_des = :ahora",
                    ExpressionAttributeNames={"#activo": "activo", "#fecha_des": "fecha_deshabilitacion"},
                    ExpressionAttributeValues={":falso": False, ":ahora": ahora},
                )
            except Exception as e:
                # Sin esto, Cognito ya bloquea el login mientras Dynamo sigue
                # mostrando al usuario como activo — deshacer el disable.
                try:
                    cognito.admin_enable_user(UserPoolId=USER_POOL_ID, Username=email_objetivo)
                except Exception as rollback_err:
                    logger.error("Rollback de deshabilitación falló para '%s': %s", email_objetivo, rollback_err)
                raise
            return _respuesta(200, {"mensaje": "Usuario deshabilitado correctamente"})

        # ── GET /empresas — listar (solo super_admin) ──────────────────────────
        elif metodo == "GET" and resource == "/empresas":
            creador = _usuario_actual(event)
            if not creador or creador.get("rol") != "super_admin":
                return _respuesta(403, {"error": "Solo super_admin puede ver la lista de empresas"})
            resp = tabla_empresas.scan()
            return _respuesta(200, {"empresas": resp.get("Items", [])})

        # ── POST /empresas — crear (solo super_admin) ──────────────────────────
        elif metodo == "POST" and resource == "/empresas":
            creador = _usuario_actual(event)
            if not creador or creador.get("rol") != "super_admin":
                return _respuesta(403, {"error": "Solo super_admin puede crear empresas"})
            body = json.loads(event.get("body") or "{}")
            nombre = (body.get("nombre") or "").strip()
            if not nombre:
                return _respuesta(400, {"error": "nombre es requerido"})
            # departamento/ciudad: requeridos al crear -- ubican la empresa
            # de forma legible antes de que exista una zona dibujada.
            departamento = body.get("departamento")
            if not isinstance(departamento, str) or not departamento.strip():
                return _respuesta(400, {"error": "departamento es requerido"})
            departamento = departamento.strip()
            ciudad = body.get("ciudad")
            if not isinstance(ciudad, str) or not ciudad.strip():
                return _respuesta(400, {"error": "ciudad es requerida"})
            ciudad = ciudad.strip()
            # tipo_material: opcional, texto libre -- propiedad del SITIO
            # completo (los puntos de una zona suelen compartir material),
            # por eso se pregunta acá y no en cada punto.
            tipo_material = body.get("tipo_material")
            if tipo_material is not None and not isinstance(tipo_material, str):
                return _respuesta(400, {"error": "tipo_material debe ser un texto"})
            # zonas: requerido -- toda empresa necesita su área dibujada.
            zonas = body.get("zonas")
            error_zonas = _validar_zonas(zonas)
            if error_zonas:
                return _respuesta(error_zonas[0], {"error": error_zonas[1]})
            # Evitar duplicados obvios por nombre (case-insensitive) — un
            # scan es aceptable acá: se espera un puñado de empresas, no miles.
            existentes = tabla_empresas.scan().get("Items", [])
            if any(e.get("nombre", "").strip().lower() == nombre.lower() for e in existentes):
                return _respuesta(409, {"error": f"Ya existe una empresa llamada '{nombre}'"})
            id_empresa = f"EMP-{uuid.uuid4()}"
            item = {
                "id_empresa": id_empresa,
                "nombre": nombre,
                "departamento": departamento,
                "ciudad": ciudad,
                "activa": True,
                "fecha_creacion": datetime.now(timezone.utc).isoformat(),
                "creado_por": creador.get("id_usuario", ""),
            }
            if tipo_material is not None:
                item["tipo_material"] = tipo_material
            item["zonas"] = zonas
            # lat/lng de zonas vienen como float desde el
            # frontend — DynamoDB requiere Decimal.
            item = floats_to_decimal(item)
            tabla_empresas.put_item(Item=item)
            # Marcador de "carpeta" de la empresa en S3 (objeto de 0 bytes).
            # Las mediciones se guardan bajo empresas/{empresa_id}/{bloque}/...
            # (ver lambda_src/inference); el marcador solo hace visible la
            # carpeta en la consola aunque todavía no tenga fotos. No es
            # bloqueante: el ítem en DynamoDB es lo que manda.
            try:
                s3.put_object(Bucket=BUCKET_NAME, Key=f"empresas/{id_empresa}/", Body=b"")
            except Exception as e:
                logger.warning("No se pudo crear el marcador S3 de la empresa %s: %s", id_empresa, e)
            return _respuesta(201, item)

        # ── PUT /empresas/{id_empresa} — editar / activar-desactivar (solo
        # super_admin) ───────────────────────────────────────────────────────
        elif metodo == "PUT" and resource == "/empresas/{id_empresa}" and id_empresa:
            creador = _usuario_actual(event)
            if not creador or creador.get("rol") != "super_admin":
                return _respuesta(403, {"error": "Solo super_admin puede editar empresas"})
            resp = tabla_empresas.get_item(Key={"id_empresa": id_empresa})
            empresa = resp.get("Item")
            if not empresa:
                return _respuesta(404, {"error": f"Empresa {id_empresa} no encontrada"})

            body          = json.loads(event.get("body") or "{}")
            nombre        = body.get("nombre")
            activa        = body.get("activa")
            departamento  = body.get("departamento")
            ciudad        = body.get("ciudad")
            tipo_material = body.get("tipo_material")
            zonas         = body.get("zonas")
            if all(v is None for v in (nombre, activa, departamento, ciudad, tipo_material, zonas)):
                return _respuesta(400, {"error": "Debes indicar al menos un campo para actualizar"})

            campos = {}
            if nombre is not None:
                if not isinstance(nombre, str):
                    return _respuesta(400, {"error": "nombre debe ser un texto"})
                nombre = nombre.strip()
                if not nombre:
                    return _respuesta(400, {"error": "nombre no puede estar vacío"})
                # Mismo chequeo de duplicado case-insensitive que POST
                # /empresas, excluyendo la propia empresa que se edita.
                existentes = tabla_empresas.scan().get("Items", [])
                if any(
                    e.get("nombre", "").strip().lower() == nombre.lower() and e.get("id_empresa") != id_empresa
                    for e in existentes
                ):
                    return _respuesta(409, {"error": f"Ya existe una empresa llamada '{nombre}'"})
                campos["nombre"] = nombre
            if activa is not None:
                if not isinstance(activa, bool):
                    return _respuesta(400, {"error": "activa debe ser un booleano"})
                campos["activa"] = activa
            if departamento is not None:
                if not isinstance(departamento, str) or not departamento.strip():
                    return _respuesta(400, {"error": "departamento debe ser un texto no vacío"})
                campos["departamento"] = departamento.strip()
            if ciudad is not None:
                if not isinstance(ciudad, str) or not ciudad.strip():
                    return _respuesta(400, {"error": "ciudad debe ser un texto no vacío"})
                campos["ciudad"] = ciudad.strip()
            if tipo_material is not None:
                if not isinstance(tipo_material, str):
                    return _respuesta(400, {"error": "tipo_material debe ser un texto"})
                campos["tipo_material"] = tipo_material
            if zonas is not None:
                error_zonas = _validar_zonas(zonas)
                if error_zonas:
                    return _respuesta(error_zonas[0], {"error": error_zonas[1]})
                campos["zonas"] = zonas

            expr    = "SET " + ", ".join(f"#{k} = :{k}" for k in campos)
            nombres = {f"#{k}": k for k in campos}
            # lat/lng de zonas vienen como float desde el
            # frontend — DynamoDB requiere Decimal.
            valores = floats_to_decimal({f":{k}": v for k, v in campos.items()})
            tabla_empresas.update_item(
                Key={"id_empresa": id_empresa},
                UpdateExpression=expr,
                ExpressionAttributeNames=nombres,
                ExpressionAttributeValues=valores,
            )
            return _respuesta(200, tabla_empresas.get_item(Key={"id_empresa": id_empresa}).get("Item", {}))

        return _respuesta(405, {"error": f"Método {metodo} no permitido"})

    except cognito.exceptions.UsernameExistsException:
        return _respuesta(409, {"error": "Ya existe un usuario con ese email"})
    except cognito.exceptions.UserNotFoundException:
        return _respuesta(404, {"error": "Usuario no encontrado en Cognito"})
    except Exception as e:
        logger.exception("Error en api_usuarios: %s", e)
        return _respuesta(500, {"error": str(e)})
