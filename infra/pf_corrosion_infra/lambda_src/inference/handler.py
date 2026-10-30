"""
pf-corrosion - Lambda de inferencia (U-Net final ONNX; YOLOv8n-seg ONNX solo
para la medicion comparativa de latencia).

El modelo se elige por configuracion: MODEL_TYPE ("yolo" | "unet") y MODEL_KEY
(clave S3 del ONNX en el bucket de modelos, MODEL_BUCKET). Ningun modelo va
empaquetado en la Lambda: model_store.py lo baja a /tmp una vez por arranque en
frio (ver yolo_model.py, unet_model.py y docs/runbook_unet.md). Ambos devuelven
el mismo contrato de respuesta y los niveles ISO 10289 de _calcular_nivel. El
area es la de la foto completa, salvo en la U-Net con el separador de placa
habilitado (PLATE_MODEL_KEY, ver placa_model.py): entonces es el % sobre la
placa, con la foto completa como respaldo (campo `area_base`).

Recibe una imagen -- en base64 (`imagen_base64`, app movil) o ya subida a S3
(`imagen_key`, web, ver abajo) -- + el `bloque_id` de un bloque YA EXISTENTE
(elegido por el usuario de una lista), corre inferencia ONNX, guarda imagen
+ resultado en S3 y registra la medición en DynamoDB. Ya no se crea (ni se
resuelve por clave lógica) ningún punto/bloque al subir una foto -- el
bloque tiene que existir de antes (ver POST/PUT /bloques en
api_puntos/handler.py).

Almacenamiento: tabla fusionada puntos+mediciones (ver CorriaStorageStack).
Cada medición se escribe con `id_punto` = el `id_bloque` validado (mismo
atributo de siempre, ahora con forma `BLQ-...` en vez de `PT-...` -- la
tabla no le da ningún significado especial a ese valor, es solo un string)
y `sk = "MED#{timestamp}"`. Ya no se escribe ningún ítem con `sk="METADATA"`
desde esta Lambda -- esa fila vive en la tabla `bloques`, no acá.

Seguridad: esta función tiene permisos sobre la tabla fusionada y el bucket
S3 de imágenes, más un grant de SOLO LECTURA sobre la tabla de usuarios
(RBAC multi-empresa: necesita resolver el rol/empresa_id de quien sube la
medición) y sobre la tabla `bloques` (validar el bloque elegido) — sigue sin
tener ningún permiso de Cognito ni de escritura sobre `usuarios` (a
diferencia del sistema original, que le otorgaba permisos de más).

RBAC multi-empresa: `empresa_id` de cada medición se resuelve SIEMPRE del
bloque validado (nunca de un campo del body). El rol `cliente` no puede
subir mediciones (403) — solo super_admin/admin/tecnico. El bloque elegido
debe pertenecer a la empresa de quien sube (o el que sube es super_admin) y
estar activo (ver _validar_bloque).

Fotos grandes: Lambda/API Gateway rechazan cuerpos de ~6 MB (una foto de
celular en base64 ya los supera). La web pide a POST /medicion/upload-url un
POST prefirmado de S3, sube la foto directo al bucket bajo
`uploads/{sub}/{uuid}.{ext}` (hasta 50 MB, lo impone S3 con la politica) y luego
llama POST /medicion con `imagen_key`. La clave solo se acepta si cuelga del
prefijo del propio usuario. El objeto temporal se borra al terminar (la copia
definitiva es el JPEG re-codificado de abajo); lo que quede huerfano lo expira
la regla de ciclo de vida del bucket (storage_stack.py).

Layout S3: `empresas/{empresa_id}/{bloque_id}/{id_medicion}[_thumb].jpg|.json`.
Reemplaza el viejo `raw/{id_punto}/...` + `resultados/{id_punto}/...`; las
keys anteriores NO se migran — cada medición guarda las suyas en DynamoDB y
ningún consumidor deriva una key de otra por string.
"""
import base64
import io
import json
import logging
import math
import os
import re
import time
import uuid
import urllib.request
import urllib.error
from decimal import Decimal
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image, ImageOps

import model_store
import placa_model
import unet_model
import yolo_model

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BUCKET_NAME = os.environ["BUCKET_NAME"]
TABLA_MEDICIONES = os.environ["TABLA_MEDICIONES"]
TABLA_USUARIOS = os.environ["TABLA_USUARIOS"]
TABLA_BLOQUES = os.environ["TABLA_BLOQUES"]
REGION = os.environ["REGION"]

_primera_inferencia = True  # True hasta que este contenedor atiende su 1a foto

# SigV4 explicito: el POST prefirmado (generate_presigned_post) con las
# credenciales temporales del rol lo necesita para quedar firmado en us-east-1.
s3 = boto3.client("s3", region_name=REGION, config=Config(signature_version="s3v4"))
dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla_mediciones = dynamodb.Table(TABLA_MEDICIONES)
tabla_usuarios = dynamodb.Table(TABLA_USUARIOS)
tabla_bloques = dynamodb.Table(TABLA_BLOQUES)


# Pillow avisa por encima de MAX_IMAGE_PIXELS y lanza DecompressionBombError por
# encima del doble (por defecto ~89 MP / ~178 MP). Una foto de celular de 200 MP
# es legitima: subimos el limite (el doble = 500 MP sigue protegiendo de bombas).
Image.MAX_IMAGE_PIXELS = 250_000_000
# Por encima de este tamano un JPEG se decodifica a media resolucion
# (Image.draft): a 200 MP serian ~600 MB por copia y el handler llega a tener
# 3-4 copias a la vez mas el modelo (~1,2 GB) en 3008 MB. Las fotos normales
# (<= 100 MP) NO se tocan: la entrada de los modelos es identica al evaluador.
MAX_PIXELES_SIN_REDUCIR = 100_000_000

