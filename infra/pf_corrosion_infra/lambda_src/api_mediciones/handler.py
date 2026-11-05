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
                                      ?id_medicion=X devuelve solo esa medicion (completa),
                                      ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD acota por día local de
                                      Colombia (UTC-5); con rango el límite por defecto es el máximo
                                      (500) y la respuesta trae `truncado` (true si hay más)
  GET    /mediciones/resumen-diario → agregados por día local (UTC-5) de un año:
                                      ?anio=YYYY (obligatorio), ?id_punto=BLQ-... (opcional),
                                      ?empresa_id=EMP-... (opcional, solo lo respeta super_admin);
                                      solo lectura, pagina todo (sin el tope de 1000)
  GET    /indicadores              → indicadores globales del sistema (ver `_indicadores`):
                                      ?empresa_id=EMP-... (opcional, solo lo respeta super_admin)
  GET    /mediciones/recientes     → últimas N mediciones, filtrado por empresa (cualquier rol)
                                      ?limit=N (def. 20, máx. 1000), ?resumen=1 quita campos pesados,
                                      ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD acota por día local (UTC-5)
                                      sobre el GSI; con rango el límite por defecto es 1000 y la
                                      respuesta trae `truncado`. `limit`/`limite` (ambos nombres valen) no numérico → 400
  DELETE /mediciones/{id_punto}    → elimina una medición puntual (super_admin/admin/tecnico;
                                      el tecnico solo las que él mismo tomó)
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
import math
import logging
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLA_MEDICIONES = os.environ["TABLA_MEDICIONES"]
TABLA_USUARIOS = os.environ["TABLA_USUARIOS"]
TABLA_BLOQUES = os.environ["TABLA_BLOQUES"]
TABLA_EMPRESAS = os.environ["TABLA_EMPRESAS"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
REGION = os.environ["REGION"]

SK_MEDICION_PREFIJO = "MED#"

# Roles que pueden eliminar, mover y renombrar mediciones (cliente solo lee).
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
# `area_base` NO se omite (la galería indica sobre qué se calculó el %); el
# contorno de la placa sí, igual que las máscaras.
CAMPOS_PESADOS = ("mascaras", "detecciones", "inferencia_local", "clima", "contorno_placa")

# Mismo criterio que lambda_src/inference (_nombre_foto): no hay módulo
# compartido entre lambdas, así que se replica.
NOMBRE_MAX = 80
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")

# Colombia no tiene horario de verano: el día local es siempre UTC-5.
TZ_LOCAL = timezone(timedelta(hours=-5))
_FECHA_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
# Primer año con datos (el proyecto arrancó en 2026) y tope de páginas del resumen
# diario (cada página lee hasta 1 MB; protege el costo si el filtro descarta casi todo).
ANIO_MIN = 2026
MAX_PAGINAS_RESUMEN = 200

dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla = dynamodb.Table(TABLA_MEDICIONES)
tabla_usuarios = dynamodb.Table(TABLA_USUARIOS)
tabla_bloques = dynamodb.Table(TABLA_BLOQUES)
tabla_empresas = dynamodb.Table(TABLA_EMPRESAS)
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


def _resolver_usuario_actual(event: dict) -> dict | None:
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


def _usuario_actual(event: dict) -> dict | None:
    """Memoiza `_resolver_usuario_actual` por invocación (en el propio event):
    el gate de cuenta inactiva y la ruta llaman a esto en la misma petición y
    así la tabla `usuarios` se lee una sola vez."""
    if not isinstance(event, dict):
        return _resolver_usuario_actual(event)
    if "_usuario_actual_cache" not in event:
        event["_usuario_actual_cache"] = _resolver_usuario_actual(event)
    return event["_usuario_actual_cache"]


# ── Cuenta o afiliación desactivada ──────────────────────────────────────────
# Copia idéntica en api_mediciones, api_puntos e inference (no hay módulo
# compartido entre lambdas): si cambia una, cambian las tres.

MENSAJE_CUENTA_DESACTIVADA = "Tu cuenta está desactivada. Pide ayuda a un administrador"
MENSAJE_AFILIACION_DESACTIVADA = "Tu afiliación está desactivada. Pide ayuda a un administrador"


def _rechazo_cuenta_inactiva(creador: dict | None) -> dict | None:
    """403 si el usuario (`activo=false`) o su afiliación (`activa=false`)
    fue desactivado; None si puede continuar. super_admin y quien no tiene
    registro quedan fuera: lo segundo lo resuelve cada ruta con su propio
    chequeo de rol. Sin esto un token todavía vigente seguiría operando hasta
    que Cognito lo expire."""
    if not creador or creador.get("rol") == "super_admin":
        return None
    if creador.get("activo") is False:
        return _respuesta(403, {"error": MENSAJE_CUENTA_DESACTIVADA})
    empresa_id = creador.get("empresa_id")
    if empresa_id:
        empresa = tabla_empresas.get_item(Key={"id_empresa": empresa_id}).get("Item")
        if empresa and empresa.get("activa") is False:
            return _respuesta(403, {"error": MENSAJE_AFILIACION_DESACTIVADA})
    return None


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


def _sub(event: dict) -> str:
    return _claims(event).get("sub", "") or ""


def _es_del_usuario(item: dict, sub: str) -> bool:
    """La medición la tomó `sub` (inference guarda el `sub` de Cognito en
    `tomado_por_id` y `usuario_id`)."""
    return bool(sub) and sub in (item.get("tomado_por_id"), item.get("usuario_id"))


def _ajenas_para_tecnico(creador: dict, sub: str, items: list) -> list:
    """Regla del técnico: solo mueve, elimina y renombra lo que él mismo tomó. Para los
    demás roles devuelve []."""
    if creador.get("rol") != "tecnico":
        return []
    return [i for i in items if not _es_del_usuario(i, sub)]


def _rechazo_ajenas(n: int, accion: str) -> dict:
    if n == 1:
        msg = f"Solo puedes {accion} las mediciones que tomaste tú. Quita la medición ajena e inténtalo de nuevo"
    else:
        msg = f"Solo puedes {accion} las mediciones que tomaste tú. {n} de la selección son de otra persona; quítalas e inténtalo de nuevo"
    return _respuesta(403, {"error": msg, "cantidad_ajenas": n})


# Light attributes read when ?resumen=1. Reading the full item and dropping
# CAMPOS_PESADOS afterwards still pays for deserializing every mask polygon
# (Decimal by Decimal), which took ~8 s for 49 items on a 128 MB Lambda.
CAMPOS_LIVIANOS = (
    "id_punto", "sk", "id_medicion", "tipo_registro", "timestamp", "nombre", "notas",
    "lote_id", "lote_nombre",
    "area_corroida_pct", "area_base", "area_corroida_pct_foto", "nivel_corrosion",
    "confianza_promedio", "modelo", "fuente",
    "bloque_id", "bloque_nombre", "empresa_id", "usuario_id", "tomado_por_id",
    "creado_por_nombre", "latitud_real", "longitud_real", "tiempo_procesamiento_ms",
    "tiempo_subida_s", "s3_key_imagen", "s3_key_thumbnail", "s3_key_resultado",
    "reanalizado_en", "analisis_anterior",
)


def _proyeccion_liviana(kwargs: dict) -> dict:
    """Adds a ProjectionExpression with only CAMPOS_LIVIANOS (keeps any
    ExpressionAttributeNames already present, e.g. from a FilterExpression)."""
    nombres = {f"#c{i}": c for i, c in enumerate(CAMPOS_LIVIANOS)}
    return {
        **kwargs,
        "ProjectionExpression": ", ".join(nombres),
        "ExpressionAttributeNames": {**kwargs.get("ExpressionAttributeNames", {}), **nombres},
    }


def _sin_campos_pesados(items: list) -> list:
    for item in items:
        for campo in CAMPOS_PESADOS:
            item.pop(campo, None)
    return items


# ── Días locales (UTC-5) ─────────────────────────────────────────────────────

def _fecha_estricta(valor) -> date | None:
    """YYYY-MM-DD válida o None."""
    if not isinstance(valor, str) or not _FECHA_RE.fullmatch(valor):
        return None
    try:
        return date.fromisoformat(valor)
    except ValueError:
        return None


def _inicio_dia_utc(dia: date) -> str:
    """Primer instante (UTC, ISO sin zona: ordena igual que los timestamps
    guardados) del día local `dia`."""
    return datetime(dia.year, dia.month, dia.day, tzinfo=TZ_LOCAL).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _fin_dia_utc(dia: date) -> str:
    """Último instante del día local `dia` (cota superior inclusiva para BETWEEN)."""
    siguiente = datetime(dia.year, dia.month, dia.day, tzinfo=TZ_LOCAL) + timedelta(days=1)
    return (siguiente.astimezone(timezone.utc) - timedelta(microseconds=1)).strftime("%Y-%m-%dT%H:%M:%S.%f") + "+00:00"


def _dia_local(timestamp) -> str | None:
    """'YYYY-MM-DD' del día local (UTC-5) de un timestamp ISO; None si no se
    puede interpretar. Sin zona horaria se asume UTC (así se guarda)."""
    if not isinstance(timestamp, str):
        return None
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ_LOCAL).date().isoformat()


