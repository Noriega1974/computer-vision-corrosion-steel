"""
pf-corrosion - Lambda de inferencia YOLOv8-seg ONNX.

Recibe una imagen en base64 + información de ubicación, resuelve o crea el
punto de medición automáticamente (flujo bottom-up), corre inferencia ONNX,
guarda imagen + resultado en S3 y registra la medición en DynamoDB.

Almacenamiento: tabla fusionada puntos+mediciones (ver CorriaStorageStack).
El registro del punto usa sort key constante "METADATA"; la medición usa
"MED#{timestamp}".

Seguridad: esta función solo tiene permisos sobre la tabla fusionada y el
bucket S3 de imágenes — NO tiene acceso a la tabla de usuarios ni a Cognito,
porque el código de este handler nunca los toca (a diferencia del sistema
original, que le otorgaba permisos de más).
"""
import base64
import io
import json
import logging
import os
import uuid
import urllib.request
import urllib.error
from decimal import Decimal
from datetime import datetime, timezone
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key
from PIL import Image
import numpy as np
import onnxruntime as ort

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BUCKET_NAME = os.environ["BUCKET_NAME"]
TABLA_PUNTOS = os.environ["TABLA_PUNTOS"]
TABLA_MEDICIONES = os.environ["TABLA_MEDICIONES"]
REGION = os.environ["REGION"]

RUTA_MODELO = Path(__file__).parent / "model" / "yolov8n-seg.onnx"
CONF_MINIMA = 0.4
IMGSZ = 640
SK_METADATA = "METADATA"

_sesion_onnx: ort.InferenceSession | None = None

s3 = boto3.client("s3", region_name=REGION)
dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla_puntos = dynamodb.Table(TABLA_PUNTOS)
tabla_mediciones = dynamodb.Table(TABLA_MEDICIONES)


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


# ── Resolución de punto ──────────────────────────────────────────────────────

def _buscar_por_clave_logica(clave_logica: str) -> dict | None:
    resp = tabla_puntos.query(
        IndexName="ClaveLogicaIndex",
        KeyConditionExpression=Key("clave_logica").eq(clave_logica),
        Limit=1,
    )
    items = resp.get("Items", [])
    return items[0] if items else None


def _crear_punto(datos: dict) -> dict:
    item = floats_to_decimal(datos)
    tabla_puntos.put_item(Item=item)
    logger.info("Punto creado: %s (%s)", datos["id_punto"], datos.get("clave_logica"))
    return datos


