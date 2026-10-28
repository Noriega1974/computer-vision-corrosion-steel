"""
CorriaComputeStack — 4 Lambda functions (api-reportes and api-alertas were
eliminated, not ported/removed — see README).

IAM is scoped per function to the minimum actually used by its handler code:
  - pf-corrosion-api-usuarios:    read/write on `usuarios` and `empresas`
                                   tables, + narrow Cognito admin-* actions on
                                   the user pool, + PutObject on the images
                                   bucket restricted to `empresas/*` (folder
                                   marker created with each new empresa) and
                                   read/delete only under `empresas/*/logo/*`
                                   (company logo: presigned POST/GET).
  - pf-corrosion-api-puntos:      read/write on the fused table and on
                                   `bloques` (the /bloques CRUD lives here),
                                   READ-ONLY on `usuarios` (multi-empresa
                                   RBAC: needs to resolve the caller's
                                   empresa_id/rol via `_usuario_actual`, see
                                   handler.py) and `empresas`, + PutObject on
                                   the images bucket restricted to
                                   `empresas/*` (folder marker per bloque) and
                                   read/delete only under
                                   `empresas/*/*/portada/*` (point cover photo).
  - pf-corrosion-api-mediciones:  read/write on the fused table + READ-ONLY
                                   on `usuarios` (same RBAC need as above) and
                                   on `bloques` (validate the destination of a
                                   bulk move) + PutObject on the images bucket
                                   restricted to `empresas/*` (a move copies the
                                   photo, thumbnail and result to the new
                                   bloque prefix).
  - pf-corrosion-inference:       read/write on the fused table + S3
                                   read/write on the images bucket, only under
                                   `empresas/*` and `uploads/*` (presigned
                                   uploads of big photos) + READ-ONLY
                                   on `usuarios` (RBAC: resolve empresa_id/rol
                                   of the caller uploading a medición, block
                                   `cliente`) and on `bloques` (validate the
                                   optional bloque_id, freeze bloque_nombre
                                   on the medición). No Cognito admin-* actions and
                                   no write access to `usuarios` — this
                                   mirrors the original security fix (the
                                   source account's inference Lambda role had
                                   full read/write on ALL THREE tables plus a
                                   leftover USER_POOL_ID env var that its
                                   handler code never used); the only change
                                   here is a *read-only* grant on `usuarios`,
                                   strictly required to resolve empresa_id,
                                   never a write path back into it.
                                   Also READ-ONLY (s3:GetObject, prefixes
                                   `unet/*`, `yolo/*` and `placa/*`) on the
                                   models bucket, to download the ONNX models
                                   (main model + plate separator) at cold start.

Model selection (CDK context, all optional). The defaults are the production
state: U-Net final, no flags needed. YOLO exists only to time it against the
U-Net on the same infrastructure (docs/runbook_unet.md):
  -c model_type=unet|yolo        MODEL_TYPE env of the inference Lambda
  -c model_key=<prefix>/<file>   S3 key inside the models bucket; the prefix
                                 must match model_type (IAM is scoped to it)
  -c model_sha256=<hex>          optional integrity check after the download
Plate separator (secondary ONNX; the U-Net % is computed over the plate, with
the whole photo as fallback; ignored by YOLO). On by default:
  -c plate_model_key=<placa/file>  PLATE_MODEL_KEY; must live under placa/.
                                   `none` (or `off`) disables the separator:
                                   the env var is not set and the Lambda
                                   behaves as before
  -c plate_model_sha256=<hex>      PLATE_MODEL_SHA256; defaults to the sha256 of
                                   the default separator, `none` skips the check
The Lambda memory is fixed at 3008 MB for both models (fair timing).
"""
import os

from aws_cdk import (
    Stack,
    Duration,
    aws_lambda as _lambda,
    aws_events as events,
    aws_events_targets as targets,
    aws_dynamodb as dynamodb,
    aws_cognito as cognito,
    aws_s3 as s3,
    aws_iam as iam,
)
from constructs import Construct

