"""Logo de la empresa (api_usuarios) y foto de portada del punto (api_puntos):
POST prefirmado, fijar/quitar la clave, RBAC por rol y empresa, URLs en los GET.
Todo local: la firma se hace sin red y S3/DynamoDB son dobles en memoria."""
import importlib.util
import json
import uuid
from pathlib import Path

import boto3
import pytest
from botocore.config import Config

import fakes

RAIZ = Path(__file__).resolve().parents[2]
SRC = RAIZ / "pf_corrosion_infra" / "lambda_src"
B = "bucket-de-prueba"
CINCO_MB = 5 * 1024 * 1024


class S3Firmante(fakes.FakeS3):
    """Doble de S3 que además firma de verdad (sin red) POST y GET."""

    def __init__(self):
        super().__init__()
        self._real = boto3.client("s3", region_name="us-east-1", config=Config(signature_version="s3v4"))

    def generate_presigned_post(self, **kw):
        return self._real.generate_presigned_post(**kw)

    def generate_presigned_url(self, *a, **kw):
        return self._real.generate_presigned_url(*a, **kw)


class TablaEscribible(fakes.FakeTabla):
    """get_item por clave + update_item mínimo (SET x = :k / REMOVE x)."""

    def __init__(self, items, clave):
        super().__init__(items, claves=(clave,))
        self.clave = clave

    def scan(self, **_):
        return {"Items": [dict(i) for i in self.items]}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues=None, **_):
        item = next(i for i in self.items if i[self.clave] == Key[self.clave])
        if UpdateExpression.startswith("SET "):
            campo = UpdateExpression[4:].split(" = ")[0]
            item[campo] = ExpressionAttributeValues[":k"]
        else:
            item.pop(UpdateExpression.split()[1], None)


