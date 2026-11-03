"""POST /colaborador scopes the new collaborator to a company (empresa_id),
mirroring POST /usuarios. Everything local: DynamoDB and Cognito are fakes."""
import json

import pytest

import fakes
from test_borrados_robustos import CognitoFalso, _cargar

EMPRESA = {"id_empresa": "EMP-1", "nombre": "Acme", "activa": True}
EMPRESA_INACTIVA = {"id_empresa": "EMP-2", "nombre": "Vieja", "activa": False}


class CognitoCrea(CognitoFalso):
    def admin_create_user(self, **kw):
        self.llamadas.append(("admin_create_user", kw["Username"]))
        return {"User": {"Attributes": [{"Name": "sub", "Value": "sub-nuevo"}]}}

    def admin_set_user_password(self, **kw):
        self.llamadas.append(("admin_set_user_password", kw["Username"]))

    def admin_add_user_to_group(self, **kw):
        self.llamadas.append(("admin_add_user_to_group", kw["Username"]))


@pytest.fixture
def u(monkeypatch):
    mod = _cargar("api_usuarios_colab_empresa", "api_usuarios", monkeypatch)
    monkeypatch.setattr(mod, "tabla", fakes.FakeTabla())
    monkeypatch.setattr(mod, "tabla_empresas", fakes.FakeTabla([EMPRESA, EMPRESA_INACTIVA]))
    monkeypatch.setattr(mod, "cognito", CognitoCrea())
    return mod


def _post(rol_grupo, **extra):
    body = {"nickname": "colab01", "password": "Clave1234", "dias": 7, "rol": "tecnico", **extra}
    return {"httpMethod": "POST", "resource": "/colaborador", "body": json.dumps(body),
            "requestContext": {"authorizer": {"claims": {"sub": "s", "email": "a@x.co", "cognito:groups": rol_grupo}}}}


def _como(u, monkeypatch, rol, empresa_id=None):
    monkeypatch.setattr(u, "_usuario_actual", lambda ev: {"id_usuario": "C", "rol": rol, "empresa_id": empresa_id})


def test_admin_hereda_la_empresa_del_creador(u, monkeypatch):
    _como(u, monkeypatch, "admin", "EMP-1")
    r = u.lambda_handler(_post("admin"), None)
    assert r["statusCode"] == 201, r["body"]
    assert u.tabla.escritos[0]["empresa_id"] == "EMP-1"


def test_admin_no_puede_elegir_otra_empresa_por_body(u, monkeypatch):
    _como(u, monkeypatch, "admin", "EMP-1")
    r = u.lambda_handler(_post("admin", empresa_id="EMP-9"), None)
    assert r["statusCode"] == 201
    assert u.tabla.escritos[0]["empresa_id"] == "EMP-1"


def test_super_admin_debe_enviar_empresa_id(u, monkeypatch):
    _como(u, monkeypatch, "super_admin")
    r = u.lambda_handler(_post("super_admin"), None)
    assert r["statusCode"] == 400
    assert u.cognito.llamadas == [] and u.tabla.escritos == []


@pytest.mark.parametrize("empresa_id", ["EMP-NO-EXISTE", "EMP-2"])
def test_super_admin_empresa_inexistente_o_inactiva_es_400_sin_tocar_cognito(u, monkeypatch, empresa_id):
    _como(u, monkeypatch, "super_admin")
    r = u.lambda_handler(_post("super_admin", empresa_id=empresa_id), None)
    assert r["statusCode"] == 400
    assert u.cognito.llamadas == [] and u.tabla.escritos == []


def test_super_admin_con_empresa_valida_la_guarda(u, monkeypatch):
    _como(u, monkeypatch, "super_admin")
    r = u.lambda_handler(_post("super_admin", empresa_id="EMP-1"), None)
    assert r["statusCode"] == 201, r["body"]
    assert u.tabla.escritos[0]["empresa_id"] == "EMP-1"


def test_colaborador_super_admin_no_lleva_empresa(u, monkeypatch):
    _como(u, monkeypatch, "super_admin")
    r = u.lambda_handler(_post("super_admin", rol="super_admin"), None)
    assert r["statusCode"] == 201, r["body"]
    assert "empresa_id" not in u.tabla.escritos[0]
