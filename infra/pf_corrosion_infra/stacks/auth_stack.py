"""
CorriaAuthStack — Cognito User Pool.

Same shape as the source system (email as the username attribute, password
policy) plus one addition for the multi-empresa RBAC model: a fourth group,
`super_admin` (precedence 0, NUEVO), on top of the existing admin/tecnico/
cliente groups.

No Cognito custom attribute for `empresa_id`. DynamoDB (`usuarios` table) is
the single source of truth for a user's empresa_id — every Lambda resolves
it from `cognito_sub` via the `cognito-sub-index` GSI (see
api_usuarios/handler.py `_usuario_actual`). Duplicating it into a Cognito
custom attribute would create two sources of truth for the same value that
can drift out of sync, and Cognito custom attributes are irreversible once
created on a real User Pool — not worth the risk for a field DynamoDB
already owns.
"""
from aws_cdk import (
    Stack,
    RemovalPolicy,
    Duration,
    aws_cognito as cognito,
)
from constructs import Construct


class CorriaAuthStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.user_pool = cognito.UserPool(
            self,
            "CorriaUserPool",
            user_pool_name="pf-corrosion-users",
            self_sign_up_enabled=False,
            sign_in_aliases=cognito.SignInAliases(email=True, username=False),
            sign_in_case_sensitive=False,
            auto_verify=cognito.AutoVerifiedAttrs(email=True),
            password_policy=cognito.PasswordPolicy(
                min_length=8,
                require_lowercase=True,
                require_uppercase=True,
                require_digits=True,
                require_symbols=False,
                temp_password_validity=Duration.days(7),
            ),
            mfa=cognito.Mfa.OFF,
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            removal_policy=RemovalPolicy.RETAIN,
        )

        self.user_pool_client = self.user_pool.add_client(
            "CorriaWebClient",
            user_pool_client_name="pf-corrosion-web-client",
            auth_flows=cognito.AuthFlow(user_password=True, user_srp=True),
            generate_secret=False,
        )

        # Groups implement the multi-empresa RBAC model. `super_admin` is
        # the only role that spans every empresa; precedence 0 means it wins
        # over any other group a user might also carry.
        cognito.CfnUserPoolGroup(
            self,
            "SuperAdminGroup",
            user_pool_id=self.user_pool.user_pool_id,
            group_name="super_admin",
            description="Acceso total a todas las empresas",
            precedence=0,
        )
        cognito.CfnUserPoolGroup(
            self,
            "AdminGroup",
            user_pool_id=self.user_pool.user_pool_id,
            group_name="admin",
            description="Administradores con acceso total a su propia empresa",
            precedence=1,
        )
        cognito.CfnUserPoolGroup(
            self,
            "TecnicoGroup",
            user_pool_id=self.user_pool.user_pool_id,
            group_name="tecnico",
            description="Técnicos que realizan mediciones en campo",
            precedence=2,
        )
        cognito.CfnUserPoolGroup(
            self,
            "ClienteGroup",
            user_pool_id=self.user_pool.user_pool_id,
            group_name="cliente",
            description="Clientes con acceso de solo lectura",
            precedence=3,
        )
