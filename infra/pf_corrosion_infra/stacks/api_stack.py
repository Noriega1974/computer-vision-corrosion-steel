"""
CorriaApiStack — API Gateway REST API.

Mirrors the source system's routing exactly (Cognito User Pools authorizer,
Lambda proxy integration — verified against the source account's
`corria-api` REST API), minus the eliminated routes:
  - all of /reportes* (api-reportes is not ported — see README)
  - /puntos/buscar (explicitly removed from api-puntos in this migration)

CORS is handled via API Gateway's default preflight support rather than
manually replicating each `/resource OPTIONS` method — every ported Lambda
already responds with `Access-Control-Allow-Origin: *`, so the preflight
config here mirrors that same wildcard-origin behavior.
"""
from aws_cdk import (
    Stack,
    aws_apigateway as apigateway,
    aws_lambda as _lambda,
    aws_cognito as cognito,
)
from constructs import Construct


class CorriaApiStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        user_pool: cognito.UserPool,
        api_usuarios_fn: _lambda.Function,
        api_puntos_fn: _lambda.Function,
        api_mediciones_fn: _lambda.Function,
        api_alertas_fn: _lambda.Function,
        inference_fn: _lambda.Function,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.api = apigateway.RestApi(
            self,
            "CorriaApi",
            rest_api_name="pf-corrosion-api",
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=apigateway.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization"],
            ),
        )

        authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self,
            "CorriaCognitoAuthorizer",
            authorizer_name="pf-corrosion-cognito-auth",
            cognito_user_pools=[user_pool],
            identity_source="method.request.header.Authorization",
        )

        usuarios_integration = apigateway.LambdaIntegration(api_usuarios_fn)
        puntos_integration = apigateway.LambdaIntegration(api_puntos_fn)
        mediciones_integration = apigateway.LambdaIntegration(api_mediciones_fn)
        alertas_integration = apigateway.LambdaIntegration(api_alertas_fn)
        inference_integration = apigateway.LambdaIntegration(inference_fn)

        # ── /usuarios ────────────────────────────────────────────────────
        usuarios = self.api.root.add_resource("usuarios")
        usuarios.add_method("GET", usuarios_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)
        usuarios.add_method("POST", usuarios_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)

        usuarios_me = usuarios.add_resource("me")
        usuarios_me.add_method("GET", usuarios_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)
        usuarios_me.add_method("PUT", usuarios_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)

        usuarios_id = usuarios.add_resource("{id_usuario}")
        usuarios_id.add_method("PUT", usuarios_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)
        usuarios_id.add_method("DELETE", usuarios_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)

        usuarios_id_eliminar = usuarios_id.add_resource("eliminar")
        usuarios_id_eliminar.add_method("DELETE", usuarios_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)

        # ── /colaborador ─────────────────────────────────────────────────
        colaborador = self.api.root.add_resource("colaborador")
        colaborador.add_method("POST", usuarios_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)

        # ── /puntos ──────────────────────────────────────────────────────
        puntos = self.api.root.add_resource("puntos")
        puntos.add_method("GET", puntos_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)
        puntos.add_method("POST", puntos_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)

        puntos_id = puntos.add_resource("{id_punto}")
        puntos_id.add_method("GET", puntos_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)
        puntos_id.add_method("PUT", puntos_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)
        puntos_id.add_method("DELETE", puntos_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)
        # Note: /puntos/buscar intentionally NOT recreated (eliminated).

        # ── /mediciones ──────────────────────────────────────────────────
        mediciones = self.api.root.add_resource("mediciones")

        mediciones_recientes = mediciones.add_resource("recientes")
        mediciones_recientes.add_method("GET", mediciones_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)

        mediciones_id = mediciones.add_resource("{id_punto}")
        mediciones_id.add_method("GET", mediciones_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)
        mediciones_id.add_method("DELETE", mediciones_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)

        # ── /medicion (inference) ────────────────────────────────────────
        medicion = self.api.root.add_resource("medicion")
        medicion.add_method("POST", inference_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)

        # ── /alertas ─────────────────────────────────────────────────────
        alertas = self.api.root.add_resource("alertas")
        alertas.add_method("GET", alertas_integration, authorization_type=apigateway.AuthorizationType.COGNITO, authorizer=authorizer)