def _limite(valor, defecto: int, maximo: int) -> int | None:
    """Entero acotado a 1..maximo; `defecto` si falta; None si no es numérico."""
    if valor is None or valor == "":
        return defecto
    try:
        return max(1, min(int(str(valor).strip()), maximo))
    except ValueError:
        return None


def _limite_pedido(qp: dict):
    """Valor crudo del límite: se acepta `limit` y `limite` en todos los listados
    (el primero que venga con valor; `limit` gana si vienen los dos)."""
    for nombre in ("limit", "limite"):
        valor = qp.get(nombre)
        if valor is not None and valor != "":
            return valor
    return None


ERROR_LIMITE = {"error": "El límite debe ser un número entero. Corrígelo e inténtalo de nuevo"}
ERROR_RANGO = {"error": "El rango de fechas no es válido. Elige fechas del calendario e inténtalo de nuevo"}


def _numero(valor) -> float | None:
    """float finito o None (los % se guardan como str en DynamoDB)."""
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return None
    return n if n == n and n not in (float("inf"), float("-inf")) else None


def _nivel(valor) -> int | None:
    n = _numero(valor)
    return int(n) if n is not None and n in (0, 1, 2, 3) else None


CAMPOS_RESUMEN = ("id_punto", "sk", "timestamp", "nivel_corrosion", "area_corroida_pct", "lote_id", "empresa_id")


