# Runbook: inferencia definitiva (U-Net final; YOLO solo para medir latencia)

Estado (2026-10-26): **código listo y probado en local, NO desplegado.** Cada paso de la sección 6 modifica la cuenta `pf-corrosion` (234329974788, us-east-1) y requiere el visto bueno explícito del dueño para esa acción (memoria `corria_confirmacion_aws`). El perfil `default` de esta máquina pertenece a OTRA cuenta: usar siempre `--profile pf-corrosion`.

Decisiones del dueño (finales):

- El modelo de producción es la **U-Net final** (`best.pt`, época 100, umbral 0.5) para siempre. YOLO (`epoch80.pt`, conf 0.25) sube primero, temporalmente, para medir su latencia en la MISMA infraestructura; luego su archivo se borra del bucket y se reemplaza por la U-Net.
- Una sola Lambda `pf-corrosion-inference`, 3008 MB y 30 s para ambos modelos (tiempos comparables). Ningún modelo va en el zip: ambos se bajan del bucket `pf-corrosion-models-234329974788` a `/tmp` una vez por arranque en frío.
- % corroído = píxeles corroídos / píxeles de la **foto completa** (sin ROI de placa). Niveles ISO 10289 en `_calcular_nivel`: 0 si < 0.05 %, 1 si < 10 %, 2 si < 25 %, 3 si >= 25 %.

## 1. Cómo funciona

`POST /medicion` (API Gateway, autorizador Cognito) invoca `pf-corrosion-inference` (`lambda_src/inference/handler.py`):

1. Resuelve el usuario por el claim `sub`, valida el `bloque_id` y rechaza el rol `cliente`.
2. Decodifica la foto y aplica `ImageOps.exif_transpose` **antes de todo** (modelo, JPEG guardado y miniatura ven la foto derecha).
3. `model_store.py` baja el ONNX (`MODEL_BUCKET`/`MODEL_KEY`) a `/tmp` si no está (archivo `.part` + renombrado; `MODEL_SHA256` opcional) y crea la sesión onnxruntime (cacheada por contenedor).
4. Según `MODEL_TYPE`: `unet_model.py` o `yolo_model.py` devuelven el mismo contrato; el handler calcula `nivel_corrosion` con `_calcular_nivel`.
5. Escribe S3 (`empresas/{empresa}/{bloque}/{id}.jpg`, `_thumb.jpg`, `.json`) y la tabla fusionada; responde el documento (más `bloque_info`).

| Módulo | Qué hace |
|---|---|
| `model_store.py` | tipo de modelo, descarga/caché/sha256, sesión ONNX, tiempos de descarga y carga |
| `unet_model.py` | lienzo 1024 (lado largo, PIL BOX, relleno `(124,116,104)`, ImageNet), sigmoide, umbral `UNET_THRESHOLD` (0.5), % sobre la foto reescalada sin relleno, contornos con `mask_polygons.py` |
| `yolo_model.py` | letterbox Ultralytics (centrado, relleno 114), `CONF_MINIMA` (0.25, estricto `>`), NMS IoU 0.7, `max_det` 1000, máscara = coef · prototipos → recorte a la caja → bilinear → `> 0`; la unión se recorta al área de la foto (el relleno NO cuenta) y se calcula el % sobre ella; cajas y polígonos (casco convexo) en coordenadas normalizadas de la foto |

Variables de entorno de la Lambda (las fija CDK): `MODEL_TYPE`, `MODEL_BUCKET`, `MODEL_KEY`, `MODEL_SHA256` (opcional), `CONF_MINIMA=0.25`, `UNET_THRESHOLD=0.5`. Solo para ajustes: `YOLO_IOU`, `YOLO_MAX_DET`, `UNET_MIN_AREA_PX`, `UNET_MAX_COMPONENTS`, `UNET_MAX_POINTS`, `UNET_SIMPLIFY_EPS_PX`.

### Contrato de respuesta (sin cambios)

| Campo | Forma | Lo usa |
|---|---|---|
| `nivel_corrosion` | entero 0-3 (cortes 0.05 / 10 / 25 % de la foto completa) | todas las vistas |
| `area_corroida_pct` | número, % de la foto cubierto por la unión de corrosión | UploadPage, Detección IA, Galería, detalle, KPIs, gráficos |
| `confianza_promedio` | 0-1 | UploadPage, Detección IA, detalle |
| `detecciones[]` | `{x, y, w, h, confianza, clase}` normalizados 0-1 (x, y = centro) | BoundingBoxOverlay, detalle, contador de regiones |
| `mascaras[]` | `{puntos: [{x, y}]}` normalizados 0-1 | SegmentationOverlay, detalle |
| `modelo` | `"unet:<archivo>"` o `"yolo:<archivo>"` (antes `"yolo"`) | nadie todavía; queda guardado en DynamoDB y en el JSON de S3 |