def _resolver_punto(ubicacion: dict, ts: str, tomado_por_id: str) -> tuple[str, dict]:
    modo = ubicacion.get("modo")

    if modo == "planta_existente":
        id_punto = ubicacion.get("id_punto")
        if not id_punto:
            raise ValueError("modo=planta_existente requiere id_punto")
        resp = tabla_puntos.get_item(Key={"id_punto": id_punto, "sk": SK_METADATA})
        punto = resp.get("Item")
        if not punto:
            raise LookupError(f"Punto {id_punto} no encontrado")
        return id_punto, punto

    elif modo == "planta_nueva":
        sede = ubicacion.get("sede", "")
        ciudad = ubicacion.get("ciudad", "")
        if not sede or not ciudad:
            raise ValueError("modo=planta_nueva requiere sede y ciudad")

        clave_logica = f"{sede}-{ciudad}"
        existente = _buscar_por_clave_logica(clave_logica)
        if existente:
            return existente["id_punto"], existente

        coordenadas = ubicacion.get("coordenadas", {})
        nuevo = {
            "id_punto": f"PT-{uuid.uuid4()}",
            "sk": SK_METADATA,
            "clave_logica": clave_logica,
            "coordenadas": coordenadas,
            "ciudad": ciudad,
            "departamento": ubicacion.get("departamento", ""),
            "tipo_material": ubicacion.get("tipo_material", ""),
            "tipo_estructura": ubicacion.get("tipo_estructura", "otro"),
            "sede": sede,
            "fecha_creacion": ts,
            "timestamp": ts,
        }
        # GSI de búsqueda inversa por usuario (usuario_id/timestamp) — ver
        # CorriaStorageStack. DynamoDB rechaza strings vacíos como clave de
        # GSI, así que "usuario_id" solo se agrega cuando hay un usuario
        # real (sparse index); si tomado_por_id viene vacío, el punto
        # simplemente no aparece en ese índice, pero el resto del ítem se
        # guarda igual.
        if tomado_por_id:
            nuevo["creado_por_id"] = tomado_por_id
            nuevo["usuario_id"] = tomado_por_id
        _crear_punto(nuevo)
        return nuevo["id_punto"], nuevo

    elif modo == "coordenadas_libres":
        lat = ubicacion.get("latitud")
        lng = ubicacion.get("longitud")
        if lat is None or lng is None:
            raise ValueError("modo=coordenadas_libres requiere latitud y longitud")

        descripcion = ubicacion.get("descripcion", f"Punto {lat},{lng}")
        clave_logica = f"libre-{round(lat, 4)}-{round(lng, 4)}"
        existente = _buscar_por_clave_logica(clave_logica)
        if existente:
            return existente["id_punto"], existente

        nuevo = {
            "id_punto": f"PT-{uuid.uuid4()}",
            "sk": SK_METADATA,
            "clave_logica": clave_logica,
            "coordenadas": {"lat": lat, "lng": lng},
            "ciudad": "",
            "departamento": "",
            "tipo_material": "",
            "tipo_estructura": "otro",
            "sede": descripcion,
            "fecha_creacion": ts,
            "timestamp": ts,
        }
        if tomado_por_id:
            nuevo["creado_por_id"] = tomado_por_id
            nuevo["usuario_id"] = tomado_por_id
        _crear_punto(nuevo)
        return nuevo["id_punto"], nuevo

    else:
        raise ValueError(f"modo de ubicación inválido: '{modo}'")


# ── Inferencia ONNX ──────────────────────────────────────────────────────────

def _obtener_sesion() -> ort.InferenceSession:
    global _sesion_onnx
    if _sesion_onnx is None:
        logger.info("Cargando modelo ONNX desde %s", RUTA_MODELO)
        _sesion_onnx = ort.InferenceSession(
            str(RUTA_MODELO),
            providers=["CPUExecutionProvider"],
        )
    return _sesion_onnx


def _preprocesar(imagen: Image.Image) -> tuple[np.ndarray, int, int]:
    orig_w, orig_h = imagen.size
    imagen_r = imagen.resize((IMGSZ, IMGSZ))
    arr = np.array(imagen_r, dtype=np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)[np.newaxis, ...]
    return arr, orig_w, orig_h


def _calcular_nivel(area_pct: float) -> int:
    if area_pct <= 0:
        return 0
    elif area_pct <= 10:
        return 1
    elif area_pct <= 30:
        return 2
    return 3


def _bbox_a_poligono(cx: float, cy: float, w: float, h: float) -> list[dict]:
    """Convierte un bbox (centro normalizado) a polígono de 4 puntos [0,1]."""
    x1 = max(0.0, cx - w / 2)
    y1 = max(0.0, cy - h / 2)
    x2 = min(1.0, cx + w / 2)
    y2 = min(1.0, cy + h / 2)
    return [
        {"x": x1, "y": y1},
        {"x": x2, "y": y1},
        {"x": x2, "y": y2},
        {"x": x1, "y": y2},
    ]