def _resumen_diario(event: dict) -> dict:
    """GET /mediciones/resumen-diario?anio=YYYY[&id_punto=...]: agregados por día
    local para pintar la barra anual y las cajas de día. Solo lectura. Con
    id_punto consulta la clave primaria (rango de sk); sin él, el GSI
    tipo-timestamp-index. Misma regla de empresa que los demás listados."""
    qp = event.get("queryStringParameters") or {}
    try:
        anio = int(qp.get("anio", ""))
    except (TypeError, ValueError):
        anio = 0
    if not (ANIO_MIN <= anio <= 9999):
        return _respuesta(400, {"error": f"Elige un año válido (desde {ANIO_MIN}) e inténtalo de nuevo"})
    id_punto = (qp.get("id_punto") or "").strip() or None

    creador = _usuario_actual(event)
    es_super = bool(creador) and creador.get("rol") == "super_admin"

    inicio = _inicio_dia_utc(date(anio, 1, 1))
    fin = _fin_dia_utc(date(anio, 12, 31))
    nombres = {f"#c{i}": c for i, c in enumerate(CAMPOS_RESUMEN)}
    kwargs = {
        "ProjectionExpression": ", ".join(nombres),
        "ExpressionAttributeNames": nombres,
    }
    if id_punto:
        kwargs["KeyConditionExpression"] = Key("id_punto").eq(id_punto) & Key("sk").between(f"{SK_MEDICION_PREFIJO}{inicio}", f"{SK_MEDICION_PREFIJO}{fin}")
    else:
        kwargs["IndexName"] = "tipo-timestamp-index"
        kwargs["KeyConditionExpression"] = Key("tipo_registro").eq("medicion") & Key("timestamp").between(inicio, fin)
    if not es_super:
        # Ver datos de otra empresa es exclusivo de super_admin.
        kwargs["FilterExpression"] = Attr("empresa_id").eq(creador.get("empresa_id") if creador else None)
    elif (qp.get("empresa_id") or "").strip():
        # super_admin ve todo, pero puede acotar a una zona (?empresa_id=EMP-...).
        kwargs["FilterExpression"] = Attr("empresa_id").eq(qp["empresa_id"].strip())

    items, truncado = [], False
    for pagina in range(MAX_PAGINAS_RESUMEN):
        resp = tabla.query(**kwargs)
        items.extend(resp.get("Items", []))
        ultima = resp.get("LastEvaluatedKey")
        if not ultima:
            break
        if pagina == MAX_PAGINAS_RESUMEN - 1:
            truncado = True
        kwargs = {**kwargs, "ExclusiveStartKey": ultima}

    dias: dict = {}
    lotes_total, imagenes, en_lotes = set(), 0, 0
    for it in items:
        dia = _dia_local(it.get("timestamp"))
        if not dia or not dia.startswith(f"{anio:04d}-"):
            continue
        d = dias.setdefault(dia, {"fecha": dia, "total": 0, "por_nivel": [0, 0, 0, 0], "_lotes": {}, "peor_nivel": None, "max_pct": None,
                                                "_sum_pct": 0.0, "_n_pct": 0, "_sum_niv": 0, "_n_niv": 0})
        d["total"] += 1
        imagenes += 1
        nivel = _nivel(it.get("nivel_corrosion"))
        if nivel is not None:
            d["por_nivel"][nivel] += 1
            d["_sum_niv"] += nivel
            d["_n_niv"] += 1
            d["peor_nivel"] = nivel if d["peor_nivel"] is None else max(d["peor_nivel"], nivel)
        pct = _numero(it.get("area_corroida_pct"))
        if pct is not None:
            d["max_pct"] = pct if d["max_pct"] is None else max(d["max_pct"], pct)
            d["_sum_pct"] += pct
            d["_n_pct"] += 1
        lote = it.get("lote_id")
        if lote:
            d["_lotes"][lote] = d["_lotes"].get(lote, 0) + 1
            lotes_total.add(lote)
            en_lotes += 1

    salida = []
    for dia in sorted(dias):
        d = dias[dia]
        lotes = d.pop("_lotes")
        # Promedios del día (sobre las mediciones que tienen el dato): alimentan la
        # tendencia del panel. nivel_ponderado = promedio de niveles redondeado al más cercano.
        n_pct, n_niv = d.pop("_n_pct"), d.pop("_n_niv")
        suma_pct, suma_niv = d.pop("_sum_pct"), d.pop("_sum_niv")
        d["promedio_pct"] = suma_pct / n_pct if n_pct else None
        d["nivel_promedio"] = round(suma_niv / n_niv, 2) if n_niv else None
        d["nivel_ponderado"] = int(math.floor(suma_niv / n_niv + 0.5)) if n_niv else None
        d["lotes"] = {"count": len(lotes), "imagenes": sum(lotes.values())}
        salida.append(d)
    return _respuesta(200, {
        "anio": anio,
        "id_punto": id_punto,
        "dias": salida,
        "totales": {"imagenes": imagenes, "lotes": len(lotes_total), "imagenes_en_lotes": en_lotes},
        "truncado": truncado,
    })