Con la U-Net (segmentación semántica) `detecciones` son las envolventes de cada componente conexa y `confianza` la probabilidad media de la componente; `mascaras` son sus contornos simplificados (tope de 2000 vértices por respuesta). Detalles de esta emulación: `unet_model.py`.

## 2. Modelos exportados

Archivos en `~/projects/corrosion-ml/4_corrida3/modelos/` (no se versionan en git):

| Archivo | Origen | Tamaño | sha256 |
|---|---|---|---|
| `unet_final_1024.onnx` | `colab_final_unet_train/output/best.pt` (Unet / resnet34, época 100, IoU valid 0.8123) | 97,7 MB | `2537740fc0dd6c10607f241a071dd263116a0dea6e41bdc9e828f465f535b11a` |
| `yolo_final_ep80_1024.onnx` | `colab_final_yolo_ft/.../modelo_final_ft_fp32/weights/epoch80.pt` (YOLOv8n-seg) | 13,5 MB | `b622273789549cfc004c43e10050207331aff105990d7bbee9704a6bb08b24f3` |

Ambos: opset 17, IR 8, entrada fija 1x3x1024x1024, cargan con onnxruntime 1.16.3 (el de la capa). Reexportar (entorno conda `corrosion-ml`):

```bash
python scripts/export_unet_onnx.py --weights <best.pt> --out <...>/unet_final_1024.onnx --check-images <3 fotos>
python scripts/export_yolo_onnx.py --weights <epoch80.pt> --out <...>/yolo_final_ep80_1024.onnx --check-images <3 fotos>
```

Verificación contra PyTorch (3 fotos del valid): U-Net `max|dp|` 8.6e-06 a 1.1e-05, IoU de máscara 1.00000 y 0 píxeles distintos; YOLO cajas <= 0.023 px, confianza y coeficientes <= 1.0e-04, prototipos <= 7.3e-05 y el mismo número de celdas sobre 0.25.

## 3. Pruebas locales (sin AWS)

Entorno con las versiones de la capa (Python 3.11):

```bash
python3.11 -m venv /tmp/lam311
/tmp/lam311/bin/pip install pytest boto3 "numpy==1.26.4" "Pillow==10.4.0" "onnxruntime==1.16.3" "onnx<1.17" opencv-python-headless
export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null; unset AWS_PROFILE
/tmp/lam311/bin/python -m pytest tests/unit -q --ignore=tests/unit/test_compute_stack.py
.venv/bin/python -m pytest tests/unit/test_compute_stack.py -q     # plantilla CDK (necesita aws_cdk)
# U-Net real sobre fotos reales (opcional)
UNET_TEST_ONNX=<unet_final_1024.onnx> UNET_TEST_IMAGES=<carpeta .jpg> /tmp/lam311/bin/python -m pytest tests/unit -q
```

Handler completo con tiempos y paridad con el evaluador offline (`scripts/run_local_handler.py`, `scripts/parity_vs_offline.py`):

```bash
/tmp/lam311/bin/python scripts/parity_vs_offline.py --images <valid/images> \
  --yolo-onnx <yolo...onnx> --offline-yolo <umbral/per_conf_0.25.json> \
  --unet-onnx <unet...onnx> --offline-unet <umbral_unet/per_conf_0.5.json> --threads 2
```

Resultado (2026-10-26, 40 fotos del valid: 10 sin corrosión + 30 con, equiespaciadas por nombre; handler real con S3/DynamoDB falsos; diferencia absoluta en puntos porcentuales contra `pred_pct` del evaluador):

| Modelo | Mediana | p95 | Máx | Acuerdo de nivel | Inferencia local (mediana, 2 hilos) |
|---|---|---|---|---|---|
| YOLO ep80 @0.25 | 0.056 | 0.428 | 0.498 | 97.5 % (39/40) | 0.62 s (ONNX 0.27 s); handler 0.69 s |
| U-Net final @0.5 | 0.028 | 0.190 | 0.363 | 97.5 % (39/40) | 1.77 s (ONNX 1.70 s); handler 1.81 s |

Los dos desacuerdos de nivel están en el borde de un corte (YOLO: 0 contra 0.10 %; U-Net: 9.98 contra 10.17 %). Los tiempos son de ESTA máquina (CPU, 2 hilos), no de AWS.

## 4. Despliegue por contexto de CDK

Defaults = estado de producción (U-Net). Sin flags: `model_type=unet`, `model_key=unet/unet_final_1024.onnx`. Para YOLO: `-c model_type=yolo` (clave por defecto `yolo/yolo_final_ep80_1024.onnx`). La clave debe colgar del prefijo del modelo (el IAM de la Lambda es `s3:GetObject` solo sobre `unet/*` y `yolo/*`). `-c model_sha256=<hex>` agrega la verificación de integridad.

