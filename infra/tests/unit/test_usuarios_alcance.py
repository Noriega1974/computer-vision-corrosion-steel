"""Alcance de un admin sobre otros usuarios: solo técnicos y clientes de su
afiliación, en editar, cambiar rol, deshabilitar, reactivar y eliminar."""
import json

import pytest

import fakes
from test_borrados_robustos import CognitoFalso, TablaUsuarios, _cargar


class CognitoGrupos(CognitoFalso):
    def admin_enable_user(self, UserPoolId, Username):
        self._usuario("admin_enable_user", Username)

    def admin_add_user_to_group(self, UserPoolId, Username, GroupName):
        self._usuario("admin_add_user_to_group", Username)

    def admin_remove_user_from_group(self, UserPoolId, Username, GroupName):
        self._usuario("admin_remove_user_from_group", Username)


USUARIOS = [
    {"id_usuario": "TEC", "rol": "tecnico", "empresa_id": "EMP-1", "email": "tec@x.co"},
    {"id_usuario": "CLI", "rol": "cliente", "empresa_id": "EMP-1", "email": "cli@x.co"},
    {"id_usuario": "ADM2", "rol": "admin", "empresa_id": "EMP-1", "email": "adm2@x.co"},
    {"id_usuario": "SUP", "rol": "super_admin", "empresa_id": "EMP-1", "email": "sup@x.co"},
    {"id_usuario": "OTRO", "rol": "tecnico", "empresa_id": "EMP-2", "email": "otro@x.co"},
    {"id_usuario": "HUERF", "rol": "tecnico", "email": "huerf@x.co"},  # sin afiliación
    {"id_usuario": "DESC", "rol": "extraño", "empresa_id": "EMP-1", "email": "desc@x.co"},
]


@pytest.fixture
def u(monkeypatch):
    mod = _cargar("api_usuarios_alcance", "api_usuarios", monkeypatch)
    monkeypatch.setattr(mod, "tabla", TablaUsuarios([dict(x) for x in USUARIOS]))
    monkeypatch.setattr(mod, "tabla_puntos_mediciones", fakes.FakeTabla())
    monkeypatch.setattr(mod, "cognito", CognitoGrupos())
    return mod


def _como(u, monkeypatch, rol, empresa_id="EMP-1"):
    monkeypatch.setattr(u, "_usuario_actual", lambda ev: {"id_usuario": "YO", "rol": rol, "empresa_id": empresa_id})


def _ev(metodo, resource, objetivo, body=None):
    return {"httpMethod": metodo, "resource": resource, "pathParameters": {"id_usuario": objetivo},
            "body": json.dumps(body or {}),
            "requestContext": {"authorizer": {"claims": {"sub": "s", "email": "yo@x.co"}}}}


ACCIONES = {
    "editar": lambda o: _ev("PUT", "/usuarios/{id_usuario}", o, {"nombre": "Nuevo"}),
    "cambiar_rol": lambda o: _ev("PUT", "/usuarios/{id_usuario}", o, {"rol": "cliente"}),
    "deshabilitar": lambda o: _ev("DELETE", "/usuarios/{id_usuario}", o),
    "reactivar": lambda o: _ev("PUT", "/usuarios/{id_usuario}", o, {"reactivar": True}),
    "eliminar": lambda o: _ev("DELETE", "/usuarios/{id_usuario}/eliminar", o),
}


@pytest.mark.parametrize("accion", ACCIONES)
@pytest.mark.parametrize("objetivo", ["TEC", "CLI"])
def test_admin_gestiona_tecnicos_y_clientes_de_su_afiliacion(u, monkeypatch, accion, objetivo):
    _como(u, monkeypatch, "admin")
    r = u.lambda_handler(ACCIONES[accion](objetivo), None)
    assert r["statusCode"] == 200, r["body"]


@pytest.mark.parametrize("accion", ACCIONES)
@pytest.mark.parametrize("objetivo", ["ADM2", "SUP", "OTRO", "HUERF", "DESC"])
def test_admin_no_gestiona_a_pares_superiores_ni_ajenos(u, monkeypatch, accion, objetivo):
    _como(u, monkeypatch, "admin")
    r = u.lambda_handler(ACCIONES[accion](objetivo), None)
    assert r["statusCode"] == 403, r["body"]
    assert "técnicos y clientes de tu afiliación" in json.loads(r["body"])["error"]
    assert u.cognito.llamadas == [] and u.tabla.borrados == [] and u.tabla.actualizados == []


@pytest.mark.parametrize("accion", ACCIONES)
@pytest.mark.parametrize("objetivo", ["TEC", "HUERF"])
def test_admin_sin_afiliacion_no_gestiona_a_nadie(u, monkeypatch, accion, objetivo):
    _como(u, monkeypatch, "admin", empresa_id=None)
    r = u.lambda_handler(ACCIONES[accion](objetivo), None)
    assert r["statusCode"] == 403


@pytest.mark.parametrize("accion", ACCIONES)
@pytest.mark.parametrize("objetivo", ["ADM2", "SUP", "OTRO", "HUERF"])
def test_super_admin_gestiona_a_cualquiera(u, monkeypatch, accion, objetivo):
    _como(u, monkeypatch, "super_admin", empresa_id=None)
    r = u.lambda_handler(ACCIONES[accion](objetivo), None)
    assert r["statusCode"] == 200, r["body"]


def test_fuera_de_alcance_en_funcion_pura(u):
    admin = {"rol": "admin", "empresa_id": "EMP-1"}
    assert u._fuera_de_alcance(admin, {"rol": "tecnico", "empresa_id": "EMP-1"}) is False
    assert u._fuera_de_alcance(admin, {"rol": "admin", "empresa_id": "EMP-1"}) is True
    assert u._fuera_de_alcance({"rol": "admin"}, {"rol": "tecnico"}) is True  # None == None no cuenta
    assert u._fuera_de_alcance({"rol": "tecnico", "empresa_id": "EMP-1"}, {"rol": "cliente", "empresa_id": "EMP-1"}) is True
    assert u._fuera_de_alcance({"rol": "super_admin"}, {"rol": "super_admin"}) is False
