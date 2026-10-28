"""GET /mediciones/{id_punto}?id_medicion=X: una sola medicion (completa), aunque sea antigua."""
import importlib.util
import json
from pathlib import Path

import pytest

import fakes

RUTA = Path(__file__).resolve().parents[2] / "pf_corrosion_infra" / "lambda_src" / "api_mediciones" / "handler.py"


class TablaEspia(fakes.FakeTabla):
    def __init__(self, items):
        super().__init__(items)
        self.kwargs = []

    def query(self, **kw):
        self.kwargs.append(kw)
        return {"Items": [dict(i) for i in self.items]}


@pytest.fixture
def h(monkeypatch):
    spec = importlib.util.spec_from_file_location("api_mediciones_detalle_handler", RUTA)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    item = {"id_punto": "BLQ-1", "sk": "MED#2025-01-01", "id_medicion": "MED-1", "empresa_id": "EMP-1",
            "mascaras": [1], "s3_key_imagen": "empresas/EMP-1/BLQ-1/MED-1.jpg"}
    monkeypatch.setattr(mod, "tabla", TablaEspia([item]))
    monkeypatch.setattr(mod, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1"}]))
    monkeypatch.setattr(mod, "_agregar_url_imagen", lambda items: items)
    return mod


def _get(h, **qp):
    return h.lambda_handler({"httpMethod": "GET", "resource": "/mediciones/{id_punto}",
                             "pathParameters": {"id_punto": "BLQ-1"}, "queryStringParameters": qp,
                             "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}, None)


def test_id_medicion_filtra_pagina_al_maximo_y_devuelve_el_item_completo(h):
    r = _get(h, id_medicion="MED-1")
    cuerpo = json.loads(r["body"])
    assert [m["id_medicion"] for m in cuerpo["mediciones"]] == ["MED-1"]
    assert cuerpo["mediciones"][0]["mascaras"] == [1]  # sin ?resumen: campos pesados incluidos
    kw = h.tabla.kwargs[0]
    assert kw["Limit"] == h.LIMITE_PUNTO_MAX and "FilterExpression" in kw


def test_sin_id_medicion_sigue_igual(h):
    _get(h, limite="10")
    kw = h.tabla.kwargs[0]
    assert kw["Limit"] == 10