def _inferir(imagen: Image.Image) -> dict:
    """
    Corre inferencia YOLOv8-seg ONNX y devuelve:
      - nivel_corrosion, area_corroida_pct, confianza_promedio  (métricas globales)
      - detecciones: [{x, y, w, h, confianza, clase}]           (para BoundingBoxOverlay)
      - mascaras: [{puntos: [{x, y}...]}]                       (para SegmentationOverlay)

    YOLOv8n-seg (1 clase) devuelve:
      output0: [1, 37, 8400] — bbox(4) + conf(1) + mask_coefs(32)
      output1: [1, 32, 160, 160] — prototipos de máscara (no usados en esta versión)

    Los polígonos devueltos son los bounding boxes de cada detección (4 puntos),
    con coordenadas normalizadas a [0,1] relativas al tamaño de la imagen original.
    """
    sesion = _obtener_sesion()
    arr, orig_w, orig_h = _preprocesar(imagen)

    nombre_entrada = sesion.get_inputs()[0].name
    salidas = sesion.run(None, {nombre_entrada: arr})

    dets_raw = salidas[0][0].T   # [8400, 37]

    area_total_px = IMGSZ * IMGSZ
    area_corroida_px = 0
    detecciones = []
    mascaras = []
    confianzas = []

    for det in dets_raw:
        conf = float(det[4])
        if conf < CONF_MINIMA:
            continue

        # Coordenadas en píxeles del modelo (640x640) → normalizadas [0,1]
        cx = float(det[0]) / IMGSZ
        cy = float(det[1]) / IMGSZ
        w  = float(det[2]) / IMGSZ
        h  = float(det[3]) / IMGSZ

        detecciones.append({
            "x": round(cx, 5),
            "y": round(cy, 5),
            "w": round(w, 5),
            "h": round(h, 5),
            "confianza": round(conf, 4),
            "clase": "corrosion",
        })

        mascaras.append({"puntos": _bbox_a_poligono(cx, cy, w, h)})

        area_corroida_px += int(w * h * area_total_px)
        confianzas.append(conf)

    area_pct = min((area_corroida_px / area_total_px) * 100, 100.0)
    conf_promedio = float(np.mean(confianzas)) if confianzas else 0.0

    logger.info(
        "Inferencia: %d detecciones, área=%.1f%%, conf_avg=%.3f",
        len(detecciones), area_pct, conf_promedio,
    )

    return {
        "nivel_corrosion": _calcular_nivel(area_pct),
        "area_corroida_pct": round(area_pct, 2),
        "confianza_promedio": round(conf_promedio, 4),
        "detecciones": detecciones,
        "mascaras": mascaras,
    }


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


