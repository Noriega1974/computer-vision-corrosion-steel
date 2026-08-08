"""
CorriaAuthStack — Cognito User Pool.

Mirrors the source system exactly (same shape): email as the username
attribute, password policy, and three groups (admin, tecnico, cliente).
No changes vs. the source were required here — the users/auth system stays
as-is per project decision.
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

        # Groups mirror the source system's RBAC model: admin, tecnico, cliente.
        cognito.CfnUserPoolGroup(
            self,
            "AdminGroup",
            user_pool_id=self.user_pool.user_pool_id,
            group_name="admin",
            description="Administradores con acceso total",
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