# ── Indicadores globales (GET /indicadores) ──────────────────────────────────

VENTANA_DIAS = 30
LISTA_SUBIERON_MAX = 10
PAGINA_ESTADO = 100       # ítems por página al buscar los dos últimos días de un punto
MAX_PAGINAS_ESTADO = 10   # tope de páginas por punto (acota el costo de un punto enorme)


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _nivel_ponderado(suma_niveles: int, n: int) -> int | None:
    """Media de niveles redondeada half-up (igual que resumen-diario)."""
    return int(math.floor(suma_niveles / n + 0.5)) if n else None


def _puntos_en_alcance(creador: dict, empresa_filtro: str | None) -> list:
    """Puntos (bloques) activos del alcance del usuario: super_admin todos o los
    de `empresa_filtro`; el resto, los de su empresa. Lee la tabla `bloques`
    con proyección (mismo origen que GET /bloques)."""
    nombres = {"#i": "id_bloque", "#n": "nombre", "#a": "activo", "#e": "empresa_id"}
    kwargs: dict = {"ProjectionExpression": "#i, #n, #a, #e", "ExpressionAttributeNames": nombres}
    if creador.get("rol") == "super_admin":
        empresa = empresa_filtro
    else:
        empresa = creador.get("empresa_id")
        if not empresa:
            return []   # sin empresa: no ve ningún punto
    if empresa:
        operacion = tabla_bloques.query
        kwargs["IndexName"] = "empresa_id-index"
        kwargs["KeyConditionExpression"] = Key("empresa_id").eq(empresa)
    else:
        operacion = tabla_bloques.scan
    items: list = []
    for _ in range(MAX_PAGINAS_RESUMEN):
        resp = operacion(**kwargs)
        items.extend(resp.get("Items", []))
        ultima = resp.get("LastEvaluatedKey")
        if not ultima:
            break
        kwargs = {**kwargs, "ExclusiveStartKey": ultima}
    return [b for b in items if b.get("activo") is not False and b.get("id_bloque")]


