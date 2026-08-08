"""
CorriaComputeStack — 5 Lambda functions (api-reportes was eliminated, not
ported — see README).

IAM is scoped per function to the minimum actually used by its handler code:
  - pf-corrosion-api-usuarios:    read/write on `usuarios` table + narrow
                                   Cognito admin-* actions on the user pool.
  - pf-corrosion-api-puntos:      read/write on the fused table only.
  - pf-corrosion-api-mediciones:  read/write on the fused table only.
  - pf-corrosion-api-alertas:     READ-ONLY on the fused table (the handler
                                   only calls `tabla.query` — no writes).
  - pf-corrosion-inference:       read/write on the fused table + S3
                                   read/write on the images bucket.
                                   CRITICAL SECURITY FIX vs. source: the
                                   source account's inference Lambda role had
                                   full read/write on ALL THREE tables
                                   (corria-puntos, corria-mediciones,
                                   corria-usuarios) plus a leftover
                                   USER_POOL_ID env var, even though its
                                   handler code never touches usuarios or
                                   Cognito at all (verified by inspecting the
                                   deployed source function's env vars and by
                                   grepping the ported handler). This stack
                                   grants it ONLY the fused table + S3 —
                                   nothing on usuarios, no USER_POOL_ID.
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
                "USER_POOL_ID": user_pool.user_pool_id,
            },
        )
        usuarios_table.grant_read_write_data(self.api_usuarios_fn)
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
            },
        )
        puntos_mediciones_table.grant_read_write_data(self.api_puntos_fn)

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
                "BUCKET_NAME": images_bucket.bucket_name,
            },
        )
        puntos_mediciones_table.grant_read_write_data(self.api_mediciones_fn)
        images_bucket.grant_read_write(self.api_mediciones_fn)

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
            },
        )
        puntos_mediciones_table.grant_read_data(self.api_alertas_fn)

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
            code=_lambda.Code.from_asset(os.path.join(LAMBDA_SRC, "inference")),
            layers=[inference_deps_layer],
            memory_size=1024,
            timeout=Duration.seconds(30),
            environment={
                **common_env,
                "TABLA_PUNTOS": puntos_mediciones_table.table_name,
                "TABLA_MEDICIONES": puntos_mediciones_table.table_name,
                "BUCKET_NAME": images_bucket.bucket_name,
                # Intentionally NO TABLA_USUARIOS, NO USER_POOL_ID — see
                # security fix note in this module's docstring.
            },
        )
        puntos_mediciones_table.grant_read_write_data(self.inference_fn)
        images_bucket.grant_read_write(self.inference_fn)
        # Intentionally NOT granted: usuarios_table access, Cognito actions.

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
