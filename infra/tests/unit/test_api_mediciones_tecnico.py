"""Regla del técnico en api_mediciones: solo mueve/elimina las mediciones que tomó él."""
import importlib.util
import json
from pathlib import Path

import pytest

import fakes

RUTA = Path(__file__).resolve().parents[2] / "pf_corrosion_infra" / "lambda_src" / "api_mediciones" / "handler.py"


@pytest.fixture
def h(monkeypatch):
    spec = importlib.util.spec_from_file_location("api_mediciones_tecnico_handler", RUTA)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "tabla_usuarios", fakes.FakeTabla([{"rol": "tecnico", "empresa_id": "EMP-1"}]))
    monkeypatch.setattr(mod, "tabla_empresas", fakes.FakeTabla([]))
    return mod


def _evento(metodo, resource, qp=None, body=None, sub="tec-1", punto=None):
    ev = {"httpMethod": metodo, "resource": resource, "queryStringParameters": qp,
          "requestContext": {"authorizer": {"claims": {"sub": sub}}}}
    if body is not None:
        ev["body"] = json.dumps(body)
    if punto:
        ev["pathParameters"] = {"id_punto": punto}
    return ev


def _lote(n, punto="B1", **extra):
    return {"id_punto": punto, "sk": f"MED#2026-10-{n:02d}", "id_medicion": f"MED-{n}", "empresa_id": "EMP-1", **extra}


@pytest.fixture
def ht(h, monkeypatch):
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": "tecnico", "empresa_id": "EMP-1"}]))
    h.tabla = fakes.FakeTabla([_lote(1, tomado_por_id="tec-1", usuario_id="tec-1"), _lote(2, tomado_por_id="otro", usuario_id="otro"),
                               _lote(3, usuario_id="tec-1")])
    h.s3 = fakes.FakeS3()
    h.tabla_bloques = fakes.FakeTabla([{"id_bloque": "B9", "empresa_id": "EMP-1", "nombre": "Destino"}], claves=("id_bloque",))
    return h


def _restantes(h):
    return sorted(i["id_medicion"] for i in h.tabla.items)


def test_tecnico_elimina_la_suya_y_no_la_ajena(ht):
    ok = ht.lambda_handler(_evento("DELETE", "/mediciones/{id_punto}", {"id_medicion": "MED-1"}, punto="B1"), None)
    assert ok["statusCode"] == 200
    ajena = ht.lambda_handler(_evento("DELETE", "/mediciones/{id_punto}", {"id_medicion": "MED-2"}, punto="B1"), None)
    assert ajena["statusCode"] == 403 and "MED-2" in _restantes(ht)


def test_tecnico_lote_eliminar_rechaza_todo_si_alguna_es_ajena(ht):
    items = [{"id_punto": "B1", "id_medicion": m} for m in ("MED-1", "MED-2", "MED-3")]
    r = ht.lambda_handler(_evento("POST", "/mediciones/lote/eliminar", body={"items": items}), None)
    cuerpo = json.loads(r["body"])
    assert r["statusCode"] == 403 and cuerpo["cantidad_ajenas"] == 1
    assert _restantes(ht) == ["MED-1", "MED-2", "MED-3"]   # no se borró nada
    r = ht.lambda_handler(_evento("POST", "/mediciones/lote/eliminar", body={"items": [items[0], items[2]]}), None)
    assert r["statusCode"] == 200 and json.loads(r["body"])["ok"] == ["MED-1", "MED-3"]


def test_tecnico_lote_mover_rechaza_ajenas_con_403(ht):
    items = [{"id_punto": "B1", "id_medicion": m} for m in ("MED-2", "MED-3")]
    r = ht.lambda_handler(_evento("POST", "/mediciones/lote/mover", body={"items": items, "destino_bloque_id": "B9"}), None)
    assert r["statusCode"] == 403 and json.loads(r["body"])["cantidad_ajenas"] == 1


@pytest.mark.parametrize("rol", ["admin", "super_admin"])
def test_admin_y_super_admin_siguen_borrando_cualquiera(ht, monkeypatch, rol):
    monkeypatch.setattr(ht, "tabla_usuarios", fakes.FakeTabla([{"rol": rol, "empresa_id": "EMP-1"}]))
    r = ht.lambda_handler(_evento("DELETE", "/mediciones/{id_punto}", {"id_medicion": "MED-2"}, punto="B1", sub="admin-1"), None)
    assert r["statusCode"] == 200
