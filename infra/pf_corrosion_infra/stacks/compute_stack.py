"""
CorriaComputeStack — 5 Lambda functions (api-reportes was eliminated, not
ported — see README).

IAM is scoped per function to the minimum actually used by its handler code:
  - pf-corrosion-api-usuarios:    read/write on `usuarios` table, READ-ONLY
                                   on the new `empresas` table (only needs to
                                   check a given empresa_id exists), + narrow
                                   Cognito admin-* actions on the user pool.
  - pf-corrosion-api-puntos:      read/write on the fused table + READ-ONLY
                                   on `usuarios` (multi-empresa RBAC: needs
                                   to resolve the caller's empresa_id/rol via
                                   `_usuario_actual`, see handler.py).
  - pf-corrosion-api-mediciones:  read/write on the fused table + READ-ONLY
                                   on `usuarios` (same RBAC need as above).
  - pf-corrosion-api-alertas:     READ-ONLY on the fused table (the handler
                                   only calls `tabla.query` — no writes) +
                                   READ-ONLY on `usuarios` (RBAC).
  - pf-corrosion-inference:       read/write on the fused table + S3
                                   read/write on the images bucket + READ-ONLY
                                   on `usuarios` (RBAC: resolve empresa_id/rol
                                   of the caller uploading a medición, block
                                   `cliente`). No Cognito admin-* actions and
                                   no write access to `usuarios` — this
                                   mirrors the original security fix (the
                                   source account's inference Lambda role had
                                   full read/write on ALL THREE tables plus a
                                   leftover USER_POOL_ID env var that its
                                   handler code never used); the only change
                                   here is a *read-only* grant on `usuarios`,
                                   strictly required to resolve empresa_id,
                                   never a write path back into it.
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


class CorriaComputeStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        usuarios_table: dynamodb.Table,
        empresas_table: dynamodb.Table,
        puntos_mediciones_table: dynamodb.Table,
        images_bucket: s3.Bucket,
        user_pool: cognito.UserPool,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        region = Stack.of(self).region
        common_env = {"REGION": region}

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
            },
        )
        usuarios_table.grant_read_write_data(self.api_usuarios_fn)
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
            },
        )
        puntos_mediciones_table.grant_read_write_data(self.api_puntos_fn)
        # RBAC multi-empresa: solo lee (resolver empresa_id/rol del caller
        # por cognito-sub-index) — nunca escribe en `usuarios`.
        usuarios_table.grant_read_data(self.api_puntos_fn)
        # Solo necesita validar que el empresa_id que manda super_admin al
        # crear un punto exista -- nunca escribe acá.
        empresas_table.grant_read_data(self.api_puntos_fn)

        # ── api-mediciones ───────────────────────────────────────────────
        self.api_mediciones_fn = _lambda.Function(
            self,
            "ApiMedicionesFunction",
            function_name="pf-corrosion-api-mediciones",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.lambda_handler",
            code=_lambda.Code.from_asset(os.path.join(LAMBDA_SRC, "api_mediciones")),
            memory_size=128,
            timeout=Duration.seconds(30),
            environment={
                **common_env,
                "TABLA_MEDICIONES": puntos_mediciones_table.table_name,
                "TABLA_USUARIOS": usuarios_table.table_name,
                "BUCKET_NAME": images_bucket.bucket_name,
            },
        )
        puntos_mediciones_table.grant_read_write_data(self.api_mediciones_fn)
        # RBAC multi-empresa: solo lee `usuarios` (resolver caller) — nunca escribe.
        usuarios_table.grant_read_data(self.api_mediciones_fn)
        # Mínimo privilegio: el handler solo lee (generate_presigned_url para
        # GET) y borra objetos (DELETE /mediciones) — nunca escribe (PutObject)
        # a este bucket, así que no le damos grant_read_write.
        images_bucket.grant_read(self.api_mediciones_fn)
        images_bucket.grant_delete(self.api_mediciones_fn)

        # ── api-alertas (read-only — handler only queries) ─────────────────
        self.api_alertas_fn = _lambda.Function(
            self,
            "ApiAlertasFunction",
            function_name="pf-corrosion-api-alertas",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.lambda_handler",
            code=_lambda.Code.from_asset(os.path.join(LAMBDA_SRC, "api_alertas")),
            memory_size=128,
            timeout=Duration.seconds(30),
            environment={
                **common_env,
                "TABLA_MEDICIONES": puntos_mediciones_table.table_name,
                "TABLA_USUARIOS": usuarios_table.table_name,
            },
        )
        puntos_mediciones_table.grant_read_data(self.api_alertas_fn)
        # RBAC multi-empresa: solo lee `usuarios` (resolver caller) — nunca escribe.
        usuarios_table.grant_read_data(self.api_alertas_fn)

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
            description="onnxruntime, numpy, Pillow — see requirements.txt in this asset",
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
            memory_size=1024,
            timeout=Duration.seconds(30),
            environment={
                **common_env,
                "TABLA_PUNTOS": puntos_mediciones_table.table_name,
                "TABLA_MEDICIONES": puntos_mediciones_table.table_name,
                "TABLA_USUARIOS": usuarios_table.table_name,
                "BUCKET_NAME": images_bucket.bucket_name,
                # Intentionally NO USER_POOL_ID / Cognito admin-* actions —
                # see security fix note in this module's docstring. Only a
                # READ-ONLY DynamoDB grant on `usuarios` was added (RBAC:
                # resolve empresa_id/rol of the caller uploading a medición).
            },
        )
        puntos_mediciones_table.grant_read_write_data(self.inference_fn)
        images_bucket.grant_read_write(self.inference_fn)
        usuarios_table.grant_read_data(self.inference_fn)
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