def _estado_actual(id_punto: str, truncado: list | None = None) -> dict | None:
    """Estado del punto en su último día local medido y en el anterior.

    Una Query por punto (ScanIndexForward=False, proyección mínima) que pagina
    solo hasta ver 3 días locales distintos (el tercero confirma que el segundo
    está completo) o agotar la partición, con tope MAX_PAGINAS_ESTADO. Costo:
    O(P) consultas secuenciales, cada una de pocas páginas; P < 200.
    Devuelve None si el punto no tiene mediciones. Si se agota el tope de
    páginas con la partición sin terminar, agrega el id a `truncado` (el
    estado puede ser incompleto)."""
    nombres = {"#t": "timestamp", "#n": "nivel_corrosion", "#p": "area_corroida_pct"}
    kwargs = {
        "KeyConditionExpression": Key("id_punto").eq(id_punto) & Key("sk").begins_with(SK_MEDICION_PREFIJO),
        "ScanIndexForward": False,
        "Limit": PAGINA_ESTADO,
        "ProjectionExpression": "#t, #n, #p",
        "ExpressionAttributeNames": nombres,
    }
    dias: dict = {}   # dia -> [suma_pct, n_pct, suma_niv, n_niv]; dict conserva el orden (recientes primero)
    for _ in range(MAX_PAGINAS_ESTADO):
        resp = tabla.query(**kwargs)
        for it in resp.get("Items", []):
            dia = _dia_local(it.get("timestamp"))
            if not dia:
                continue
            if dia not in dias and len(dias) >= 3:
                continue
            acc = dias.setdefault(dia, [0.0, 0, 0, 0])
            pct = _numero(it.get("area_corroida_pct"))
            if pct is not None:
                acc[0] += pct
                acc[1] += 1
            nivel = _nivel(it.get("nivel_corrosion"))
            if nivel is not None:
                acc[2] += nivel
                acc[3] += 1
        ultima = resp.get("LastEvaluatedKey")
        if not ultima or len(dias) >= 3:
            break
        kwargs = {**kwargs, "ExclusiveStartKey": ultima}
    else:
        logger.warning("indicadores: punto %s truncado tras %d páginas; estado parcial", id_punto, MAX_PAGINAS_ESTADO)
        if truncado is not None:
            truncado.append(id_punto)
    if not dias:
        return None
    # Los ítems llegan por sk (≈ timestamp) desc, pero se ordena por día por si el sk difiere.
    ordenados = sorted(dias, reverse=True)

    def resumen(dia):
        sp, npct, sn, nn = dias[dia]
        return {"fecha": dia, "promedio_pct": sp / npct if npct else None, "nivel": _nivel_ponderado(sn, nn)}

    actual = resumen(ordenados[0])
    actual["anterior_nivel"] = resumen(ordenados[1])["nivel"] if len(ordenados) > 1 else None
    return actual


def _contar_mediciones(desde_ts: str, empresa: str | None, filtrar: bool, truncado: list | None = None) -> int:
    """Cuenta mediciones desde `desde_ts`. Si se agota MAX_PAGINAS_RESUMEN con
    más páginas por leer, deja un elemento en `truncado` (el conteo es parcial)."""
    kwargs = {
        "IndexName": "tipo-timestamp-index",
        "KeyConditionExpression": Key("tipo_registro").eq("medicion") & Key("timestamp").gte(desde_ts),
        "Select": "COUNT",
    }
    if filtrar:
        kwargs["FilterExpression"] = Attr("empresa_id").eq(empresa)
    total = 0
    for _ in range(MAX_PAGINAS_RESUMEN):
        resp = tabla.query(**kwargs)
        total += resp.get("Count", 0)
        ultima = resp.get("LastEvaluatedKey")
        if not ultima:
            break
        kwargs = {**kwargs, "ExclusiveStartKey": ultima}
    else:
        logger.warning("indicadores: conteo de mediciones truncado tras %d páginas", MAX_PAGINAS_RESUMEN)
        if truncado is not None:
            truncado.append(True)
    return total