LAMBDA_SRC = os.path.join(os.path.dirname(__file__), "..", "lambda_src")

MODEL_TYPES = ("yolo", "unet")
DEFAULT_MODEL_TYPE = "unet"
DEFAULT_MODEL_KEYS = {
    "unet": "unet/unet_final_1024.onnx",
    "yolo": "yolo/yolo_final_ep80_1024.onnx",
}
# Plate separator (placa_model.py): second ONNX, under its own S3 prefix.
PLATE_MODEL_PREFIX = "placa/"
DEFAULT_PLATE_MODEL_KEY = "placa/separador_placa_v1_512.onnx"
DEFAULT_PLATE_MODEL_SHA256 = "a09b08692ae1ae0e3f3b722ecb40b290b8647356f6d1eeb1d50e83d31d4dadc3"
_DISABLED = ("none", "off", "false", "0", "")
# Lambda CPU scales with memory (~1 vCPU per 1769 MB). The U-Net peaks at
# ~1.2 GB RSS; 3008 MB gives ~1.7 vCPU and ~2x memory headroom. The same value
# is used for YOLO so the latency comparison is fair.
INFERENCE_MEMORY_MB = 3008
# Decision thresholds (definitive values from the final evaluation).
CONF_MINIMA = "0.25"      # YOLO confidence
UNET_THRESHOLD = "0.5"    # U-Net probability


class CorriaComputeStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        usuarios_table: dynamodb.Table,
        empresas_table: dynamodb.Table,
        bloques_table: dynamodb.Table,
        puntos_mediciones_table: dynamodb.Table,
        images_bucket: s3.Bucket,
        models_bucket: s3.Bucket,
        user_pool: cognito.UserPool,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        region = Stack.of(self).region
        common_env = {"REGION": region}

        # ── Model selection (context, see module docstring) ──────────────
        model_type = str(self.node.try_get_context("model_type") or DEFAULT_MODEL_TYPE).strip().lower()
        if model_type not in MODEL_TYPES:
            raise ValueError(f"context model_type must be one of {MODEL_TYPES}, got {model_type!r}")
        model_key = str(self.node.try_get_context("model_key") or DEFAULT_MODEL_KEYS[model_type])
        if not model_key.startswith(f"{model_type}/"):
            raise ValueError(
                f"context model_key must live under the {model_type}/ prefix for model_type={model_type} "
                "(IAM is scoped to the unet/ and yolo/ prefixes)"
            )
        model_sha256 = str(self.node.try_get_context("model_sha256") or "")

        # Plate separator: enabled by default; `-c plate_model_key=none` turns it off.
        plate_ctx = self.node.try_get_context("plate_model_key")
        plate_key = DEFAULT_PLATE_MODEL_KEY if plate_ctx is None else str(plate_ctx).strip()
        if plate_key.lower() in _DISABLED:
            plate_key = ""
        elif not plate_key.startswith(PLATE_MODEL_PREFIX):
            raise ValueError(
                f"context plate_model_key must live under the {PLATE_MODEL_PREFIX} prefix "
                "(IAM is scoped to the unet/, yolo/ and placa/ prefixes)"
            )
        plate_sha_ctx = self.node.try_get_context("plate_model_sha256")
        plate_sha256 = DEFAULT_PLATE_MODEL_SHA256 if plate_sha_ctx is None else str(plate_sha_ctx).strip()
        if plate_sha256.lower() in _DISABLED:
            plate_sha256 = ""

        # ── api-usuarios ─────────────────────────────────────────────────
        self.api_usuarios_fn = _lambda.Function(
            self,
            "ApiUsuariosFunction",
            function_name="pf-corrosion-api-usuarios",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.lambda_handler",
            code=_lambda.Code.from_asset(os.path.join(LAMBDA_SRC, "api_usuarios")),
            memory_size=128,
            timeout=Duration.seconds(30),
            environment={
                **common_env,
                "TABLA_USUARIOS": usuarios_table.table_name,
                "TABLA_EMPRESAS": empresas_table.table_name,
                "TABLA_PUNTOS_MEDICIONES": puntos_mediciones_table.table_name,
                "USER_POOL_ID": user_pool.user_pool_id,
                "BUCKET_NAME": images_bucket.bucket_name,
            },
        )
        usuarios_table.grant_read_write_data(self.api_usuarios_fn)
        # POST /empresas deja un marcador vacío `empresas/{id_empresa}/` en el
        # bucket (carpeta lógica de la empresa). Solo PutObject y solo bajo
        # ese prefijo — nunca lectura ni borrado del bucket.
        images_bucket.grant_put(self.api_usuarios_fn, "empresas/*")
        # Logo de la empresa (`empresas/{id}/logo/*`): la subida es un POST
        # prefirmado (lo firma este rol, cubierto por el PutObject de arriba);
        # además lee (GET prefirmado, HEAD al fijar) y borra el logo anterior,
        # solo bajo ese prefijo.
        images_bucket.grant_read(self.api_usuarios_fn, "empresas/*/logo/*")
        images_bucket.grant_delete(self.api_usuarios_fn, "empresas/*/logo/*")
        # Lectura: verificar que un empresa_id exista al crear un usuario con
        # empresa explícita (super_admin). Escritura: POST /empresas (crear
        # empresas nuevas), restringido a super_admin dentro del handler.
        empresas_table.grant_read_write_data(self.api_usuarios_fn)
        # Solo necesita chequear (vía usuario-timestamp-index) si el usuario
        # a eliminar permanentemente tiene puntos/mediciones asociados, para
        # bloquear el borrado en vez de dejarlos huérfanos — nunca escribe acá.
        puntos_mediciones_table.grant_read_data(self.api_usuarios_fn)
        # Narrow Cognito admin-* actions actually used by the handler
        # (create/delete/enable/disable users, set password, group
        # membership) — mirrors the scoping used in the source account,
        # does not widen it to cognito-idp:*.
        self.api_usuarios_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "cognito-idp:AdminCreateUser",
                    "cognito-idp:AdminDeleteUser",
                    "cognito-idp:AdminEnableUser",
                    "cognito-idp:AdminDisableUser",
                    "cognito-idp:AdminSetUserPassword",
                    "cognito-idp:AdminAddUserToGroup",
                    "cognito-idp:AdminRemoveUserFromGroup",
                    "cognito-idp:AdminUserGlobalSignOut",
                ],
                resources=[user_pool.user_pool_arn],
            )
        )

        # ── api-puntos ───────────────────────────────────────────────────
        self.api_puntos_fn = _lambda.Function(
            self,
            "ApiPuntosFunction",
            function_name="pf-corrosion-api-puntos",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.lambda_handler",
            code=_lambda.Code.from_asset(os.path.join(LAMBDA_SRC, "api_puntos")),
            memory_size=128,
            timeout=Duration.seconds(30),
            environment={
                **common_env,
                "TABLA_PUNTOS": puntos_mediciones_table.table_name,
                "TABLA_USUARIOS": usuarios_table.table_name,
                "TABLA_EMPRESAS": empresas_table.table_name,
                "TABLA_BLOQUES": bloques_table.table_name,
                "BUCKET_NAME": images_bucket.bucket_name,
            },
        )
        puntos_mediciones_table.grant_read_write_data(self.api_puntos_fn)
        # RBAC multi-empresa: solo lee (resolver empresa_id/rol del caller
        # por cognito-sub-index) — nunca escribe en `usuarios`.
        usuarios_table.grant_read_data(self.api_puntos_fn)
        # Solo necesita validar que el empresa_id que manda super_admin al
        # crear un punto exista -- nunca escribe acá.
        empresas_table.grant_read_data(self.api_puntos_fn)
        # CRUD de bloques (/bloques) vive en esta misma Lambda.
        bloques_table.grant_read_write_data(self.api_puntos_fn)
        # POST /bloques deja un marcador vacío `empresas/{empresa_id}/{id_bloque}/`
        # en el bucket. Solo PutObject bajo ese prefijo.
        images_bucket.grant_put(self.api_puntos_fn, "empresas/*")
        # Foto de portada del punto (`empresas/{e}/{b}/portada/*`): POST
        # prefirmado (lo firma este rol), GET prefirmado, HEAD al fijar y
        # borrado de la anterior, solo bajo ese prefijo.
        images_bucket.grant_read(self.api_puntos_fn, "empresas/*/*/portada/*")
        images_bucket.grant_delete(self.api_puntos_fn, "empresas/*/*/portada/*")

        # ── api-mediciones ───────────────────────────────────────────────
        self.api_mediciones_fn = _lambda.Function(
            self,
            "ApiMedicionesFunction",
            function_name="pf-corrosion-api-mediciones",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.lambda_handler",
            code=_lambda.Code.from_asset(os.path.join(LAMBDA_SRC, "api_mediciones")),
            memory_size=512,
            timeout=Duration.seconds(30),
            environment={
                **common_env,
                "TABLA_MEDICIONES": puntos_mediciones_table.table_name,
                "TABLA_USUARIOS": usuarios_table.table_name,
                "TABLA_BLOQUES": bloques_table.table_name,
                "BUCKET_NAME": images_bucket.bucket_name,
            },
        )
        puntos_mediciones_table.grant_read_write_data(self.api_mediciones_fn)
        # TransactWriteItems (mover en lote) se autoriza con PutItem/DeleteItem,
        # que el grant anterior ya cubre: no hace falta otra acción IAM.
        # Solo lee: validar el punto destino de POST /mediciones/lote/mover.
        bloques_table.grant_read_data(self.api_mediciones_fn)
        # RBAC multi-empresa: solo lee `usuarios` (resolver caller) — nunca escribe.
        usuarios_table.grant_read_data(self.api_mediciones_fn)
        # Mínimo privilegio: lee (presigned GET, y origen de las copias al
        # mover) y borra objetos (DELETE y movimientos). Escribir (PutObject)
        # solo bajo `empresas/*`: el destino de las copias de un movimiento.
        images_bucket.grant_read(self.api_mediciones_fn)
        images_bucket.grant_delete(self.api_mediciones_fn)
        images_bucket.grant_put(self.api_mediciones_fn, "empresas/*")

        # ── inference ────────────────────────────────────────────────────
        # Runtime deps (onnxruntime, numpy, Pillow) ship via a Lambda Layer
        # built from lambda_src/inference/layer — see that directory's
        # requirements.txt and the project README for the build step that
        # must run before a real deploy (needs manylinux wheels, not
        # buildable inside this scaffolding session).
        inference_deps_layer = _lambda.LayerVersion(
            self,
            "InferenceDepsLayer",
            layer_version_name="pf-corrosion-inference-deps",
            code=_lambda.Code.from_asset(os.path.join(LAMBDA_SRC, "inference", "layer")),
            compatible_runtimes=[_lambda.Runtime.PYTHON_3_11],
            # NOTE: the deployed CloudFormation template holds "?" where an em dash was
            # written (a Windows encoding accident). Keep the literal "?" so cdk diff
            # does not see a description change, which would REPLACE the layer.
            description="onnxruntime, numpy, Pillow ? see requirements.txt in this asset",
        )

        self.inference_fn = _lambda.Function(
            self,
            "InferenceFunction",
            function_name="pf-corrosion-inference",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.lambda_handler",
            code=_lambda.Code.from_asset(
                os.path.join(LAMBDA_SRC, "inference"),
                # "layer" ships separately as InferenceDepsLayer above — without
                # this exclude, the function zip would duplicate its ~130MB of
                # wheels and push the function+layer combined unzipped size
                # past Lambda's 250MB hard limit.
                exclude=["layer", "__pycache__"],
            ),
            layers=[inference_deps_layer],
            memory_size=INFERENCE_MEMORY_MB,
            # 30 s = API Gateway's 29 s integration limit, rounded; a cold
            # start (download ~98 MB + session load) still fits. The ONNX is
            # cached in /tmp (512 MB default holds the main model + the 26 MB separator).
            timeout=Duration.seconds(30),
            environment={
                **common_env,
                "TABLA_MEDICIONES": puntos_mediciones_table.table_name,
                "TABLA_USUARIOS": usuarios_table.table_name,
                "TABLA_BLOQUES": bloques_table.table_name,
                "BUCKET_NAME": images_bucket.bucket_name,
                # Model selection: the ONNX is downloaded from the models
                # bucket at cold start (nothing is packaged in the zip).
                "MODEL_TYPE": model_type,
                "MODEL_BUCKET": models_bucket.bucket_name,
                "MODEL_KEY": model_key,
                **({"MODEL_SHA256": model_sha256} if model_sha256 else {}),
                # Plate separator (absent => Lambda behaves exactly as before).
                **({"PLATE_MODEL_KEY": plate_key} if plate_key else {}),
                **({"PLATE_MODEL_SHA256": plate_sha256} if plate_key and plate_sha256 else {}),
                "CONF_MINIMA": CONF_MINIMA,
                "UNET_THRESHOLD": UNET_THRESHOLD,
                # Intentionally NO USER_POOL_ID / Cognito admin-* actions —
                # see security fix note in this module's docstring. Only a
                # READ-ONLY DynamoDB grant on `usuarios` was added (RBAC:
                # resolve empresa_id/rol of the caller uploading a medición).
            },
        )
        puntos_mediciones_table.grant_read_write_data(self.inference_fn)
        # Mínimo privilegio sobre el bucket de imágenes: `empresas/*` (fotos,
        # miniaturas y resultados definitivos) y `uploads/*` (fotos que la web
        # sube con el POST prefirmado de POST /medicion/upload-url: la Lambda
        # firma con su rol, así que necesita PutObject ahí; después las lee y
        # las borra). Nada más del bucket.
        images_bucket.grant_read_write(self.inference_fn, "empresas/*")
        images_bucket.grant_read_write(self.inference_fn, "uploads/*")
        usuarios_table.grant_read_data(self.inference_fn)
        # Solo lee: validar el bloque_id opcional al crear un punto y
        # congelar bloque_nombre en la medición — nunca escribe bloques.
        bloques_table.grant_read_data(self.inference_fn)
        # Model download: GetObject only, only under unet/, yolo/ and placa/ (no
        # List, no write, no other prefix). Without s3:ListBucket a missing
        # key shows up as AccessDenied instead of NoSuchKey -- see the runbook.
        self.inference_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["s3:GetObject"],
                resources=[
                    models_bucket.arn_for_objects("unet/*"),
                    models_bucket.arn_for_objects("yolo/*"),
                    models_bucket.arn_for_objects("placa/*"),
                ],
            )
        )
        # Intentionally NOT granted: write access to usuarios_table, Cognito actions.

        # ── EventBridge cleanup rule (collaborator expiry) ──────────────────
        # Mirrors the source's corria-cleanup-colaboradores rule: invokes
        # api-usuarios with no httpMethod, which routes to _handle_cleanup().
        cleanup_rule = events.Rule(
            self,
            "CleanupColaboradoresRule",
            rule_name="pf-corrosion-cleanup-colaboradores",
            schedule=events.Schedule.rate(Duration.days(1)),
        )
        cleanup_rule.add_target(targets.LambdaFunction(self.api_usuarios_fn))
