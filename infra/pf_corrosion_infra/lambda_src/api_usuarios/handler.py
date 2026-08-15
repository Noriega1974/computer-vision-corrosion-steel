"""
CorrIA - Lambda de gestión de usuarios y colaboradores.

Rutas API Gateway:
  POST   /usuarios                        → crear usuario (solo admin)
  GET    /usuarios                        → listar usuarios (solo admin)
  GET    /usuarios/me                     → perfil propio (cualquier rol)
  PUT    /usuarios/me                     → actualizar perfil propio (cualquier rol)
  PUT    /usuarios/{id_usuario}           → actualizar usuario (solo admin)
  DELETE /usuarios/{id_usuario}/eliminar  → eliminar usuario permanentemente (solo admin)
  DELETE /usuarios/{id_usuario}           → deshabilitar usuario (solo admin)
  POST   /colaborador                     → crear colaborador temporal con nickname (solo admin)

Evento directo (EventBridge cron diario):
  Sin httpMethod → ejecuta limpieza de colaboradores vencidos
"""
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta

import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLA_USUARIOS = os.environ["TABLA_USUARIOS"]
USER_POOL_ID   = os.environ["USER_POOL_ID"]
REGION         = os.environ["REGION"]

dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla    = dynamodb.Table(TABLA_USUARIOS)
cognito  = boto3.client("cognito-idp", region_name=REGION)

ROLES_VALIDOS = {"admin", "tecnico", "cliente"}
CAMPOS_PROTEGIDOS_ME    = {"email", "rol", "id_usuario", "cognito_sub", "fecha_creacion"}
CAMPOS_PERMITIDOS_ME    = {"nombre", "telefono", "cargo", "avatar_color", "fecha_ultimo_login"}
CAMPOS_PERMITIDOS_ADMIN = {"nombre", "rol", "telefono", "cargo"}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _respuesta(codigo: int, cuerpo) -> dict:
    return {
        "statusCode": codigo,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(cuerpo, ensure_ascii=False, default=str),
    }

def _claims(event: dict) -> dict:
    return event.get("requestContext", {}).get("authorizer", {}).get("claims", {})

def _es_admin(event: dict) -> bool:
    grupos = _claims(event).get("cognito:groups", "") or ""
    return "admin" in grupos.split(",")

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

def _crear_usuario_basico(email: str, claims: dict) -> dict:
    grupos = claims.get("cognito:groups", "") or ""
    rol = "cliente"
    for g in grupos.split(","):
        if g.strip() in ROLES_VALIDOS:
            rol = g.strip()
            break
    id_usuario = f"USR-{uuid.uuid4()}"
    item = {
        "id_usuario": id_usuario,
        "email": email,
        "cognito_sub": claims.get("sub", ""),
        "rol": rol,
        "nombre": claims.get("given_name", ""),
        "fecha_creacion": datetime.now(timezone.utc).isoformat(),
    }
    tabla.put_item(Item=item)
    return item

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

    try:
        # ── GET /usuarios/me ─────────────────────────────────────────────────
        if metodo == "GET" and resource == "/usuarios/me":
            email = _email_usuario(event)
            if not email:
                return _respuesta(401, {"error": "No se pudo determinar el usuario"})
            usuario = _buscar_por_email(email)
            if not usuario:
                usuario = _crear_usuario_basico(email, _claims(event))
            return _respuesta(200, usuario)

        # ── PUT /usuarios/me ─────────────────────────────────────────────────
        elif metodo == "PUT" and resource == "/usuarios/me":
            email = _email_usuario(event)
            if not email:
                return _respuesta(401, {"error": "No se pudo determinar el usuario"})
            usuario = _buscar_por_email(email)
            if not usuario:
                usuario = _crear_usuario_basico(email, _claims(event))
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
            if not _es_admin(event):
                return _respuesta(403, {"error": "Solo administradores pueden listar usuarios"})
            resp = tabla.scan()
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
            if not _es_admin(event):
                return _respuesta(403, {"error": "Solo administradores pueden crear usuarios"})
            body    = json.loads(event.get("body") or "{}")
            email   = body.get("email")
            nombre  = body.get("nombre", "")
            cargo   = body.get("cargo", "")
            rol     = body.get("rol", "cliente")
            if not email:
                return _respuesta(400, {"error": "email es requerido"})
            if rol not in ROLES_VALIDOS:
                return _respuesta(400, {"error": f"rol debe ser uno de: {ROLES_VALIDOS}"})
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
                tabla.put_item(Item={
                    "id_usuario":    id_nuevo,
                    "email":         email,
                    "cognito_sub":   cognito_sub,
                    "rol":           rol,
                    "nombre":        nombre,
                    "cargo":         cargo,
                    "fecha_creacion": datetime.now(timezone.utc).isoformat(),
                    "activo":        True,
                })
            except Exception as e:
                _rollback_usuario_cognito(email, e)
                raise
            return _respuesta(201, {"mensaje": f"Usuario creado. Se envió contraseña temporal a {email}"})

        # ── PUT /usuarios/{id_usuario} ────────────────────────────────────────
        elif metodo == "PUT" and resource == "/usuarios/{id_usuario}" and id_usuario:
            if not _es_admin(event):
                return _respuesta(403, {"error": "Solo administradores pueden modificar usuarios"})
            body = json.loads(event.get("body") or "{}")
            resp = tabla.get_item(Key={"id_usuario": id_usuario})
            usuario = resp.get("Item")
            if not usuario:
                return _respuesta(404, {"error": f"Usuario {id_usuario} no encontrado"})

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
            if not _es_admin(event):
                return _respuesta(403, {"error": "Solo administradores pueden eliminar usuarios"})
            email_propio = _email_usuario(event)
            resp    = tabla.get_item(Key={"id_usuario": id_usuario})
            usuario = resp.get("Item")
            if not usuario:
                return _respuesta(404, {"error": f"Usuario {id_usuario} no encontrado"})
            if usuario.get("email") == email_propio:
                return _respuesta(400, {"error": "No puedes eliminar tu propia cuenta"})
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
            if not _es_admin(event):
                return _respuesta(403, {"error": "Solo administradores pueden deshabilitar usuarios"})
            resp    = tabla.get_item(Key={"id_usuario": id_usuario})
            usuario = resp.get("Item")
            if not usuario:
                return _respuesta(404, {"error": f"Usuario {id_usuario} no encontrado"})
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

        return _respuesta(405, {"error": f"Método {metodo} no permitido"})

    except cognito.exceptions.UsernameExistsException:
        return _respuesta(409, {"error": "Ya existe un usuario con ese email"})
    except cognito.exceptions.UserNotFoundException:
        return _respuesta(404, {"error": "Usuario no encontrado en Cognito"})
    except Exception as e:
        logger.exception("Error en api_usuarios: %s", e)
        return _respuesta(500, {"error": str(e)})