def _indicadores(event: dict) -> dict:
    """GET /indicadores[?empresa_id=]: estado actual de cada punto activo del
    alcance (super_admin: todo o `empresa_id`; el resto: su empresa), calculado
    en el servidor. Solo lectura."""
    creador = _usuario_actual(event)
    if not creador:
        return _respuesta(403, {"error": "No tienes permiso para ver los indicadores. Pide ayuda a un administrador"})
    es_super = creador.get("rol") == "super_admin"
    qp = event.get("queryStringParameters") or {}
    empresa_filtro = (qp.get("empresa_id") or "").strip() or None if es_super else None

    ahora = _ahora()
    hoy = ahora.astimezone(TZ_LOCAL).date()
    inicio = hoy - timedelta(days=VENTANA_DIAS - 1)   # ventana: hoy y los 29 días locales anteriores
    inicio_iso = inicio.isoformat()

    puntos = sorted(_puntos_en_alcance(creador, empresa_filtro), key=lambda b: (str(b.get("nombre") or ""), b["id_bloque"]))
    por_nivel = [0, 0, 0, 0]
    sin_mediciones = 0
    criticos, subieron, con_30d, atrasados = [], [], 0, []
    puntos_truncados: list = []
    for b in puntos:
        nombre = b.get("nombre") or b["id_bloque"]
        est = _estado_actual(b["id_bloque"], puntos_truncados)
        if est is None:
            sin_mediciones += 1
            atrasados.append((0, None, nombre, b["id_bloque"]))
            continue
        fecha = est["fecha"]
        dentro = fecha >= inicio_iso
        if est["nivel"] is not None:
            por_nivel[est["nivel"]] += 1
        else:
            sin_mediciones += 1   # medido, pero sin nivel válido: no cuenta en ningún nivel
        if dentro:
            con_30d += 1
        if est["promedio_pct"] is not None:
            criticos.append((est["promedio_pct"], est["nivel"] if est["nivel"] is not None else -1, fecha, b["id_bloque"], nombre))
        if dentro and est["nivel"] is not None and est["anterior_nivel"] is not None and est["nivel"] > est["anterior_nivel"]:
            subieron.append({"id_punto": b["id_bloque"], "nombre": nombre, "de": est["anterior_nivel"], "a": est["nivel"], "fecha": fecha})
        atrasados.append((1, fecha, nombre, b["id_bloque"]))

    mas_critico = None
    if criticos:
        pct, nivel, fecha, idp, nombre = max(criticos, key=lambda c: (c[0], c[1], c[2]))
        mas_critico = {"id_punto": idp, "nombre": nombre, "promedio_pct": pct, "nivel": nivel if nivel >= 0 else None, "fecha": fecha}

    mas_atrasado = None
    if atrasados:
        # Sin mediciones primero; luego la medición más antigua.
        _, fecha, nombre, idp = min(atrasados, key=lambda a: (a[0], a[1] or "", a[2]))
        dias = (hoy - date.fromisoformat(fecha)).days if fecha else None
        mas_atrasado = {"id_punto": idp, "nombre": nombre, "dias": dias, "fecha": fecha}

    subieron.sort(key=lambda s: (-(s["a"] - s["de"]), -s["a"], s["nombre"]))
    empresa_conteo = empresa_filtro if es_super else creador.get("empresa_id")
    conteo_truncado: list = []
    if not es_super and not empresa_conteo:
        mediciones_30d = 0
    else:
        mediciones_30d = _contar_mediciones(_inicio_dia_utc(inicio), empresa_conteo, bool(empresa_conteo), conteo_truncado)

    return _respuesta(200, {
        "total_puntos": len(puntos),
        "por_nivel": por_nivel,
        "sin_mediciones": sin_mediciones,
        "mas_critico": mas_critico,
        "subieron_nivel": {"cantidad": len(subieron), "puntos": subieron[:LISTA_SUBIERON_MAX]},
        "cobertura": {"con_medicion_30d": con_30d, "total_puntos": len(puntos), "mas_atrasado": mas_atrasado},
        "mediciones_30d": mediciones_30d,
        "mediciones_30d_truncado": bool(conteo_truncado),
        "puntos_truncados": len(puntos_truncados),
        "parcial": bool(conteo_truncado or puntos_truncados),
        "generado_en": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"),
    })


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
    if _ajenas_para_tecnico(creador, _sub(event), [item]):
        return _rechazo_ajenas(1, "eliminar")

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
    ajenas = _ajenas_para_tecnico(creador, _sub(event), encontrados)
    if ajenas:
        return _rechazo_ajenas(len(ajenas), "eliminar")
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
    ajenas = _ajenas_para_tecnico(creador, _sub(event), encontrados)
    if ajenas:
        return _rechazo_ajenas(len(ajenas), "mover")
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


def _lote_renombrar(event: dict) -> dict:
    """POST /mediciones/lote/renombrar: cambia `lote_nombre` en cada medición
    pedida (el lote no es una entidad: el nombre vive en cada ítem). Misma
    entrada y resolución que eliminar/mover; el técnico solo si TODAS las
    mediciones son suyas. El nombre no puede quedar vacío."""
    creador = _usuario_actual(event)
    if not _puede_gestionar(creador):
        return _respuesta(403, {"error": "No tienes permiso para renombrar lotes. Pide ayuda a un administrador"})
    try:
        pedidos, body = _leer_lote(event)
        valor = body.get("nombre")
        if not isinstance(valor, str):
            raise ValueError("Escribe el nombre nuevo del lote e inténtalo de nuevo")
        nombre = _nombre_foto(valor)   # mismas reglas que `lote_nombre` al subir: sin control, espacios colapsados, 80
        if not nombre:
            raise ValueError("El nombre del lote no puede quedar vacío")
    except ValueError as e:
        return _respuesta(400, {"error": str(e)})

    encontrados, errores = _resolver_lote(creador, pedidos)
    ajenas = _ajenas_para_tecnico(creador, _sub(event), encontrados)
    if ajenas:
        return _rechazo_ajenas(len(ajenas), "renombrar")
    ok = []
    for item in encontrados:
        try:
            tabla.update_item(
                Key={"id_punto": item["id_punto"], "sk": item["sk"]},
                UpdateExpression="SET #ln = :n",
                ExpressionAttributeNames={"#ln": "lote_nombre"},
                ExpressionAttributeValues={":n": nombre},
                ConditionExpression=Attr("id_medicion").eq(item["id_medicion"]),
            )
            ok.append(item["id_medicion"])
        except Exception as e:
            logger.exception("No se pudo renombrar el lote de %s: %s", item.get("id_medicion"), e)
            errores.append({"id_medicion": item["id_medicion"], "motivo": "No se pudo renombrar. Inténtalo de nuevo"})
    return _respuesta(200, {"ok": ok, "error": errores, "nombre": nombre, "actualizadas": len(ok)})