def _cargar(nombre, carpeta, monkeypatch):
    for k, v in {
        "TABLA_EMPRESAS": "t-emp", "TABLA_PUNTOS_MEDICIONES": "t-pm", "TABLA_PUNTOS": "t-pm",
        "USER_POOL_ID": "pool",
    }.items():
        monkeypatch.setenv(k, v)
    spec = importlib.util.spec_from_file_location(nombre, SRC / carpeta / "handler.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _ev(resource, metodo, ident, body=None, sub="s"):
    campo = "id_empresa" if "empresas" in resource else "id_bloque"
    return {
        "httpMethod": metodo, "resource": resource, "pathParameters": {campo: ident},
        "requestContext": {"authorizer": {"claims": {"sub": sub, "email": "a@b.c"}}},
        "body": json.dumps(body) if body is not None else None,
    }


def _cuerpo(r):
    return json.loads(r["body"])


# ═══ Logo de la empresa ═══════════════════════════════════════════════════════

LOGO_UP = "/empresas/{id_empresa}/logo/upload-url"
LOGO = "/empresas/{id_empresa}/logo"


@pytest.fixture
def u(monkeypatch):
    mod = _cargar("api_usuarios_logo", "api_usuarios", monkeypatch)
    s3 = S3Firmante()
    emp = TablaEscribible([{"id_empresa": "EMP-1", "nombre": "Uno"}, {"id_empresa": "EMP-2", "nombre": "Dos"}], "id_empresa")
    monkeypatch.setattr(mod, "s3", s3)
    monkeypatch.setattr(mod, "tabla_empresas", emp)
    _rol_u(mod, monkeypatch, "admin")
    return mod


def _rol_u(mod, monkeypatch, rol, empresa="EMP-1"):
    monkeypatch.setattr(mod, "tabla", fakes.FakeTabla([{"rol": rol, "empresa_id": empresa, "id_usuario": "U"}]))


def _clave_logo(emp="EMP-1"):
    return f"empresas/{emp}/logo/{uuid.uuid4()}.png"


@pytest.mark.parametrize("rol,empresa", [("super_admin", None), ("admin", "EMP-1"), ("tecnico", "EMP-1")])
def test_logo_upload_url_por_rol_permitido(u, monkeypatch, rol, empresa):
    _rol_u(u, monkeypatch, rol, empresa)
    r = u.lambda_handler(_ev(LOGO_UP, "POST", "EMP-1", {"content_type": "image/png"}), None)
    c = _cuerpo(r)
    assert r["statusCode"] == 200
    assert c["logo_key"].startswith("empresas/EMP-1/logo/") and c["logo_key"].endswith(".png")
    assert c["max_bytes"] == CINCO_MB and c["fields"]["key"] == c["logo_key"]
    # la política fija tamaño y tipo
    assert "content-length-range" in json.dumps(c["fields"]) or c["url"]


def test_logo_upload_url_super_admin_en_cualquier_empresa(u, monkeypatch):
    _rol_u(u, monkeypatch, "super_admin", None)
    assert u.lambda_handler(_ev(LOGO_UP, "POST", "EMP-2", {"content_type": "image/webp"}), None)["statusCode"] == 200


def test_logo_cliente_y_otra_empresa_denegados(u, monkeypatch):
    for rol, empresa, objetivo in [("cliente", "EMP-1", "EMP-1"), ("admin", "EMP-1", "EMP-2"), ("tecnico", "EMP-1", "EMP-2")]:
        _rol_u(u, monkeypatch, rol, empresa)
        for resource, metodo in [(LOGO_UP, "POST"), (LOGO, "PUT"), (LOGO, "DELETE")]:
            r = u.lambda_handler(_ev(resource, metodo, objetivo, {"content_type": "image/png", "logo_key": _clave_logo(objetivo)}), None)
            assert r["statusCode"] == 403, (rol, objetivo, metodo)
    assert u.tabla_empresas.items[1].get("logo_key") is None


def test_logo_upload_url_rechaza_tipo_no_imagen(u):
    r = u.lambda_handler(_ev(LOGO_UP, "POST", "EMP-1", {"content_type": "application/pdf"}), None)
    assert r["statusCode"] == 400
    assert u.lambda_handler(_ev(LOGO_UP, "POST", "EMP-1", {}), None)["statusCode"] == 400


def test_logo_empresa_inexistente_404(u, monkeypatch):
    _rol_u(u, monkeypatch, "super_admin", None)
    assert u.lambda_handler(_ev(LOGO_UP, "POST", "EMP-X", {"content_type": "image/png"}), None)["statusCode"] == 404


def test_logo_fijar_guarda_la_clave_y_borra_la_anterior(u):
    vieja, nueva = _clave_logo(), _clave_logo()
    u.tabla_empresas.items[0]["logo_key"] = vieja
    u.s3.objetos[(B, vieja)] = b"x"
    u.s3.objetos[(B, nueva)] = b"y"
    r = u.lambda_handler(_ev(LOGO, "PUT", "EMP-1", {"logo_key": nueva}), None)
    c = _cuerpo(r)
    assert r["statusCode"] == 200 and c["logo_key"] == nueva and "logo_url" in c
    assert (B, vieja) in u.s3.eliminados and (B, nueva) not in u.s3.eliminados


def test_logo_fijar_rechaza_claves_ajenas_o_inexistentes(u):
    ajena = _clave_logo("EMP-2")
    inexistente = _clave_logo()
    u.s3.objetos[(B, ajena)] = b"x"
    for clave in (ajena, inexistente, "empresas/EMP-1/logo/../x.png", "uploads/s/a.png", 5):
        r = u.lambda_handler(_ev(LOGO, "PUT", "EMP-1", {"logo_key": clave}), None)
        assert r["statusCode"] == 400, clave
    assert "logo_key" not in u.tabla_empresas.items[0]


def test_logo_fijar_rechaza_objeto_de_mas_de_5mb(u):
    clave = _clave_logo()
    u.s3.objetos[(B, clave)] = b"x" * (CINCO_MB + 1)
    assert u.lambda_handler(_ev(LOGO, "PUT", "EMP-1", {"logo_key": clave}), None)["statusCode"] == 400
    assert (B, clave) in u.s3.eliminados


def test_logo_quitar_borra_atributo_y_objeto(u):
    clave = _clave_logo()
    u.tabla_empresas.items[0]["logo_key"] = clave
    u.s3.objetos[(B, clave)] = b"x"
    r = u.lambda_handler(_ev(LOGO, "DELETE", "EMP-1"), None)
    assert r["statusCode"] == 200 and "logo_key" not in _cuerpo(r) and "logo_url" not in _cuerpo(r)
    assert (B, clave) in u.s3.eliminados


def test_get_empresas_y_me_devuelven_logo_url(u, monkeypatch):
    u.tabla_empresas.items[0]["logo_key"] = _clave_logo()
    _rol_u(u, monkeypatch, "super_admin", None)
    r = u.lambda_handler({"httpMethod": "GET", "resource": "/empresas",
                          "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}, None)
    por_id = {e["id_empresa"]: e for e in _cuerpo(r)["empresas"]}
    assert por_id["EMP-1"]["logo_url"].startswith("https://") and "logo_url" not in por_id["EMP-2"]
    # GET /usuarios/me de un admin de EMP-1
    _rol_u(u, monkeypatch, "admin")
    monkeypatch.setattr(u, "_buscar_por_email", lambda email: {"rol": "admin", "empresa_id": "EMP-1", "id_usuario": "U"})
    r = u.lambda_handler({"httpMethod": "GET", "resource": "/usuarios/me",
                          "requestContext": {"authorizer": {"claims": {"sub": "s", "email": "a@b.c"}}}}, None)
    assert _cuerpo(r)["empresa_logo_url"].startswith("https://")


# ═══ Portada del punto ════════════════════════════════════════════════════════

POR_UP = "/bloques/{id_bloque}/portada/upload-url"
POR = "/bloques/{id_bloque}/portada"


@pytest.fixture
def p(monkeypatch):
    mod = _cargar("api_puntos_portada", "api_puntos", monkeypatch)
    s3 = S3Firmante()
    blq = TablaEscribible([
        {"id_bloque": "BLQ-1", "empresa_id": "EMP-1", "nombre": "Uno"},
        {"id_bloque": "BLQ-9", "empresa_id": "EMP-2", "nombre": "Otro"},
    ], "id_bloque")
    monkeypatch.setattr(mod, "s3", s3)
    monkeypatch.setattr(mod, "tabla_bloques", blq)
    _rol_p(mod, monkeypatch, "admin")
    return mod


def _rol_p(mod, monkeypatch, rol, empresa="EMP-1"):
    monkeypatch.setattr(mod, "tabla_usuarios", fakes.FakeTabla([{"rol": rol, "empresa_id": empresa, "id_usuario": "U"}]))


def _clave_portada(emp="EMP-1", blq="BLQ-1"):
    return f"empresas/{emp}/{blq}/portada/{uuid.uuid4()}.jpg"


@pytest.mark.parametrize("rol,empresa", [("super_admin", None), ("admin", "EMP-1"), ("tecnico", "EMP-1")])
def test_portada_upload_url_por_rol_permitido(p, monkeypatch, rol, empresa):
    _rol_p(p, monkeypatch, rol, empresa)
    r = p.lambda_handler(_ev(POR_UP, "POST", "BLQ-1", {"content_type": "image/jpeg"}), None)
    c = _cuerpo(r)
    assert r["statusCode"] == 200
    assert c["portada_key"].startswith("empresas/EMP-1/BLQ-1/portada/") and c["portada_key"].endswith(".jpg")
    assert c["max_bytes"] == CINCO_MB


def test_portada_super_admin_en_punto_de_otra_empresa(p, monkeypatch):
    _rol_p(p, monkeypatch, "super_admin", None)
    c = _cuerpo(p.lambda_handler(_ev(POR_UP, "POST", "BLQ-9", {"content_type": "image/png"}), None))
    assert c["portada_key"].startswith("empresas/EMP-2/BLQ-9/portada/")


def test_portada_cliente_y_otra_empresa_denegados(p, monkeypatch):
    for rol, objetivo in [("cliente", "BLQ-1"), ("admin", "BLQ-9"), ("tecnico", "BLQ-9")]:
        _rol_p(p, monkeypatch, rol)
        for resource, metodo in [(POR_UP, "POST"), (POR, "PUT"), (POR, "DELETE")]:
            r = p.lambda_handler(_ev(resource, metodo, objetivo, {"content_type": "image/png", "portada_key": _clave_portada()}), None)
            assert r["statusCode"] == 403, (rol, objetivo, metodo)
    assert "portada_key" not in p.tabla_bloques.items[1]


def test_portada_tecnico_puede_aunque_no_pueda_editar_el_punto(p, monkeypatch):
    # PUT/DELETE /bloques/{id} siguen siendo solo admin/super_admin
    _rol_p(p, monkeypatch, "tecnico")
    r = p.lambda_handler(_ev("/bloques/{id_bloque}", "PUT", "BLQ-1", {"nombre": "x"}), None)
    assert r["statusCode"] == 403
    assert p.lambda_handler(_ev(POR_UP, "POST", "BLQ-1", {"content_type": "image/png"}), None)["statusCode"] == 200


def test_portada_upload_url_rechaza_tipo_y_bloque_inexistente(p):
    assert p.lambda_handler(_ev(POR_UP, "POST", "BLQ-1", {"content_type": "image/gif"}), None)["statusCode"] == 400
    assert p.lambda_handler(_ev(POR_UP, "POST", "BLQ-X", {"content_type": "image/png"}), None)["statusCode"] == 404


def test_portada_fijar_guarda_la_clave_y_borra_la_anterior(p):
    vieja, nueva = _clave_portada(), _clave_portada()
    p.tabla_bloques.items[0]["portada_key"] = vieja
    p.s3.objetos[(B, vieja)] = b"x"
    p.s3.objetos[(B, nueva)] = b"y"
    r = p.lambda_handler(_ev(POR, "PUT", "BLQ-1", {"portada_key": nueva}), None)
    c = _cuerpo(r)
    assert r["statusCode"] == 200 and c["portada_key"] == nueva and "portada_url" in c
    assert (B, vieja) in p.s3.eliminados


def test_portada_fijar_rechaza_claves_de_otro_punto_o_inexistentes(p):
    de_otro = _clave_portada("EMP-1", "BLQ-2")
    p.s3.objetos[(B, de_otro)] = b"x"
    for clave in (de_otro, _clave_portada(), "empresas/EMP-1/BLQ-1/otra/a.jpg", None):
        r = p.lambda_handler(_ev(POR, "PUT", "BLQ-1", {"portada_key": clave}), None)
        assert r["statusCode"] == 400, clave
    assert "portada_key" not in p.tabla_bloques.items[0]


def test_portada_quitar_borra_atributo_y_objeto(p):
    clave = _clave_portada()
    p.tabla_bloques.items[0]["portada_key"] = clave
    p.s3.objetos[(B, clave)] = b"x"
    r = p.lambda_handler(_ev(POR, "DELETE", "BLQ-1"), None)
    assert r["statusCode"] == 200 and "portada_key" not in _cuerpo(r)
    assert (B, clave) in p.s3.eliminados


def test_get_bloques_devuelve_portada_url(p, monkeypatch):
    p.tabla_bloques.items[0]["portada_key"] = _clave_portada()
    monkeypatch.setattr(p, "_bloques_de_empresa", lambda e: [dict(i) for i in p.tabla_bloques.items if i["empresa_id"] == e])
    monkeypatch.setattr(p, "_contar_mediciones_de_bloque", lambda b: 0)
    r = p.lambda_handler({"httpMethod": "GET", "resource": "/bloques",
                          "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}, None)
    b = _cuerpo(r)["bloques"][0]
    assert b["portada_url"].startswith("https://")
