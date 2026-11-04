"""Cuentas o afiliaciones desactivadas, lista blanca de roles al subir y
propiedad del punto en las Lambdas de mediciones, puntos e inferencia."""
import importlib.util
import json
from pathlib import Path

import pytest

import fakes

SRC = Path(__file__).resolve().parents[2] / "pf_corrosion_infra" / "lambda_src"

EMPRESA_OK = {"id_empresa": "EMP-1", "nombre": "Acme", "activa": True}
EMPRESA_INACTIVA = {"id_empresa": "EMP-1", "nombre": "Acme", "activa": False}


def _cargar(nombre, carpeta):
    spec = importlib.util.spec_from_file_location(nombre, SRC / carpeta / "handler.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _error(resp):
    return json.loads(resp["body"])["error"]


def _evento(metodo, resource, sub="s", **extra):
    return {"httpMethod": metodo, "resource": resource,
            "requestContext": {"authorizer": {"claims": {"sub": sub}}}, **extra}


# ── api_mediciones ───────────────────────────────────────────────────────────

@pytest.fixture
def med(monkeypatch):
    mod = _cargar("api_mediciones_cuentas", "api_mediciones")
    monkeypatch.setattr(mod, "tabla", fakes.FakeTabla([]))
    monkeypatch.setattr(mod, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1"}]))
    monkeypatch.setattr(mod, "tabla_empresas", fakes.FakeTabla([EMPRESA_OK]))
    monkeypatch.setattr(mod, "tabla_bloques", fakes.FakeTabla([{"id_bloque": "BLQ-1", "empresa_id": "EMP-1"}]))
    monkeypatch.setattr(mod, "_agregar_url_imagen", lambda items: items)
    return mod


def _listar(med, **qp):
    return med.lambda_handler(_evento("GET", "/mediciones/recientes", queryStringParameters=qp), None)


def test_mediciones_usuario_desactivado_recibe_403(med, monkeypatch):
    monkeypatch.setattr(med, "tabla_usuarios", fakes.FakeTabla([{"rol": "tecnico", "empresa_id": "EMP-1", "activo": False}]))
    r = _listar(med)
    assert r["statusCode"] == 403 and "cuenta está desactivada" in _error(r)


def test_mediciones_afiliacion_desactivada_recibe_403(med, monkeypatch):
    monkeypatch.setattr(med, "tabla_empresas", fakes.FakeTabla([EMPRESA_INACTIVA]))
    r = _listar(med)
    assert r["statusCode"] == 403 and "afiliación está desactivada" in _error(r)


def test_mediciones_super_admin_sigue_entrando_con_afiliacion_desactivada(med, monkeypatch):
    monkeypatch.setattr(med, "tabla_usuarios", fakes.FakeTabla([{"rol": "super_admin", "empresa_id": "EMP-1", "activo": False}]))
    monkeypatch.setattr(med, "tabla_empresas", fakes.FakeTabla([EMPRESA_INACTIVA]))
    assert _listar(med)["statusCode"] == 200


def test_mediciones_usuario_activo_entra(med):
    assert _listar(med)["statusCode"] == 200


@pytest.mark.parametrize("nombre", ["limit", "limite"])
def test_mediciones_acepta_limit_y_limite_en_ambos_listados(med, nombre):
    med.tabla = type("T", (fakes.FakeTabla,), {"query": lambda self, **kw: self.llamadas.append(kw) or {"Items": []}})([])
    med.tabla.llamadas = []
    _listar(med, **{nombre: "7"})
    assert med.tabla.llamadas[-1]["Limit"] == 7
    med.lambda_handler(_evento("GET", "/mediciones/{id_punto}", pathParameters={"id_punto": "BLQ-1"},
                               queryStringParameters={nombre: "9"}), None)
    assert med.tabla.llamadas[-1]["Limit"] == 9


@pytest.mark.parametrize("nombre", ["limit", "limite"])
def test_mediciones_limite_no_numerico_es_400_con_cualquier_nombre(med, nombre):
    assert _listar(med, **{nombre: "abc"})["statusCode"] == 400


def test_punto_de_otra_empresa_es_404_antes_de_consultar(med, monkeypatch):
    monkeypatch.setattr(med, "tabla_bloques", fakes.FakeTabla([{"id_bloque": "BLQ-9", "empresa_id": "EMP-2"}]))
    med.tabla.query = lambda **kw: pytest.fail("no debe consultar mediciones de otra empresa")
    r = med.lambda_handler(_evento("GET", "/mediciones/{id_punto}", pathParameters={"id_punto": "BLQ-9"}), None)
    assert r["statusCode"] == 404


def test_punto_de_otra_empresa_lo_ve_super_admin(med, monkeypatch):
    monkeypatch.setattr(med, "tabla_usuarios", fakes.FakeTabla([{"rol": "super_admin"}]))
    monkeypatch.setattr(med, "tabla_bloques", fakes.FakeTabla([{"id_bloque": "BLQ-9", "empresa_id": "EMP-2"}]))
    r = med.lambda_handler(_evento("GET", "/mediciones/{id_punto}", pathParameters={"id_punto": "BLQ-9"}), None)
    assert r["statusCode"] == 200


# ── api_puntos ───────────────────────────────────────────────────────────────

@pytest.fixture
def pun(monkeypatch):
    monkeypatch.setenv("TABLA_PUNTOS", "t-pun")
    mod = _cargar("api_puntos_cuentas", "api_puntos")
    monkeypatch.setattr(mod, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1"}]))
    monkeypatch.setattr(mod, "tabla_empresas", fakes.FakeTabla([EMPRESA_OK]))
    monkeypatch.setattr(mod, "tabla_bloques", fakes.FakeTabla([]))
    return mod


def test_puntos_usuario_desactivado_recibe_403(pun, monkeypatch):
    monkeypatch.setattr(pun, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1", "activo": False}]))
    r = pun.lambda_handler(_evento("GET", "/bloques"), None)
    assert r["statusCode"] == 403 and "cuenta está desactivada" in _error(r)


def test_puntos_afiliacion_desactivada_recibe_403(pun, monkeypatch):
    monkeypatch.setattr(pun, "tabla_empresas", fakes.FakeTabla([EMPRESA_INACTIVA]))
    r = pun.lambda_handler(_evento("GET", "/bloques"), None)
    assert r["statusCode"] == 403 and "afiliación está desactivada" in _error(r)


def test_puntos_super_admin_exento(pun, monkeypatch):
    monkeypatch.setattr(pun, "tabla_usuarios", fakes.FakeTabla([{"rol": "super_admin"}]))
    monkeypatch.setattr(pun, "tabla_empresas", fakes.FakeTabla([EMPRESA_INACTIVA]))
    assert pun.lambda_handler(_evento("GET", "/bloques"), None)["statusCode"] != 403


# ── inference ────────────────────────────────────────────────────────────────

@pytest.fixture
def inf(monkeypatch):
    import handler
    monkeypatch.setattr(handler, "tabla_usuarios", fakes.FakeTabla([{"rol": "tecnico", "empresa_id": "EMP-1"}]))
    monkeypatch.setattr(handler, "tabla_empresas", fakes.FakeTabla([EMPRESA_OK]))
    return handler


def _subida(resource):
    return {"resource": resource, "requestContext": {"authorizer": {"claims": {"sub": "s"}}},
            "body": json.dumps({"content_type": "image/jpeg", "bloque_id": "BLQ-1"})}


@pytest.mark.parametrize("resource", ["/medicion/upload-url", "/medicion"])
@pytest.mark.parametrize("usuarios", [
    [],                                                   # sin registro
    [{"rol": "cliente", "empresa_id": "EMP-1"}],
    [{"rol": "visitante", "empresa_id": "EMP-1"}],        # rol desconocido
    [{"rol": "", "empresa_id": "EMP-1"}],
    [{"empresa_id": "EMP-1"}],                            # sin rol
])
def test_inferencia_solo_roles_de_la_lista_blanca_suben(inf, monkeypatch, resource, usuarios):
    monkeypatch.setattr(inf, "tabla_usuarios", fakes.FakeTabla(usuarios))
    r = inf.lambda_handler(_subida(resource), None)
    assert r["statusCode"] == 403 and "no puede subir mediciones" in _error(r)


@pytest.mark.parametrize("resource", ["/medicion/upload-url", "/medicion"])
def test_inferencia_usuario_desactivado_recibe_403(inf, monkeypatch, resource):
    monkeypatch.setattr(inf, "tabla_usuarios", fakes.FakeTabla([{"rol": "tecnico", "empresa_id": "EMP-1", "activo": False}]))
    r = inf.lambda_handler(_subida(resource), None)
    assert r["statusCode"] == 403 and "cuenta está desactivada" in _error(r)


@pytest.mark.parametrize("resource", ["/medicion/upload-url", "/medicion"])
def test_inferencia_afiliacion_desactivada_recibe_403(inf, monkeypatch, resource):
    monkeypatch.setattr(inf, "tabla_empresas", fakes.FakeTabla([EMPRESA_INACTIVA]))
    r = inf.lambda_handler(_subida(resource), None)
    assert r["statusCode"] == 403 and "afiliación está desactivada" in _error(r)


@pytest.mark.parametrize("rol", ["admin", "tecnico", "super_admin"])
def test_inferencia_roles_permitidos_pasan_el_chequeo(inf, monkeypatch, rol):
    monkeypatch.setattr(inf, "tabla_usuarios", fakes.FakeTabla([{"rol": rol, "empresa_id": "EMP-1"}]))
    assert inf._rechazo_subida(inf._usuario_actual(_subida("/medicion"))) is None
