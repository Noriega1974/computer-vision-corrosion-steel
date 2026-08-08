#!/usr/bin/env python3
"""
pf-corrosion-infra — CDK app entry point.

Deploys to the user's own AWS account ("Barney"), profile `pf-corrosion`,
account 234329974788, region us-east-1. See README.md for deploy status —
as of this scaffold, `cdk deploy` has NOT been run.
"""
import aws_cdk as cdk

from pf_corrosion_infra.stacks.auth_stack import CorriaAuthStack
from pf_corrosion_infra.stacks.storage_stack import CorriaStorageStack
from pf_corrosion_infra.stacks.compute_stack import CorriaComputeStack
from pf_corrosion_infra.stacks.api_stack import CorriaApiStack

app = cdk.App()

env = cdk.Environment(account="234329974788", region="us-east-1")

auth_stack = CorriaAuthStack(app, "CorriaAuthStack", env=env)

storage_stack = CorriaStorageStack(app, "CorriaStorageStack", env=env)

compute_stack = CorriaComputeStack(
    app,
    "CorriaComputeStack",
    env=env,
    usuarios_table=storage_stack.usuarios_table,
    puntos_mediciones_table=storage_stack.puntos_mediciones_table,
    images_bucket=storage_stack.images_bucket,
    user_pool=auth_stack.user_pool,
)
compute_stack.add_stack_dependency(storage_stack)
compute_stack.add_stack_dependency(auth_stack)

api_stack = CorriaApiStack(
    app,
    "CorriaApiStack",
    env=env,
    user_pool=auth_stack.user_pool,
    api_usuarios_fn=compute_stack.api_usuarios_fn,
    api_puntos_fn=compute_stack.api_puntos_fn,
    api_mediciones_fn=compute_stack.api_mediciones_fn,
    api_alertas_fn=compute_stack.api_alertas_fn,
    inference_fn=compute_stack.inference_fn,
)
api_stack.add_stack_dependency(compute_stack)

app.synth()