## 5. Antes de cualquier `cdk diff`/`deploy`

**NO borrar `__pycache__`** de `lambda_src/inference/layer` ni de `lambda_src/api_puntos`: CDK incluye esos archivos en el hash del asset y el despliegue anterior los subió; borrarlos hace que `cdk diff` REEMPLACE la capa y cambie `api_puntos`. La carpeta de la capa debe ser idéntica a la desplegada (se puede comparar bajando la versión 2 con `aws lambda get-layer-version`, solo lectura). Además, la descripción de la capa en el código lleva un `?` literal (la plantilla desplegada lo tiene así por un problema de codificación en Windows): cambiarlo también reemplaza la capa.

`npx aws-cdk diff --profile pf-corrosion` debe mostrar SOLO:

- `CorriaStorageStack`: `[+]` bucket `ModelsBucket` (`pf-corrosion-models-234329974788`, versionado, SSL, privado), su `BucketPolicy` y 2 outputs de exportación.
- `CorriaComputeStack`: `[~]` `InferenceFunction` (código, `MemorySize` 1024 a 3008, variables nuevas `MODEL_TYPE`, `MODEL_BUCKET`, `MODEL_KEY`, `CONF_MINIMA`, `UNET_THRESHOLD`) y `[~]` la política del rol de inferencia (`s3:GetObject` sobre `unet/*` y `yolo/*`).
- Sin cambios: Auth, tablas, bucket de imágenes, API, demás Lambdas y la capa (en el diff con change set aparece `Layers`/`Role` como "known after apply" en la función: es un artefacto, `--method=template` no lo muestra).

## 6. Pasos de despliegue (cada paso pide OK del dueño)

Todos con `--profile pf-corrosion`.

1. **Bucket de modelos** (solo Storage; no toca el cómputo): `npx aws-cdk deploy CorriaStorageStack --exclusively --profile pf-corrosion`.
2. **Subir YOLO** (antes de desplegar el cómputo, para que la Lambda nueva nunca esté sin modelo):
   ```bash
   aws s3 cp ~/projects/corrosion-ml/4_corrida3/modelos/yolo_final_ep80_1024.onnx \
       s3://pf-corrosion-models-234329974788/yolo/yolo_final_ep80_1024.onnx --profile pf-corrosion
   aws s3api head-object --bucket pf-corrosion-models-234329974788 --key yolo/yolo_final_ep80_1024.onnx --profile pf-corrosion   # 13518623 bytes
   ```
3. **Cómputo en modo YOLO**: `npx aws-cdk deploy CorriaComputeStack --exclusively --profile pf-corrosion -c model_type=yolo -c model_sha256=b622273789549cfc004c43e10050207331aff105990d7bbee9704a6bb08b24f3`. Prueba de humo (sección 7). Reemplaza al YOLO viejo (`produccion_v3`, umbral 0.4, niveles 0/10/30) de inmediato.
4. **Medir YOLO** (sección 7).
5. **Subir la U-Net**:
   ```bash
   aws s3 cp ~/projects/corrosion-ml/4_corrida3/modelos/unet_final_1024.onnx \
       s3://pf-corrosion-models-234329974788/unet/unet_final_1024.onnx --profile pf-corrosion
   aws s3api head-object --bucket pf-corrosion-models-234329974788 --key unet/unet_final_1024.onnx --profile pf-corrosion       # 97738399 bytes
   ```
6. **Cómputo en modo U-Net** (el estado por defecto del código, sin flags de modelo): `npx aws-cdk deploy CorriaComputeStack --exclusively --profile pf-corrosion -c model_sha256=2537740fc0dd6c10607f241a071dd263116a0dea6e41bdc9e828f465f535b11a`. Prueba de humo y medición (sección 7). Para que el sha256 quede permanente, fijar `"model_sha256"` en `cdk.json` en un commit (sin él, un `cdk deploy` sin flag deja la Lambda sin verificación de integridad, que es opcional).
7. **Retirar YOLO del bucket** (está versionado: borrar TODAS las versiones, no solo agregar un marcador de borrado):
   ```bash
   aws s3api list-object-versions --bucket pf-corrosion-models-234329974788 --prefix yolo/ --profile pf-corrosion \
       --query '[Versions,DeleteMarkers][][].[Key,VersionId]' --output text
   aws s3api delete-object --bucket pf-corrosion-models-234329974788 --key yolo/yolo_final_ep80_1024.onnx --version-id <VersionId> --profile pf-corrosion
   ```
8. **Limpieza de código** (commit aparte, después del estudio): quitar `yolo_model.py`, la rama `yolo` de `model_store`/handler, `export_yolo_onnx.py`, el permiso `yolo/*` y el contexto `yolo` de `compute_stack.py`, y desplegar de nuevo.