# ── Handler principal ────────────────────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:
    try:
        body = json.loads(event.get("body", "{}"))

        imagen_b64       = body.get("imagen_base64")
        fuente           = body.get("fuente", "movil")
        ubicacion        = body.get("ubicacion")
        inferencia_local = body.get("inferencia_local", None)
        latitud_real     = body.get("latitud_real")
        longitud_real    = body.get("longitud_real")
        notas            = body.get("notas", "")
        timestamp_custom = body.get("timestamp_medicion")  # YYYY-MM-DD, opcional

        if not imagen_b64:
            return _respuesta(400, {"error": "imagen_base64 es requerido"})
        if not ubicacion or not ubicacion.get("modo"):
            return _respuesta(400, {"error": "ubicacion.modo es requerido"})

        if timestamp_custom:
            try:
                ts = datetime.fromisoformat(timestamp_custom + "T12:00:00").replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                return _respuesta(400, {"error": "timestamp_medicion debe tener formato YYYY-MM-DD"})
        else:
            ts = datetime.now(timezone.utc).isoformat()

        tomado_por_id = _claims(event).get("sub", "")

        try:
            id_punto, info_punto = _resolver_punto(ubicacion, ts, tomado_por_id)
        except LookupError as e:
            return _respuesta(404, {"error": str(e)})
        except ValueError as e:
            return _respuesta(400, {"error": str(e)})

        coords = info_punto.get("coordenadas", {})
        if not coords.get("lat") and info_punto.get("latitud") is not None:
            coords = {"lat": float(info_punto["latitud"]), "lng": float(info_punto.get("longitud", 0))}
        fecha_clima = timestamp_custom if timestamp_custom else None
        clima = _obtener_clima(coords.get("lat"), coords.get("lng"), fecha_clima) if coords.get("lat") else None

        datos_imagen = base64.b64decode(imagen_b64)
        imagen = Image.open(io.BytesIO(datos_imagen)).convert("RGB")

        resultado_ml = _inferir(imagen)

        id_medicion      = f"MED-{uuid.uuid4()}"
        s3_key_imagen    = f"raw/{id_punto}/{id_medicion}.jpg"
        s3_key_resultado = f"resultados/{id_punto}/{id_medicion}.json"

        buffer = io.BytesIO()
        imagen.save(buffer, format="JPEG", quality=85)
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key_imagen,
            Body=buffer.getvalue(),
            ContentType="image/jpeg",
        )

        resultado_completo = {
            "id_medicion":    id_medicion,
            "id_punto":       id_punto,
            "timestamp":      ts,
            "fuente":         fuente,
            **resultado_ml,
            "latitud_real":   latitud_real,
            "longitud_real":  longitud_real,
            "notas":          notas,
            "inferencia_local": inferencia_local,
            "s3_key_imagen":    s3_key_imagen,
            "s3_key_resultado": s3_key_resultado,
            "clima":            clima,
        }

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key_resultado,
            Body=json.dumps(resultado_completo, ensure_ascii=False, cls=DecimalEncoder),
            ContentType="application/json",
        )

        item_db = {
            "id_punto":         id_punto,
            "sk":               f"MED#{ts}",
            "timestamp":        ts,
            "tipo_registro":    "medicion",
            "id_medicion":      id_medicion,
            "nivel_corrosion":  resultado_ml["nivel_corrosion"],
            "area_corroida_pct": str(resultado_ml["area_corroida_pct"]),
            "confianza_promedio": str(resultado_ml["confianza_promedio"]),
            "s3_key_imagen":    s3_key_imagen,
            "s3_key_resultado": s3_key_resultado,
            "fuente":           fuente,
            "notas":            notas,
            "inferencia_local": floats_to_decimal(inferencia_local or {}),
            "detecciones":      floats_to_decimal(resultado_ml["detecciones"]),
            "mascaras":         floats_to_decimal(resultado_ml["mascaras"]),
        }
        if tomado_por_id:
            # Identidad del autor + atributo de GSI (usuario_id/timestamp).
            # DynamoDB rechaza strings vacíos como clave de GSI, así que
            # "usuario_id" solo se agrega cuando hay un usuario real.
            item_db["tomado_por_id"] = tomado_por_id
            item_db["usuario_id"] = tomado_por_id
        if latitud_real is not None:
            item_db["latitud_real"] = Decimal(str(latitud_real))
        if longitud_real is not None:
            item_db["longitud_real"] = Decimal(str(longitud_real))
        if clima:
            item_db["clima"] = floats_to_decimal(clima)
        # Denormalize punto info for display without extra lookup
        item_db["sede"]    = info_punto.get("sede", "")
        item_db["ciudad"]  = info_punto.get("ciudad", "")

        tabla_mediciones.put_item(Item=item_db)

        logger.info(
            "Medición %s registrada: punto=%s, nivel=%d, área=%.1f%%, detecciones=%d",
            id_medicion, id_punto,
            resultado_ml["nivel_corrosion"],
            resultado_ml["area_corroida_pct"],
            len(resultado_ml["detecciones"]),
        )

        return _respuesta(200, {
            **resultado_completo,
            "punto_info": {
                "id_punto":    id_punto,
                "sede":        info_punto.get("sede", ""),
                "ciudad":      info_punto.get("ciudad", ""),
                "coordenadas": info_punto.get("coordenadas", {}),
                "clave_logica": info_punto.get("clave_logica", ""),
            },
        })

    except Exception as e:
        logger.exception("Error en inferencia: %s", e)
        return _respuesta(500, {"error": str(e)})