MAX_BYTES_FOTO = 50 * 1024 * 1024        # tope de la foto subida (50 MB)
PREFIJO_SUBIDAS = "uploads"
EXPIRA_SUBIDA_S = 600                     # vigencia del POST prefirmado
EXTENSIONES = {                           # content-type permitido -> extension
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/tiff": "tif",
}
_CLAVE_SUBIDA = re.compile(r"^[A-Za-z0-9._-]+$")


# ── Helpers de tipo ─────────────────────────────────────────────────────────

def floats_to_decimal(obj):
    if isinstance(obj, list):
        return [floats_to_decimal(x) for x in obj]
    elif isinstance(obj, dict):
        return {k: floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    return obj


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def _respuesta(codigo: int, cuerpo: dict) -> dict:
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


# ── Validación de bloque ─────────────────────────────────────────────────────

def _validar_bloque(bloque_id, empresa_id_creador: str | None, es_super_admin: bool = False) -> dict:
    """Valida el `bloque_id` (requerido) de POST /medicion: debe ser string,
    existir (404), pertenecer a la empresa de quien sube -- salvo
    super_admin, que puede subir a nombre de cualquier empresa -- (400) y
    estar activo (400). Lanza LookupError (→404) si no existe, ValueError
    (→400) en el resto -- mismo mapeo de excepciones que usa el resto del
    handler. Devuelve el ítem del bloque (lo necesita el caller para
    denormalizar empresa_id/bloque_nombre en la medición y resolver
    coordenadas para el clima)."""
    if not isinstance(bloque_id, str) or not bloque_id.strip():
        raise ValueError("Selecciona el punto donde se guardará la medición")
    bloque = tabla_bloques.get_item(Key={"id_bloque": bloque_id}).get("Item")
    if not bloque:
        raise LookupError("No se encontró el punto seleccionado. Actualiza la lista e inténtalo de nuevo")
    if not es_super_admin and bloque.get("empresa_id") != empresa_id_creador:
        raise ValueError("El punto pertenece a otra zona. Elige un punto de tu zona")
    if bloque.get("activo") is False:
        raise ValueError("El punto está inactivo. Actívalo antes de subir mediciones")
    return bloque


# ── Inferencia ONNX ──────────────────────────────────────────────────────────

IMGSZ = 1024  # lado de entrada de AMBOS ONNX (se valida al cargar la sesion)


def _abrir_imagen(datos: bytes) -> Image.Image:
    """Decodifica la foto y aplica la orientacion EXIF ANTES de cualquier
    otra cosa: modelo, JPEG guardado y miniatura ven la foto derecha."""
    img = Image.open(io.BytesIO(datos))
    ancho, alto = img.size
    if img.format == "JPEG" and ancho * alto > MAX_PIXELES_SIN_REDUCIR:
        # Solo fotos gigantes: el decodificador JPEG baja 1/2, 1/4 o 1/8 sin
        # materializar la imagen completa (antes de cargarla).
        img.draft("RGB", (ancho // 2, alto // 2))
    return ImageOps.exif_transpose(img).convert("RGB")


def _calcular_nivel(area_pct: float) -> int:
    """Niveles ISO 10289 sobre el `area_corroida_pct` (de la placa o, de respaldo,
    de la foto completa): 0 = sin corrosion (< 0.05 %), 1 = leve (< 10 %),
    2 = moderada (< 25 %), 3 = severa (>= 25 %)."""
    if area_pct < 0.05:
        return 0
    elif area_pct < 10:
        return 1
    elif area_pct < 25:
        return 2
    return 3


def _separar_placa(imagen: Image.Image) -> dict:
    """Corre el separador de placa. NUNCA lanza: cualquier fallo (descarga,
    sesion, onnx, postproceso) deja `mascara` en None y la solicitud sigue con
    el % sobre la foto completa. Devuelve:

      mascara    bool (h, w) de la placa, o None si no se usa (fallo o placa
                 < MIN_PLACA_PCT_FOTO de la foto: mascara claramente mala)
      pct_foto   % de la foto que cubre la placa, o None si fallo
      contorno   {"puntos": [{x,y}]} normalizado, o None
      error      True si el separador fallo
      descarga_ms, carga_ms, onnx_ms, total_ms
    """
    t0 = time.perf_counter()
    info = {"mascara": None, "pct_foto": None, "contorno": None, "error": False,
            "descarga_ms": 0, "carga_ms": 0, "onnx_ms": 0}
    try:
        sesion, t_placa = model_store.obtener_sesion_placa(s3, placa_model.SIZE)
        info.update(t_placa)
        mascara, info["onnx_ms"] = placa_model.separar(imagen, sesion)
        info["pct_foto"] = round(float(mascara.sum()) / mascara.size * 100.0, 2)
        if info["pct_foto"] >= placa_model.MIN_PLACA_PCT_FOTO:
            info["mascara"] = mascara
            try:
                info["contorno"] = placa_model.contorno(mascara)
            except Exception as exc:  # el contorno es decorativo: no invalida la placa
                logger.warning("No se pudo calcular el contorno de la placa: %s", exc)
        else:
            logger.warning("Placa descartada: cubre %.2f %% de la foto (< %.1f %%); se usa la foto completa",
                           info["pct_foto"], placa_model.MIN_PLACA_PCT_FOTO)
    except Exception as exc:
        info["error"] = True
        logger.warning("Separador de placa fallo, se usa la foto completa: %s", exc, exc_info=True)
    info["total_ms"] = round((time.perf_counter() - t0) * 1000)
    return info


def _inferir(imagen: Image.Image, tiempos: dict | None = None) -> dict:
    """Despacha al modelo elegido por MODEL_TYPE y devuelve SIEMPRE el mismo
    contrato:

      nivel_corrosion, area_corroida_pct, confianza_promedio,
      detecciones [{x,y,w,h,confianza,clase}], mascaras [{puntos:[{x,y}]}],
      modelo (aditivo: "yolo:<archivo>" o "unet:<archivo>")

    Solo con la U-Net y el separador de placa habilitado (PLATE_MODEL_KEY o
    PLATE_MODEL_LOCAL_PATH) se agregan, ADITIVOS, los campos de la base:

      area_base ("placa" | "foto"), area_corroida_pct_foto (el % de siempre,
      sobre la foto completa), placa_pct_foto (% de la foto que cubre la placa
      o None), contorno_placa ({puntos:[{x,y}]} normalizado o None),
      modelo_placa ("placa:<archivo>" o None si el separador fallo)

    `area_corroida_pct` (y por tanto `nivel_corrosion`) es el % sobre la placa
    si hay una placa valida; si el separador falla o la placa cubre menos del
    3 % de la foto, es el % sobre la foto completa (`area_base` = "foto").
    YOLO y la U-Net sin separador: contrato y valores de siempre.

    Llena `tiempos` (si se pasa) con los campos de TIEMPOS_INFERENCIA que se
    conocen aqui; lambda_handler agrega el total y escribe la linea.
    """
    global _primera_inferencia
    tipo = model_store.tipo_modelo()
    frio = _primera_inferencia
    t0 = time.perf_counter()

    sesion, t_modelo = model_store.obtener_sesion(s3, IMGSZ)
    placa = _separar_placa(imagen) if tipo == "unet" and model_store.placa_habilitada() else None
    t1 = time.perf_counter()  # la inferencia del modelo principal no incluye el separador
    if tipo == "unet":
        if placa is not None and placa["mascara"] is not None:
            resultado, onnx_ms = unet_model.inferir(imagen, sesion, placa["mascara"])
        else:
            resultado, onnx_ms = unet_model.inferir(imagen, sesion)
    else:
        resultado, onnx_ms = yolo_model.inferir(imagen, sesion)
    if placa is not None:
        usa_placa = placa["mascara"] is not None
        if not usa_placa:
            resultado["area_corroida_pct_foto"] = resultado["area_corroida_pct"]
        resultado.update({
            "area_base": "placa" if usa_placa else "foto",
            "placa_pct_foto": placa["pct_foto"],
            "contorno_placa": placa["contorno"] if usa_placa else None,
            "modelo_placa": None if placa["error"] else model_store.etiqueta_placa(),
        })
    resultado["nivel_corrosion"] = _calcular_nivel(resultado["area_corroida_pct"])
    resultado["modelo"] = model_store.etiqueta_modelo(tipo)

    _primera_inferencia = False
    if tiempos is not None:
        tiempos.update({
            "modelo": resultado["modelo"],
            "arranque_en_frio": frio,
            "descarga_ms": t_modelo["descarga_ms"],
            "carga_ms": t_modelo["carga_ms"],
            "inferencia_ms": round((time.perf_counter() - t1) * 1000),
            "onnx_ms": onnx_ms,
            "modelo_total_ms": round((time.perf_counter() - t0) * 1000),
            "foto_px": list(imagen.size),
        })
        if placa is not None:
            tiempos.update({
                "area_base": resultado["area_base"],
                "placa_descarga_ms": placa["descarga_ms"],
                "placa_carga_ms": placa["carga_ms"],
                "placa_onnx_ms": placa["onnx_ms"],
                "placa_total_ms": placa["total_ms"],
            })
    return resultado


# ── Datos meteorológicos ─────────────────────────────────────────────────────

def _obtener_clima(lat: float, lng: float, fecha: str | None = None) -> dict | None:
    try:
        hoy = datetime.now(timezone.utc).date().isoformat()
        if fecha and fecha < hoy:
            # Dato histórico vía archive API (hourly → valor a las 12:00)
            url = (
                f"https://archive-api.open-meteo.com/v1/archive"
                f"?latitude={lat}&longitude={lng}"
                f"&start_date={fecha}&end_date={fecha}"
                f"&hourly=temperature_2m,relative_humidity_2m,precipitation,windspeed_10m,winddirection_10m"
                f"&timezone=auto"
            )
            with urllib.request.urlopen(url, timeout=8) as resp:
                data = json.loads(resp.read())
            h = data.get("hourly", {})
            idx = 12  # valor del mediodía
            return {
                "temperatura_c":    h.get("temperature_2m", [None] * 24)[idx],
                "humedad_pct":      h.get("relative_humidity_2m", [None] * 24)[idx],
                "precipitacion_mm": h.get("precipitation", [None] * 24)[idx],
                "viento_kmh":       h.get("windspeed_10m", [None] * 24)[idx],
                "viento_direccion": h.get("winddirection_10m", [None] * 24)[idx],
            }
        else:
            url = (
                f"https://api.open-meteo.com/v1/forecast"
                f"?latitude={lat}&longitude={lng}"
                f"&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m"
                f"&timezone=auto"
            )
            with urllib.request.urlopen(url, timeout=5) as resp:
                data = json.loads(resp.read())
            current = data.get("current", {})
            return {
                "temperatura_c":    current.get("temperature_2m"),
                "humedad_pct":      current.get("relative_humidity_2m"),
                "precipitacion_mm": current.get("precipitation"),
                "viento_kmh":       current.get("wind_speed_10m"),
                "viento_direccion": current.get("wind_direction_10m"),
            }
    except Exception as exc:
        logger.warning("No se pudo obtener clima: %s", exc)
        return None


# ── Subida directa a S3 (fotos grandes) ──────────────────────────────────────

def _prefijo_usuario(sub: str) -> str:
    return f"{PREFIJO_SUBIDAS}/{sub}/"


def _generar_url_subida(event: dict) -> dict:
    """POST /medicion/upload-url -> POST prefirmado de S3 para una foto.

    Body: {"content_type": "image/jpeg"}. La politica fija la clave exacta, el
    content-type y el tamano (1 byte a MAX_BYTES_FOTO); S3 rechaza lo demas.
    Mismo bloqueo de rol que POST /medicion: `cliente` no sube fotos."""
    creador = _usuario_actual(event)
    if creador and creador.get("rol") == "cliente":
        return _respuesta(403, {"error": "Tu rol no puede subir mediciones. Pide ayuda a un administrador"})
    sub = _claims(event).get("sub", "")
    if not sub:
        return _respuesta(401, {"error": "No se pudo identificar tu sesión. Cierra sesión y vuelve a ingresar"})

    try:
        body = json.loads(event.get("body") or "{}")
    except ValueError:
        return _respuesta(400, {"error": "No se pudo leer la solicitud. Recarga la página e inténtalo de nuevo"})
    content_type = str(body.get("content_type") or "image/jpeg").strip().lower()
    extension = EXTENSIONES.get(content_type)
    if not extension:
        return _respuesta(400, {"error": "Tipo de imagen no soportado. Usa una imagen JPEG, PNG o WebP"})

    clave = f"{_prefijo_usuario(sub)}{uuid.uuid4()}.{extension}"
    post = s3.generate_presigned_post(
        Bucket=BUCKET_NAME,
        Key=clave,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, MAX_BYTES_FOTO],
        ],
        ExpiresIn=EXPIRA_SUBIDA_S,
    )
    return _respuesta(200, {
        "url": post["url"],
        "fields": post["fields"],
        "imagen_key": clave,
        "max_bytes": MAX_BYTES_FOTO,
        "expira_en_s": EXPIRA_SUBIDA_S,
    })


def _leer_subida(imagen_key, sub: str) -> bytes:
    """Lee de S3 la foto subida con el POST prefirmado. La clave debe colgar de
    `uploads/{sub}/` (el `sub` del JWT, nunca del body): nadie puede analizar
    la foto de otro usuario ni leer otro prefijo del bucket. Lanza ValueError
    (→400) si la clave es invalida, no existe o pesa mas de MAX_BYTES_FOTO."""
    if not isinstance(imagen_key, str) or not imagen_key.strip():
        raise ValueError("Falta la imagen. Vuelve a subirla e inténtalo de nuevo")
    prefijo = _prefijo_usuario(sub) if sub else None
    resto = imagen_key[len(prefijo):] if prefijo and imagen_key.startswith(prefijo) else None
    if not resto or not _CLAVE_SUBIDA.match(resto) or resto in (".", ".."):
        raise ValueError("La imagen subida no es válida. Vuelve a subirla")
    try:
        meta = s3.head_object(Bucket=BUCKET_NAME, Key=imagen_key)
        if meta["ContentLength"] > MAX_BYTES_FOTO:
            _borrar_subida(imagen_key)
            raise ValueError(f"La foto supera el máximo de {MAX_BYTES_FOTO // (1024 * 1024)} MB. Elige una foto más liviana")
        return s3.get_object(Bucket=BUCKET_NAME, Key=imagen_key)["Body"].read()
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            raise ValueError("La foto no existe o expiró. Vuelve a subirla") from e
        raise


def _borrar_subida(imagen_key: str) -> None:
    """Borra el objeto temporal; un fallo aqui no debe tumbar la solicitud (la
    regla de ciclo de vida del bucket lo expira igual)."""
    try:
        s3.delete_object(Bucket=BUCKET_NAME, Key=imagen_key)
    except Exception as exc:
        logger.warning("No se pudo borrar la subida temporal %s: %s", imagen_key, exc)


# ── Reanalisis de una medicion guardada (herramienta temporal) ───────────────

CAMPOS_PLACA = ("area_base", "area_corroida_pct_foto", "placa_pct_foto", "contorno_placa", "modelo_placa")
_CAMPOS_BUSQUEDA = ("id_punto", "sk", "id_medicion", "timestamp", "fuente", "notas", "s3_key_imagen",
                    "s3_key_thumbnail", "s3_key_resultado", "area_corroida_pct", "nivel_corrosion",
                    "modelo", "area_base", "analisis_anterior")


def _buscar_medicion(id_punto: str, id_medicion: str) -> dict | None:
    """Ítem de la medicion (solo los campos que usa el reanalisis: sin mascaras
    ni detecciones, que pesan). None si no existe."""
    nombres = {f"#c{i}": c for i, c in enumerate(_CAMPOS_BUSQUEDA)}
    kwargs = {
        "KeyConditionExpression": Key("id_punto").eq(id_punto) & Key("sk").begins_with("MED#"),
        "FilterExpression": Attr("id_medicion").eq(id_medicion),
        "ProjectionExpression": ", ".join(nombres),
        "ExpressionAttributeNames": nombres,
    }
    while True:
        resp = tabla_mediciones.query(**kwargs)
        for item in resp.get("Items", []):
            if item.get("id_medicion") == id_medicion:
                return item
        ultima = resp.get("LastEvaluatedKey")
        if not ultima:
            return None
        kwargs["ExclusiveStartKey"] = ultima


def _numero(valor):
    """El % se guarda como string en DynamoDB; en `analisis_anterior` va numerico."""
    try:
        return Decimal(str(valor))
    except Exception:
        return valor


def _analisis_previo(item: dict) -> dict:
    """Foto del analisis que se va a reemplazar: % (area_base indica sobre que
    se calculo), nivel, modelo y la fecha de la medicion."""
    previo = {
        "area_corroida_pct": _numero(item.get("area_corroida_pct")),
        "nivel_corrosion": item.get("nivel_corrosion"),
        "modelo": item.get("modelo"),
        "area_base": item.get("area_base"),
        "fecha": item.get("timestamp"),
    }
    return {k: v for k, v in previo.items() if v is not None}


def _reescribir_resultado(item: dict, resultado_ml: dict, extra: dict) -> None:
    """Rehace el JSON de resultado en S3 (es una foto del analisis). Mejor
    esfuerzo: DynamoDB es la fuente de verdad, asi que un fallo aqui solo se
    registra y no invalida el reanalisis."""
    clave = item.get("s3_key_resultado")
    if not clave:
        return
    try:
        try:
            datos = json.loads(s3.get_object(Bucket=BUCKET_NAME, Key=clave)["Body"].read())
        except Exception:
            datos = {}
        if not isinstance(datos, dict):
            datos = {}
        for campo in CAMPOS_PLACA:
            datos.pop(campo, None)
        datos.update({
            "id_medicion": item.get("id_medicion"), "id_punto": item.get("id_punto"),
            "timestamp": item.get("timestamp"), "fuente": item.get("fuente"),
            "s3_key_imagen": item.get("s3_key_imagen"), "s3_key_thumbnail": item.get("s3_key_thumbnail"),
            "s3_key_resultado": clave,
            **resultado_ml, **extra,
        })
        s3.put_object(Bucket=BUCKET_NAME, Key=clave, ContentType="application/json",
                      Body=json.dumps(datos, ensure_ascii=False, cls=DecimalEncoder))
    except Exception as exc:
        logger.error("No se pudo reescribir el resultado %s: %s", clave, exc)


def _reanalizar_medicion(event: dict, tiempos: dict) -> dict:
    """POST /mediciones/{id_punto}/reanalizar?id_medicion=MED-... (solo super_admin).

    Vuelve a correr `_inferir` (el modelo actual y el separador de placa) sobre
    la foto ya guardada en S3 y reemplaza los campos del analisis del MISMO
    ítem, como los dejaria una subida nueva (los de placa se quitan si el
    resultado nuevo no los trae). Foto, miniatura, nombre, notas, ubicacion,
    fechas y autor no se tocan. `analisis_anterior` guarda el analisis ORIGINAL
    y solo se escribe la primera vez (if_not_exists): reintentar de nuevo no lo
    pierde. `reanalizado_en` es la fecha UTC del ultimo reanalisis."""
    t_inicio = time.perf_counter()
    usuario = _usuario_actual(event)
    if not usuario or usuario.get("rol") != "super_admin":
        return _respuesta(403, {"error": "No tienes permiso para reintentar el análisis. Pide ayuda a un administrador"})

    id_punto = (event.get("pathParameters") or {}).get("id_punto")
    id_medicion = (event.get("queryStringParameters") or {}).get("id_medicion")
    if not id_punto or not id_medicion:
        return _respuesta(400, {"error": "No se indicó qué medición usar. Recarga la página e inténtalo de nuevo"})

    item = _buscar_medicion(id_punto, id_medicion)
    if not item:
        return _respuesta(404, {"error": "No se encontró la medición. Actualiza la lista e inténtalo de nuevo"})
    if not item.get("s3_key_imagen"):
        return _respuesta(422, {"error": "Esta medición no tiene foto guardada, así que no se puede analizar de nuevo"})

    try:
        datos = s3.get_object(Bucket=BUCKET_NAME, Key=item["s3_key_imagen"])["Body"].read()
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return _respuesta(404, {"error": "No se encontró la foto guardada de esta medición"})
        raise
    try:
        imagen = _abrir_imagen(datos)
    except Image.DecompressionBombError:
        return _respuesta(400, {"error": "La foto es demasiado grande para analizarla. Usa una imagen de menor resolución"})
    del datos

    resultado_ml = _inferir(imagen, tiempos)
    ahora = datetime.now(timezone.utc).isoformat()
    tiempo_ms = round((time.perf_counter() - t_inicio) * 1000)

    asignaciones = {
        "nivel_corrosion": resultado_ml["nivel_corrosion"],
        "area_corroida_pct": str(resultado_ml["area_corroida_pct"]),
        "confianza_promedio": str(resultado_ml["confianza_promedio"]),
        "detecciones": floats_to_decimal(resultado_ml["detecciones"]),
        "mascaras": floats_to_decimal(resultado_ml["mascaras"]),
        "modelo": resultado_ml["modelo"],
        "tiempo_procesamiento_ms": tiempo_ms,
        "reanalizado_en": ahora,
    }
    quitar = []
    for campo in CAMPOS_PLACA:
        if campo in resultado_ml:  # solo con el separador de placa habilitado
            asignaciones[campo] = floats_to_decimal(resultado_ml[campo])
        else:
            quitar.append(campo)

    nombres, valores, sets = {}, {}, []
    for i, (campo, valor) in enumerate(asignaciones.items()):
        nombres[f"#a{i}"], valores[f":a{i}"] = campo, valor
        sets.append(f"#a{i} = :a{i}")
    nombres["#ant"], valores[":ant"] = "analisis_anterior", _analisis_previo(item)
    sets.append("#ant = if_not_exists(#ant, :ant)")
    expr = "SET " + ", ".join(sets)
    if quitar:
        for j, campo in enumerate(quitar):
            nombres[f"#q{j}"] = campo
        expr += " REMOVE " + ", ".join(f"#q{j}" for j in range(len(quitar)))
    nombres["#id"], valores[":id"] = "id_medicion", id_medicion

    try:
        nuevo = tabla_mediciones.update_item(
            Key={"id_punto": id_punto, "sk": item["sk"]},
            UpdateExpression=expr,
            ConditionExpression="#id = :id",
            ExpressionAttributeNames=nombres,
            ExpressionAttributeValues=valores,
            ReturnValues="ALL_NEW",
        )["Attributes"]
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return _respuesta(404, {"error": "No se encontró la medición. Actualiza la lista e inténtalo de nuevo"})
        raise

    extra = {"tiempo_procesamiento_ms": tiempo_ms, "reanalizado_en": ahora}
    if nuevo.get("analisis_anterior"):
        extra["analisis_anterior"] = nuevo["analisis_anterior"]
    _reescribir_resultado(item, resultado_ml, extra)

    for campo_url, campo_key in (("url_imagen", "s3_key_imagen"), ("url_thumbnail", "s3_key_thumbnail")):
        if nuevo.get(campo_key):
            nuevo[campo_url] = s3.generate_presigned_url(
                "get_object", Params={"Bucket": BUCKET_NAME, "Key": nuevo[campo_key]}, ExpiresIn=3600)
    if "url_thumbnail" not in nuevo:
        nuevo["url_thumbnail"] = nuevo.get("url_imagen")

    logger.info("Medición %s reanalizada: nivel=%d, área=%.1f%%", id_medicion,
                resultado_ml["nivel_corrosion"], resultado_ml["area_corroida_pct"])
    return _respuesta(200, {"ok": True, "medicion": nuevo})


# ── Handler principal ────────────────────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:
    """Envuelve _procesar_solicitud y deja UNA linea TIEMPOS_INFERENCIA por
    solicitud (modelo, arranque en frio, descarga, carga, inferencia, total del
    handler) para el estudio de latencia. En CloudWatch se filtra con
    `TIEMPOS_INFERENCIA`; `total_ms` incluye validacion, clima, S3 y DynamoDB."""
    t0 = time.perf_counter()
    tiempos: dict = {}
    ruta = event.get("resource") or event.get("path") or ""
    if ruta.endswith("/reanalizar"):
        # Herramienta temporal (super_admin): re-analiza una medicion guardada.
        try:
            resp = _reanalizar_medicion(event, tiempos)
        except Exception as e:
            logger.exception("Error reanalizando la medicion: %s", e)
            return _respuesta(500, {"error": "Ocurrió un error inesperado. Inténtalo de nuevo; si persiste, contacta a un administrador"})
        if tiempos:
            tiempos["total_ms"] = round((time.perf_counter() - t0) * 1000)
            tiempos["status"] = resp["statusCode"]
            tiempos["accion"] = "reanalizar"
            logger.info("TIEMPOS_INFERENCIA %s", json.dumps(tiempos))
        return resp
    if ruta.endswith("/upload-url"):
        try:
            return _generar_url_subida(event)
        except Exception as e:
            logger.exception("Error generando la URL de subida: %s", e)
            return _respuesta(500, {"error": "Ocurrió un error inesperado. Inténtalo de nuevo; si persiste, contacta a un administrador"})
    resp = _procesar_solicitud(event, tiempos)
    if tiempos:  # vacio si la solicitud fallo o se rechazo antes de inferir
        tiempos["total_ms"] = round((time.perf_counter() - t0) * 1000)
        tiempos["status"] = resp["statusCode"]
        logger.info("TIEMPOS_INFERENCIA %s", json.dumps(tiempos))
    return resp


def _tiempo_subida(valor) -> float | None:
    """`tiempo_subida_s` opcional del cliente: numero finito entre 0 y 600.
    Cualquier otra cosa se ignora (None); nunca debe tumbar la solicitud."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return None
    if not math.isfinite(valor) or not 0 <= valor <= 600:
        return None
    return round(float(valor), 2)


NOMBRE_MAX = 80
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def _nombre_foto(valor) -> str:
    """`nombre` opcional que el usuario le da a la foto: sin caracteres de
    control, espacios colapsados, recortado y truncado a 80. Vacio = no se guarda."""
    if not isinstance(valor, str):
        return ""
    limpio = " ".join(_CONTROL_RE.sub(" ", valor).split())
    return limpio[:NOMBRE_MAX].rstrip()


def _procesar_solicitud(event: dict, tiempos: dict) -> dict:
    t_inicio = time.perf_counter()
    try:
        creador = _usuario_actual(event)
        if creador and creador.get("rol") == "cliente":
            # Subir medición: solo super_admin/admin/tecnico (ver matriz de
            # permisos) — cliente es de solo lectura.
            return _respuesta(403, {"error": "Tu rol no puede subir mediciones. Pide ayuda a un administrador"})
        es_super_admin = bool(creador) and creador.get("rol") == "super_admin"
        empresa_id_creador = creador.get("empresa_id") if creador else None

        body = json.loads(event.get("body", "{}"))

        imagen_b64       = body.get("imagen_base64")
        imagen_key       = body.get("imagen_key")
        fuente           = body.get("fuente", "movil")
        bloque_id_body   = body.get("bloque_id")
        inferencia_local = body.get("inferencia_local", None)
        latitud_real     = body.get("latitud_real")
        longitud_real    = body.get("longitud_real")
        notas            = body.get("notas", "")
        nombre           = _nombre_foto(body.get("nombre"))  # opcional
        timestamp_custom = body.get("timestamp_medicion")  # YYYY-MM-DD, opcional
        tiempo_subida_s  = _tiempo_subida(body.get("tiempo_subida_s"))  # opcional

        if not imagen_b64 and imagen_key is None:
            return _respuesta(400, {"error": "Falta la imagen. Selecciona una foto e inténtalo de nuevo"})
        if not bloque_id_body:
            return _respuesta(400, {"error": "Selecciona el punto donde se guardará la medición"})

        if timestamp_custom:
            try:
                ts = datetime.fromisoformat(timestamp_custom + "T12:00:00").replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                return _respuesta(400, {"error": "La fecha de la medición no es válida. Elige una fecha del calendario"})
        else:
            ts = datetime.now(timezone.utc).isoformat()

        tomado_por_id = _claims(event).get("sub", "")
        # Foto fija del nombre al momento de tomar la medición -- sigue
        # siendo legible en el histórico aunque la cuenta se borre después
        # (a diferencia de tomado_por_id/usuario_id, que dejan de resolverse
        # a nadie si esa cuenta ya no existe).
        tomado_por_nombre = creador.get("nombre", "") if creador else ""

        try:
            bloque = _validar_bloque(bloque_id_body, empresa_id_creador, es_super_admin)
        except LookupError as e:
            return _respuesta(404, {"error": str(e)})
        except ValueError as e:
            return _respuesta(400, {"error": str(e)})

        coords = bloque.get("coordenadas", {})
        # OJO: chequeo por None, no por "truthy" — lat=0.0 (línea del
        # ecuador) es una coordenada válida y con `if coords.get("lat")`
        # Python la trata como falsy y se salta el clima en silencio.
        fecha_clima = timestamp_custom if timestamp_custom else None
        clima = _obtener_clima(coords.get("lat"), coords.get("lng"), fecha_clima) if coords.get("lat") is not None else None

        if imagen_b64:
            datos_imagen = base64.b64decode(imagen_b64)
        else:
            try:
                datos_imagen = _leer_subida(imagen_key, tomado_por_id)
            except ValueError as e:
                return _respuesta(400, {"error": str(e)})
        try:
            imagen = _abrir_imagen(datos_imagen)
        except Image.DecompressionBombError:
            return _respuesta(400, {"error": "La foto es demasiado grande para analizarla. Usa una imagen de menor resolución"})
        del datos_imagen

        resultado_ml = _inferir(imagen, tiempos)

        id_medicion       = f"MED-{uuid.uuid4()}"
        # Layout S3 por empresa/bloque: los objetos quedan agrupados igual
        # que la jerarquía de la app (empresa → bloque → medición), así una
        # carpeta de S3 se puede acotar por tenant. El empresa_id es el del
        # BLOQUE, no el del uploader (un super_admin puede subir a nombre de
        # otra empresa). Las keys viejas (`raw/`, `resultados/`) NO se
        # migran: cada medición guarda las suyas en DynamoDB y se leen de ahí
        # (ver api_mediciones/_agregar_url_imagen, que nunca deriva una key
        # de otra por string).
        empresa_key = bloque.get("empresa_id") or "sin-empresa"
        prefijo_s3        = f"empresas/{empresa_key}/{bloque_id_body}"
        s3_key_imagen     = f"{prefijo_s3}/{id_medicion}.jpg"
        s3_key_thumbnail  = f"{prefijo_s3}/{id_medicion}_thumb.jpg"
        s3_key_resultado  = f"{prefijo_s3}/{id_medicion}.json"

        buffer = io.BytesIO()
        imagen.save(buffer, format="JPEG", quality=85)

        # Miniatura para las tarjetas de la galería (grillas de 170px de alto).
        # Sin esto, cada tarjeta bajaba la foto original completa (hasta
        # 4032x3024, unos 2-4 MB) solo para mostrarla achicada -- con 24
        # fotos por página eran 50-100 MB por carga de galería. `thumbnail()`
        # in-place preserva la relación de aspecto, no la fuerza a cuadrada.
        imagen_thumb = imagen.copy()
        imagen_thumb.thumbnail((400, 400), Image.LANCZOS)
        buffer_thumb = io.BytesIO()
        imagen_thumb.save(buffer_thumb, format="JPEG", quality=80)

        # Si el put_item final a DynamoDB falla después de escribir en S3,
        # no queremos que las imágenes/resultados queden sueltos en el bucket
        # sin ningún registro que los referencie (no hay lifecycle rule que
        # los limpie sola). Track de qué se llegó a escribir para poder
        # deshacerlo si algo falla más adelante en el mismo intento.
        s3_imagen_escrita    = False
        s3_thumb_escrito     = False
        s3_resultado_escrito = False
        try:
            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=s3_key_imagen,
                Body=buffer.getvalue(),
                ContentType="image/jpeg",
            )
            s3_imagen_escrita = True

            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=s3_key_thumbnail,
                Body=buffer_thumb.getvalue(),
                ContentType="image/jpeg",
            )
            s3_thumb_escrito = True

            # Tiempo de servidor desde que llego la solicitud hasta justo antes
            # de guardar (el cliente suma su tiempo de subida aparte).
            tiempo_procesamiento_ms = round((time.perf_counter() - t_inicio) * 1000)

            resultado_completo = {
                "id_medicion":    id_medicion,
                "id_punto":       bloque_id_body,
                "timestamp":      ts,
                "fuente":         fuente,
                **resultado_ml,
                "latitud_real":   latitud_real,
                "longitud_real":  longitud_real,
                "notas":          notas,
                "inferencia_local": inferencia_local,
                "s3_key_imagen":     s3_key_imagen,
                "s3_key_thumbnail":  s3_key_thumbnail,
                "s3_key_resultado":  s3_key_resultado,
                "clima":            clima,
                "tiempo_procesamiento_ms": tiempo_procesamiento_ms,
            }
            if tiempo_subida_s is not None:
                resultado_completo["tiempo_subida_s"] = tiempo_subida_s
            if nombre:
                resultado_completo["nombre"] = nombre

            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=s3_key_resultado,
                Body=json.dumps(resultado_completo, ensure_ascii=False, cls=DecimalEncoder),
                ContentType="application/json",
            )
            s3_resultado_escrito = True

            # `id_punto` sigue siendo el nombre del atributo de siempre en
            # esta tabla (no se toca el schema) -- ahora vale el `id_bloque`
            # validado arriba, con forma `BLQ-...` en vez de `PT-...`.
            item_db = {
                "id_punto":         bloque_id_body,
                "sk":               f"MED#{ts}",
                "timestamp":        ts,
                "tipo_registro":    "medicion",
                "id_medicion":      id_medicion,
                "nivel_corrosion":  resultado_ml["nivel_corrosion"],
                "area_corroida_pct": str(resultado_ml["area_corroida_pct"]),
                "confianza_promedio": str(resultado_ml["confianza_promedio"]),
                "s3_key_imagen":    s3_key_imagen,
                "s3_key_thumbnail": s3_key_thumbnail,
                "s3_key_resultado": s3_key_resultado,
                "fuente":           fuente,
                "notas":            notas,
                "inferencia_local": floats_to_decimal(inferencia_local or {}),
                "detecciones":      floats_to_decimal(resultado_ml["detecciones"]),
                "mascaras":         floats_to_decimal(resultado_ml["mascaras"]),
                "modelo":           resultado_ml["modelo"],
                "tiempo_procesamiento_ms": tiempo_procesamiento_ms,
            }
            for campo in ("area_base", "area_corroida_pct_foto", "placa_pct_foto", "contorno_placa", "modelo_placa"):
                if campo in resultado_ml:  # solo con el separador de placa habilitado
                    item_db[campo] = floats_to_decimal(resultado_ml[campo])
            if tiempo_subida_s is not None:
                item_db["tiempo_subida_s"] = Decimal(str(tiempo_subida_s))
            if nombre:
                item_db["nombre"] = nombre
            if tomado_por_id:
                # Identidad del autor + atributo de GSI (usuario_id/timestamp).
                # DynamoDB rechaza strings vacíos como clave de GSI, así que
                # "usuario_id" solo se agrega cuando hay un usuario real.
                item_db["tomado_por_id"] = tomado_por_id
                item_db["usuario_id"] = tomado_por_id
                if tomado_por_nombre:
                    item_db["creado_por_nombre"] = tomado_por_nombre
            if latitud_real is not None:
                item_db["latitud_real"] = Decimal(str(latitud_real))
            if longitud_real is not None:
                item_db["longitud_real"] = Decimal(str(longitud_real))
            if clima:
                item_db["clima"] = floats_to_decimal(clima)
            # empresa_id de la medición: la del bloque al que pertenece (no
            # la del uploader — relevante si un super_admin sube a nombre de
            # una empresa ajena) — denormalizado para que api_mediciones/
            # api_alertas puedan filtrar sin un lookup extra al bloque.
            if bloque.get("empresa_id"):
                item_db["empresa_id"] = bloque.get("empresa_id")
            # bloque_id + bloque_nombre denormalizados en la medición.
            # `bloque_nombre` queda congelado (como creado_por_nombre) — si
            # después renombran el bloque, el histórico sigue mostrando cómo
            # se llamaba entonces.
            item_db["bloque_id"] = bloque_id_body
            if bloque.get("nombre"):
                item_db["bloque_nombre"] = bloque["nombre"]

            tabla_mediciones.put_item(Item=item_db)
        except Exception as e:
            if s3_imagen_escrita:
                try:
                    s3.delete_object(Bucket=BUCKET_NAME, Key=s3_key_imagen)
                except Exception as rb:
                    logger.error("Rollback S3 (imagen) falló para %s: %s", s3_key_imagen, rb)
            if s3_thumb_escrito:
                try:
                    s3.delete_object(Bucket=BUCKET_NAME, Key=s3_key_thumbnail)
                except Exception as rb:
                    logger.error("Rollback S3 (thumbnail) falló para %s: %s", s3_key_thumbnail, rb)
            if s3_resultado_escrito:
                try:
                    s3.delete_object(Bucket=BUCKET_NAME, Key=s3_key_resultado)
                except Exception as rb:
                    logger.error("Rollback S3 (resultado) falló para %s: %s", s3_key_resultado, rb)
            raise

        if not imagen_b64:
            # La copia definitiva ya está en empresas/...: el temporal sobra.
            _borrar_subida(imagen_key)

        logger.info(
            "Medición %s registrada: bloque=%s, nivel=%d, área=%.1f%%, detecciones=%d",
            id_medicion, bloque_id_body,
            resultado_ml["nivel_corrosion"],
            resultado_ml["area_corroida_pct"],
            len(resultado_ml["detecciones"]),
        )

        return _respuesta(200, {
            **resultado_completo,
            "bloque_info": {
                "id_bloque":   bloque_id_body,
                "nombre":      bloque.get("nombre", ""),
                "ciudad":      bloque.get("ciudad", ""),
                "coordenadas": bloque.get("coordenadas", {}),
            },
        })

    except Exception as e:
        logger.exception("Error en inferencia: %s", e)
        return _respuesta(500, {"error": "Ocurrió un error inesperado. Inténtalo de nuevo; si persiste, contacta a un administrador"})
