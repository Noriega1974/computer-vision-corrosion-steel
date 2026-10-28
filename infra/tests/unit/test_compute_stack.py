"""Plantilla CloudFormation del stack de cómputo (síntesis local, sin AWS).

Fija que: por defecto la Lambda de inferencia sirve la U-Net final desde el
bucket de modelos con 3008 MB (la misma memoria con YOLO, para medir justo);
la clave debe colgar del prefijo del modelo; el permiso sobre el bucket de
modelos es solo s3:GetObject bajo unet/* y yolo/*.
"""
import pytest

aws_cdk = pytest.importorskip("aws_cdk")
from aws_cdk import App, Environment, assertions  # noqa: E402

from pf_corrosion_infra.stacks.auth_stack import CorriaAuthStack  # noqa: E402
from pf_corrosion_infra.stacks.compute_stack import CorriaComputeStack  # noqa: E402
from pf_corrosion_infra.stacks.storage_stack import CorriaStorageStack  # noqa: E402

ENV = Environment(account="111111111111", region="us-east-1")  # cuenta de mentira: no se despliega nada


def _plantilla(**contexto):
    app = App(context=contexto)
    auth = CorriaAuthStack(app, "A", env=ENV)
    st = CorriaStorageStack(app, "S", env=ENV)
    cp = CorriaComputeStack(
        app, "C", env=ENV,
        usuarios_table=st.usuarios_table, empresas_table=st.empresas_table,
        bloques_table=st.bloques_table, puntos_mediciones_table=st.puntos_mediciones_table,
        images_bucket=st.images_bucket, models_bucket=st.models_bucket, user_pool=auth.user_pool,
    )
    return assertions.Template.from_stack(cp)


def _inferencia(t):
    fns = t.find_resources("AWS::Lambda::Function", {"Properties": {"FunctionName": "pf-corrosion-inference"}})
    assert len(fns) == 1
    return next(iter(fns.values()))["Properties"]


def test_por_defecto_es_la_unet_final_con_3008_mb():
    p = _inferencia(_plantilla())
    assert p["MemorySize"] == 3008 and p["Timeout"] == 30
    assert "EphemeralStorage" not in p
    env = p["Environment"]["Variables"]
    assert env["MODEL_TYPE"] == "unet" and env["MODEL_KEY"] == "unet/unet_final_1024.onnx"
    assert env["CONF_MINIMA"] == "0.25" and env["UNET_THRESHOLD"] == "0.5"
    assert "MODEL_SHA256" not in env and "MODEL_BUCKET" in env
    assert not {"YOLO_IMGSZ", "UNET_MODEL_BUCKET", "UNET_MODEL_KEY"} & set(env)


def test_yolo_con_la_misma_memoria_y_su_clave():
    p = _inferencia(_plantilla(model_type="yolo", model_sha256="ab" * 32))
    env = p["Environment"]["Variables"]
    assert p["MemorySize"] == 3008
    assert env["MODEL_TYPE"] == "yolo" and env["MODEL_KEY"] == "yolo/yolo_final_ep80_1024.onnx"
    assert env["MODEL_SHA256"] == "ab" * 32


def test_clave_explicita_bajo_el_prefijo_del_modelo():
    env = _inferencia(_plantilla(model_type="yolo", model_key="yolo/otro.onnx"))["Environment"]["Variables"]
    assert env["MODEL_KEY"] == "yolo/otro.onnx"


def test_model_type_invalido_no_sintetiza():
    with pytest.raises(ValueError, match="model_type"):
        _plantilla(model_type="resnet")


def test_clave_de_otro_prefijo_no_sintetiza():
    with pytest.raises(ValueError, match="unet/"):
        _plantilla(model_key="otro/modelo.onnx")
    with pytest.raises(ValueError, match="yolo/"):
        _plantilla(model_type="yolo", model_key="unet/unet_final_1024.onnx")


