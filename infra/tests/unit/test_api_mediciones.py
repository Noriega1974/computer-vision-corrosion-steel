"""PATCH /mediciones/{id_punto}: renombrar la foto de una medición."""
import importlib.util
import json
from pathlib import Path

import pytest

import fakes

RAIZ = Path(__file__).resolve().parents[2]
RUTA = RAIZ / "pf_corrosion_infra" / "lambda_src" / "api_mediciones" / "handler.py"

MED = {"id_punto": "BLQ-1", "sk": "MED#2026-10-26", "id_medicion": "MED-1", "empresa_id": "EMP-1", "nombre": "viejo"}


class TablaMed(fakes.FakeTabla):
    def update_item(self, **kw):
        self.actualizado = kw
        for it in self.items:
            if it["sk"] == kw["Key"]["sk"]:
                if kw["UpdateExpression"].startswith("SET"):
                    it["nombre"] = kw["ExpressionAttributeValues"][":n"]
                else:
                    it.pop("nombre", None)


@pytest.fixture
def h(monkeypatch):
    # el handler de inferencia ya ocupa el nombre `handler` en sys.path: carga aislada
    spec = importlib.util.spec_from_file_location("api_mediciones_handler", RUTA)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "tabla", TablaMed([dict(MED)]))
    monkeypatch.setattr(mod, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1"}]))
    return mod


def _patch(nombre, id_medicion="MED-1", body=None):
    return {
        "httpMethod": "PATCH",
        "pathParameters": {"id_punto": "BLQ-1"},
        "queryStringParameters": {"id_medicion": id_medicion} if id_medicion else None,
        "requestContext": {"authorizer": {"claims": {"sub": "s"}}},
        "body": json.dumps({"nombre": nombre}) if body is None else body,
    }


def _rol(h, monkeypatch, rol, empresa="EMP-1"):
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": rol, "empresa_id": empresa}]))


def test_renombra(h):
    r = h.lambda_handler(_patch("  Placa   12\tnorte "), None)
    assert r["statusCode"] == 200
    assert json.loads(r["body"])["nombre"] == "Placa 12 norte"
    assert h.tabla.items[0]["nombre"] == "Placa 12 norte"


def test_vacio_quita_el_nombre(h):
    r = h.lambda_handler(_patch("   "), None)
    assert r["statusCode"] == 200 and json.loads(r["body"])["nombre"] == ""
    assert "nombre" not in h.tabla.items[0]
    assert h.tabla.actualizado["UpdateExpression"] == "REMOVE #n"


def test_largo_se_trunca_a_80(h):
    h.lambda_handler(_patch("a" * 200), None)
    assert h.tabla.items[0]["nombre"] == "a" * 80


@pytest.mark.parametrize("body", ["no json", "[]", "{}", '{"nombre": 5}'])
def test_body_invalido_400(h, body):
    assert h.lambda_handler(_patch("x", body=body), None)["statusCode"] == 400


def test_falta_id_medicion_400(h):
    assert h.lambda_handler(_patch("x", id_medicion=None), None)["statusCode"] == 400


@pytest.mark.parametrize("rol", ["tecnico", "cliente"])
def test_rol_sin_permiso_403(h, monkeypatch, rol):
    _rol(h, monkeypatch, rol)
    assert h.lambda_handler(_patch("x"), None)["statusCode"] == 403
    assert h.tabla.items[0]["nombre"] == "viejo"


def test_otra_empresa_404(h, monkeypatch):
    _rol(h, monkeypatch, "admin", "EMP-2")
    assert h.lambda_handler(_patch("x"), None)["statusCode"] == 404
    assert h.tabla.items[0]["nombre"] == "viejo"


def test_super_admin_ve_otras_empresas(h, monkeypatch):
    _rol(h, monkeypatch, "super_admin", "EMP-9")
    assert h.lambda_handler(_patch("x"), None)["statusCode"] == 200


def test_no_existe_404(h):
    assert h.lambda_handler(_patch("x", id_medicion="MED-zzz"), None)["statusCode"] == 404
