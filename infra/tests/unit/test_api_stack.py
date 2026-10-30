"""Plantilla del stack de API: la ruta de subida de fotos grandes."""
import pytest

aws_cdk = pytest.importorskip("aws_cdk")
from aws_cdk import App, Environment, assertions  # noqa: E402

from pf_corrosion_infra.stacks.api_stack import CorriaApiStack  # noqa: E402
from pf_corrosion_infra.stacks.auth_stack import CorriaAuthStack  # noqa: E402
from pf_corrosion_infra.stacks.compute_stack import CorriaComputeStack  # noqa: E402
from pf_corrosion_infra.stacks.storage_stack import CorriaStorageStack  # noqa: E402

ENV = Environment(account="111111111111", region="us-east-1")


def _stacks():
    app = App()
    auth = CorriaAuthStack(app, "A", env=ENV)
    st = CorriaStorageStack(app, "S", env=ENV)
    cp = CorriaComputeStack(
        app, "C", env=ENV,
        usuarios_table=st.usuarios_table, empresas_table=st.empresas_table,
        bloques_table=st.bloques_table, puntos_mediciones_table=st.puntos_mediciones_table,
        images_bucket=st.images_bucket, models_bucket=st.models_bucket, user_pool=auth.user_pool,
    )
    api = CorriaApiStack(
        app, "P", env=ENV, user_pool=auth.user_pool,
        api_usuarios_fn=cp.api_usuarios_fn, api_puntos_fn=cp.api_puntos_fn,
        api_mediciones_fn=cp.api_mediciones_fn, inference_fn=cp.inference_fn,
    )
    return assertions.Template.from_stack(api), assertions.Template.from_stack(st)


def test_ruta_upload_url_post_con_cognito():
    api, _ = _stacks()
    api.has_resource_properties("AWS::ApiGateway::Resource", {"PathPart": "upload-url"})
    metodos = api.find_resources("AWS::ApiGateway::Method", {"Properties": {"HttpMethod": "POST", "AuthorizationType": "COGNITO_USER_POOLS"}})
    # /medicion, /medicion/upload-url y /mediciones/{id_punto}/reanalizar apuntan a la Lambda de inferencia
    inferencia = [m for m in metodos.values() if "Inference" in str(m["Properties"]["Integration"]["Uri"])]
    assert len(inferencia) == 3


def test_bucket_cors_post_y_expiracion_de_subidas():
    _, st = _stacks()
    cors = st.find_resources("AWS::S3::Bucket", {"Properties": {"BucketName": "corria-images-111111111111"}})
    props = next(iter(cors.values()))["Properties"]
    regla = props["CorsConfiguration"]["CorsRules"][0]
    assert "POST" in regla["AllowedMethods"] and "*" not in regla["AllowedOrigins"]
    ciclo = props["LifecycleConfiguration"]["Rules"][0]
    assert ciclo["Prefix"] == "uploads/" and ciclo["ExpirationInDays"] == 1


def test_mediciones_tiene_patch_con_cognito_y_permiso_de_invocacion():
    api, _ = _stacks()
    metodos = api.find_resources("AWS::ApiGateway::Method", {"Properties": {"HttpMethod": "PATCH", "AuthorizationType": "COGNITO_USER_POOLS"}})
    assert len(metodos) == 1
    assert "Mediciones" in str(next(iter(metodos.values()))["Properties"]["Integration"]["Uri"])
    permisos = api.find_resources("AWS::Lambda::Permission", {})
    assert any("PATCH" in str(p["Properties"]["SourceArn"]) and "mediciones" in str(p["Properties"]["SourceArn"])
               for p in permisos.values())


def test_mediciones_lote_post_con_cognito():
    api, _ = _stacks()
    for parte in ("lote", "eliminar", "mover"):
        api.has_resource_properties("AWS::ApiGateway::Resource", {"PathPart": parte})
    metodos = api.find_resources("AWS::ApiGateway::Method", {"Properties": {"HttpMethod": "POST", "AuthorizationType": "COGNITO_USER_POOLS"}})
    mediciones = [m for m in metodos.values() if "Mediciones" in str(m["Properties"]["Integration"]["Uri"])]
    assert len(mediciones) == 2


def test_rutas_de_logo_y_portada_con_cognito_y_su_lambda():
    api, _ = _stacks()
    recursos = api.find_resources("AWS::ApiGateway::Resource", {})
    partes = [r["Properties"]["PathPart"] for r in recursos.values()]
    assert partes.count("logo") == 1 and partes.count("portada") == 1 and partes.count("upload-url") == 3
    metodos = api.find_resources("AWS::ApiGateway::Method", {"Properties": {"AuthorizationType": "COGNITO_USER_POOLS"}})
    def _de(lambda_, verbo):
        return [m for m in metodos.values() if m["Properties"]["HttpMethod"] == verbo and lambda_ in str(m["Properties"]["Integration"]["Uri"])]
    # logo: PUT + DELETE de empresas; portada: PUT + DELETE de bloques (ademas de los existentes)
    assert len(_de("Usuarios", "DELETE")) == 3 and len(_de("Puntos", "DELETE")) == 2
    assert len(_de("Usuarios", "POST")) >= 4 and len(_de("Puntos", "POST")) == 2


def test_ruta_reanalizar_post_con_cognito_en_la_lambda_de_inferencia():
    api, _ = _stacks()
    recursos = api.find_resources("AWS::ApiGateway::Resource", {"Properties": {"PathPart": "reanalizar"}})
    assert len(recursos) == 1
    id_recurso = next(iter(recursos))
    metodos = api.find_resources("AWS::ApiGateway::Method", {"Properties": {"HttpMethod": "POST", "AuthorizationType": "COGNITO_USER_POOLS"}})
    de_la_ruta = [m for m in metodos.values() if m["Properties"]["ResourceId"] == {"Ref": id_recurso}]
    assert len(de_la_ruta) == 1
    assert "Inference" in str(de_la_ruta[0]["Properties"]["Integration"]["Uri"])
    # el recurso cuelga de /mediciones/{id_punto}
    padre = next(iter(recursos.values()))["Properties"]["ParentId"]["Ref"]
    nodo = api.find_resources("AWS::ApiGateway::Resource", {})[padre]["Properties"]
    assert nodo["PathPart"] == "{id_punto}"
    permisos = api.find_resources("AWS::Lambda::Permission", {})
    assert any("POST" in str(p["Properties"]["SourceArn"]) and "reanalizar" in str(p["Properties"]["SourceArn"])
               for p in permisos.values())