def test_permiso_solo_getobject_bajo_unet_y_yolo():
    t = _plantilla()
    politicas = t.find_resources("AWS::IAM::Policy")
    sentencias = [s for pol in politicas.values() for s in pol["Properties"]["PolicyDocument"]["Statement"]]
    modelos = [s for s in sentencias if s["Action"] == "s3:GetObject"]
    assert len(modelos) == 1
    recursos = str(modelos[0]["Resource"])
    assert "/unet/*" in recursos and "/yolo/*" in recursos and "Images" not in recursos



def _sentencias_s3_de_imagenes(t):
    politicas = t.find_resources("AWS::IAM::Policy")
    return [
        s for pol in politicas.values() for s in pol["Properties"]["PolicyDocument"]["Statement"]
        if "Images" in str(s.get("Resource")) or "corria-images" in str(s.get("Resource"))
    ]


def test_inferencia_solo_toca_empresas_y_uploads_del_bucket_de_imagenes():
    # POST prefirmado: el rol firma, así que necesita PutObject en uploads/*;
    # después lee y borra. Ninguna escritura fuera de empresas/* y uploads/*
    # (api_mediciones sigue leyendo/borrando todo el bucket, como antes).
    sentencias = _sentencias_s3_de_imagenes(_plantilla())
    escrituras = [s for s in sentencias if "s3:PutObject" in str(s["Action"])]
    recursos = " ".join(str(s["Resource"]) for s in escrituras)
    assert "/uploads/*" in recursos and "/empresas/*" in recursos
    sobre_uploads = [s for s in escrituras if "/uploads/*" in str(s["Resource"])]
    assert len(sobre_uploads) == 1
    acciones = sobre_uploads[0]["Action"]
    assert "s3:PutObject" in acciones and "s3:DeleteObject*" in acciones and "s3:GetObject*" in acciones
    # ninguna sentencia de escritura cubre todo el bucket ('/*' a secas)
    assert not [s for s in escrituras if "'/*'" in str(s["Resource"])]


def test_mediciones_escribe_s3_solo_bajo_empresas_y_lee_bloques():
    t = _plantilla()
    fn = next(iter(t.find_resources("AWS::Lambda::Function", {"Properties": {"FunctionName": "pf-corrosion-api-mediciones"}}).values()))
    assert "TABLA_BLOQUES" in fn["Properties"]["Environment"]["Variables"]
    politicas = t.find_resources("AWS::IAM::Policy", {})
    pol = next(p for p in politicas.values() if "ApiMedicionesFunctionServiceRole" in str(p["Properties"]["Roles"]))
    sentencias = pol["Properties"]["PolicyDocument"]["Statement"]
    puts = [s for s in sentencias if any(a.startswith("s3:PutObject") for a in ([s["Action"]] if isinstance(s["Action"], str) else s["Action"]))]
    assert len(puts) == 1 and "/empresas/*" in str(puts[0]["Resource"])


def _politica(t, rol):
    politicas = t.find_resources("AWS::IAM::Policy", {})
    pol = next(p for p in politicas.values() if rol in str(p["Properties"]["Roles"]))
    return pol["Properties"]["PolicyDocument"]["Statement"]


def _acciones(s):
    return [s["Action"]] if isinstance(s["Action"], str) else s["Action"]


def test_logo_y_portada_leen_y_borran_solo_bajo_su_prefijo():
    t = _plantilla()
    for rol, patron in [("ApiUsuariosFunctionServiceRole", "/empresas/*/logo/*"),
                        ("ApiPuntosFunctionServiceRole", "/empresas/*/*/portada/*")]:
        s3_stmts = [s for s in _politica(t, rol) if any(a.startswith("s3:") for a in _acciones(s))]
        lectura = [s for s in s3_stmts if any(a.startswith("s3:GetObject") for a in _acciones(s))]
        borrado = [s for s in s3_stmts if any(a.startswith("s3:DeleteObject") for a in _acciones(s))]
        assert len(lectura) == 1 and patron in str(lectura[0]["Resource"])
        assert len(borrado) == 1 and patron in str(borrado[0]["Resource"])
        # ninguna sentencia da lectura/borrado sobre todo el bucket
        assert not [s for s in lectura + borrado if "'/*'" in str(s["Resource"])]