def _renombrar_medicion(event: dict, id_punto: str) -> dict:
    """Misma identificación y autorización por empresa que `_eliminar_medicion`:
    admin y super_admin renombran cualquier foto de su alcance; el técnico solo
    las que tomó él (regla de eliminar y mover); el cliente no renombra. La
    fuente de verdad del nombre es DynamoDB; el JSON de resultado en S3 es una
    foto del análisis y no se reescribe (la web lee `nombre` del ítem)."""
    creador = _usuario_actual(event)
    if not _puede_gestionar(creador):
        return _respuesta(403, {"error": "No tienes permiso para renombrar mediciones. Pide ayuda a un administrador"})

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
    if _ajenas_para_tecnico(creador, _sub(event), [item]):
        return _rechazo_ajenas(1, "renombrar")

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
        rechazo = _rechazo_cuenta_inactiva(_usuario_actual(event))
        if rechazo:
            return rechazo

        # ── POST /mediciones/lote/eliminar | mover | renombrar ───────────────
        if http_method == "POST" and resource == "/mediciones/lote/eliminar":
            return _lote_eliminar(event)
        if http_method == "POST" and resource == "/mediciones/lote/mover":
            return _lote_mover(event)
        if http_method == "POST" and resource == "/mediciones/lote/renombrar":
            return _lote_renombrar(event)

        # ── DELETE /mediciones/{id_punto} ────────────────────────────────────
        if http_method == "DELETE" and id_punto:
            return _eliminar_medicion(event, id_punto)

        # ── PATCH /mediciones/{id_punto} ─────────────────────────────────────
        if http_method == "PATCH" and id_punto:
            return _renombrar_medicion(event, id_punto)

        # ── GET /indicadores ─────────────────────────────────────────────────
        if http_method == "GET" and resource == "/indicadores":
            return _indicadores(event)

        # ── GET /mediciones/resumen-diario ───────────────────────────────────
        if resource == "/mediciones/resumen-diario":
            return _resumen_diario(event)

        # ── GET /mediciones/recientes ────────────────────────────────────────
        if resource == "/mediciones/recientes":
            qp = event.get("queryStringParameters") or {}
            desde, hasta = qp.get("desde"), qp.get("hasta")
            con_rango = bool(desde or hasta)
            # Con rango el límite por defecto es el máximo (se avisa con `truncado`).
            limite = _limite(_limite_pedido(qp), LIMITE_RECIENTES_MAX if con_rango else 20, LIMITE_RECIENTES_MAX)
            if limite is None:
                return _respuesta(400, ERROR_LIMITE)
            condicion = Key("tipo_registro").eq("medicion")
            if con_rango:
                dia_desde = _fecha_estricta(desde) if desde else None
                dia_hasta = _fecha_estricta(hasta) if hasta else None
                if (desde and not dia_desde) or (hasta and not dia_hasta) or (dia_desde and dia_hasta and dia_desde > dia_hasta):
                    return _respuesta(400, ERROR_RANGO)
                # DynamoDB rejects empty strings as key values, so an open end
                # uses a one-sided condition instead of BETWEEN with "".
                if dia_desde and dia_hasta:
                    rango_ts = Key("timestamp").between(_inicio_dia_utc(dia_desde), _fin_dia_utc(dia_hasta))
                elif dia_desde:
                    rango_ts = Key("timestamp").gte(_inicio_dia_utc(dia_desde))
                else:
                    rango_ts = Key("timestamp").lte(_fin_dia_utc(dia_hasta))
                condicion = condicion & rango_ts
            creador = _usuario_actual(event)

            # GSI tipo-timestamp-index: PK="medicion" constante, SK=timestamp DESC
            kwargs = dict(
                IndexName="tipo-timestamp-index",
                KeyConditionExpression=condicion,
                ScanIndexForward=False,   # más reciente primero
                Limit=limite + 1 if con_rango else limite,
            )
            if not creador or creador.get("rol") != "super_admin":
                # Ver datos de otra empresa es exclusivo de super_admin.
                empresa_id = creador.get("empresa_id") if creador else None
                kwargs["FilterExpression"] = Attr("empresa_id").eq(empresa_id)
            if qp.get("resumen") == "1":
                kwargs = _proyeccion_liviana(kwargs)
            # Limit cuenta ítems antes del filtro: se pagina hasta juntar `limite`
            # (con rango, uno más para saber si hay más que el límite).
            items = _consultar(kwargs, limite + 1 if con_rango else limite)
            truncado = con_rango and len(items) > limite
            items = items[:limite]
            if qp.get("resumen") == "1":
                _sin_campos_pesados(items)
            items = _agregar_url_imagen(items)
            cuerpo = {
                "total": len(items),
                "mediciones": items,
            }
            if con_rango:
                cuerpo["truncado"] = truncado
            return _respuesta(200, cuerpo)

        # ── GET /mediciones/{id_punto} ───────────────────────────────────────
        elif id_punto:
            qp = event.get("queryStringParameters") or {}
            desde, hasta = qp.get("desde"), qp.get("hasta")
            con_rango = bool(desde or hasta)
            # Con rango el límite por defecto es el máximo y se avisa si hay más.
            limite = _limite(_limite_pedido(qp), LIMITE_PUNTO_MAX if con_rango else 50, LIMITE_PUNTO_MAX)
            if limite is None:
                return _respuesta(400, ERROR_LIMITE)
            creador = _usuario_actual(event)
            # Defensa en profundidad: además del filtro por empresa de cada
            # ítem, un punto de otra empresa se trata como inexistente.
            if not creador or creador.get("rol") != "super_admin":
                bloque = tabla_bloques.get_item(Key={"id_bloque": id_punto}).get("Item")
                if bloque and bloque.get("empresa_id") != (creador or {}).get("empresa_id"):
                    return _respuesta(404, {"error": "No se encontró el punto. Actualiza la lista e inténtalo de nuevo"})
            # ?id_medicion=X: la página de detalle pide UNA medición (con todos
            # sus campos) aunque sea antigua. Se filtra en DynamoDB y se pagina
            # hasta hallarla; el Limit de cada página sigue siendo el máximo.
            id_medicion = qp.get("id_medicion")
            # ?desde / ?hasta (día local, UTC-5): una clave de rango sobre sk.
            if con_rango:
                dia_desde = _fecha_estricta(desde) if desde else None
                dia_hasta = _fecha_estricta(hasta) if hasta else None
                if (desde and not dia_desde) or (hasta and not dia_hasta) or (dia_desde and dia_hasta and dia_desde > dia_hasta):
                    return _respuesta(400, ERROR_RANGO)
            if id_medicion:
                limite_paginas, limite = LIMITE_PUNTO_MAX, 1
            else:
                limite_paginas = limite + 1 if con_rango else limite

            condicion_sk = Key("sk").begins_with(SK_MEDICION_PREFIJO)
            if con_rango:
                inferior = f"{SK_MEDICION_PREFIJO}{_inicio_dia_utc(dia_desde)}" if dia_desde else SK_MEDICION_PREFIJO
                superior = f"{SK_MEDICION_PREFIJO}{_fin_dia_utc(dia_hasta)}" if dia_hasta else f"{SK_MEDICION_PREFIJO}~"
                condicion_sk = Key("sk").between(inferior, superior)
            kwargs = dict(
                KeyConditionExpression=Key("id_punto").eq(id_punto) & condicion_sk,
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
            if qp.get("resumen") == "1":
                kwargs = _proyeccion_liviana(kwargs)
            # Con rango se pide uno de más para saber si hay más que el límite.
            items = _consultar(kwargs, limite + 1 if con_rango and not id_medicion else limite)
            truncado = con_rango and len(items) > limite
            items = items[:limite]
            if qp.get("resumen") == "1":
                _sin_campos_pesados(items)
            items = _agregar_url_imagen(items)
            cuerpo = {
                "id_punto": id_punto,
                "total": len(items),
                "mediciones": items,
            }
            if con_rango:
                cuerpo["truncado"] = truncado
            return _respuesta(200, cuerpo)

        return _respuesta(400, {"error": "Esta acción no está disponible. Recarga la página e inténtalo de nuevo"})

    except Exception as e:
        logger.exception("Error en api_mediciones: %s", e)
        return _respuesta(500, {"error": "Ocurrió un error inesperado. Inténtalo de nuevo; si persiste, contacta a un administrador"})