## 7. Prueba de humo y medición de latencia

- Subir una foto conocida desde la web: la respuesta trae `"modelo": "yolo:yolo_final_ep80_1024.onnx"` (o `unet:unet_final_1024.onnx`), `area_corroida_pct` sobre la foto completa y `nivel_corrosion` con los cortes 0.05 / 10 / 25.
- Una foto de móvil con orientación EXIF debe verse y segmentarse derecha.
- Una línea `TIEMPOS_INFERENCIA {...}` por solicitud en `/aws/lambda/pf-corrosion-inference`: `modelo`, `arranque_en_frio`, `descarga_ms`, `carga_ms` (ambas 0 en caliente), `inferencia_ms` (preproceso + ONNX + postproceso, sin descarga ni carga), `onnx_ms` (solo `session.run`), `modelo_total_ms`, `total_ms` (todo el handler: validación, clima, S3, DynamoDB), `status`, `foto_px`. Solo se escribe si la solicitud llegó a inferir.
  ```bash
  aws logs filter-log-events --log-group-name /aws/lambda/pf-corrosion-inference --filter-pattern TIEMPOS_INFERENCIA \
      --start-time <epoch_ms> --profile pf-corrosion --query 'events[].message' --output text
  ```
- La línea `REPORT` de cada invocación da `Duration`, `Init Duration` y `Max Memory Used` (esperado ~1,2 GB con U-Net). El tiempo que percibe el usuario además incluye API Gateway y la red.
- Para una medición justa: mismas fotos y repeticiones con cada modelo; la primera tras cada despliegue (o tras ~15 min sin uso) es en frío.

## 8. Reversión

- Cambiar de modelo = volver a desplegar con otro `-c model_type`/`-c model_key` (el archivo del modelo debe seguir en el bucket).
- Rápida, sin CDK: en la consola de Lambda cambiar `MODEL_TYPE` y `MODEL_KEY` juntos. Por CLI hay que enviar TODAS las variables (`get-function-configuration` y `update-function-configuration`). Después alinear CDK para que el siguiente despliegue no lo deshaga.
- Volver a la Lambda anterior (YOLO viejo empaquetado) exige una rama anterior: `chore/remove-orphans` (166458f) es el estado desplegado antes de este cambio.
- Las mediciones guardadas siguen siendo válidas con cualquier modelo; `modelo` indica con cuál se hizo cada una. Las anteriores a este cambio usaron los niveles 0/10/30 y el umbral 0.4 de YOLO: no se recalculan.

## 9. Diagnóstico

- `AccessDenied` al bajar el modelo: el permiso es solo `s3:GetObject` (sin `ListBucket`), así que una clave mal escrita también da `AccessDenied` y no `NoSuchKey`. Revisar `MODEL_KEY` y que el objeto exista bajo `unet/` o `yolo/`.
- `does not match MODEL_SHA256`: el archivo subido no es el exportado; subirlo de nuevo.
- `The ONNX model expects input ...`: se subió un ONNX con otro tamaño de entrada (debe ser 1x3x1024x1024).
- Timeout (30 s) en frío: improbable (descarga de ~98 MB en la misma región + carga ~1 s); si ocurre, ver `descarga_ms` y `carga_ms` en el log.
- Cambiar el modelo sin cambiar el nombre del archivo no sirve: el contenedor cachea por nombre en `/tmp`. Usar un nombre nuevo (`unet_final_v2_1024.onnx`) y cambiar `model_key`.

## 10. Pendientes que no son de esta Lambda

1. **Web y móvil**: ya no hay cambios obligatorios del contrato, pero los umbrales de nivel de la interfaz (web `KPIBar`/colores, móvil `DesignTokens.js` y `utils.js`) deben alinearse con 0.05 / 10 / 25 (fuera de alcance de esta fase).
2. **Web, texto de la confianza**: con U-Net la "confianza" es la probabilidad media de la mancha, no la de un detector. Valorar otro texto.
3. **Web, pestaña "Detección" (cajas)**: con U-Net cada caja es la envolvente de una mancha conexa; valorar ocultarla.
4. **Respuesta de las listas**: `GET /mediciones/*` devuelve `detecciones` y `mascaras` de todas las mediciones (~20-25 KB cada una con U-Net, hasta ~65 KB); 100 mediciones pueden acercarse al límite de 6 MB. Mitigación: no devolverlas en las listas.
5. **Arranque en frío**: descarga + sesión suman ~1,5 a 3 s. Se puede reducir con concurrencia aprovisionada (costo fijo); no se hizo.
6. **Compatibilidad onnxruntime**: si se actualiza la capa, repetir `scripts/parity_vs_offline.py` y las pruebas.
7. **Sincronizar al monorepo** `computer-vision-corrosion-steel/infra/` (rsync manual) solo cuando se despliegue.
