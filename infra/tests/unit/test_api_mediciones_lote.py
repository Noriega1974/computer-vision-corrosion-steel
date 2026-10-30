"""Paginación de GET y acciones en lote (eliminar / mover) de api_mediciones."""
import importlib.util
import json
from pathlib import Path

import pytest

import fakes

RAIZ = Path(__file__).resolve().parents[2]
RUTA = RAIZ / "pf_corrosion_infra" / "lambda_src" / "api_mediciones" / "handler.py"
B = "bucket-de-prueba"


def _med(n, punto="BLQ-1", empresa="EMP-1"):
    pref = f"empresas/{empresa}/{punto}/MED-{n}"
    return {
        "id_punto": punto, "sk": f"MED#2026-10-{n:02d}", "id_medicion": f"MED-{n}",
        "empresa_id": empresa, "bloque_id": punto, "bloque_nombre": "Viejo",
        "s3_key_imagen": f"{pref}.jpg", "s3_key_thumbnail": f"{pref}_thumb.jpg",
        "s3_key_resultado": f"{pref}.json", "mascaras": [1], "detecciones": [2],
        "area_base": "placa", "contorno_placa": {"puntos": [{"x": 0.1, "y": 0.1}]},
    }


class TablaPag(fakes.FakeTabla):
    """query() paginado de verdad: Limit cuenta ANTES del FilterExpression."""

    def __init__(self, items, filtro_empresa=None):
        super().__init__(items)
        self.llamadas = 0

    def query(self, **kw):
        self.llamadas += 1
        inicio = 0
        if "ExclusiveStartKey" in kw:
            inicio = next(i for i, it in enumerate(self.items) if it["sk"] == kw["ExclusiveStartKey"]["sk"]) + 1
        limite = kw.get("Limit", len(self.items))
        pagina = self.items[inicio:inicio + limite]
        filtro = kw.get("FilterExpression")
        if filtro is not None:
            empresa = filtro._values[1]
            devueltos = [it for it in pagina if it.get("empresa_id") == empresa]
        else:
            devueltos = pagina
        resp = {"Items": [dict(i) for i in devueltos]}
        if inicio + limite < len(self.items):
            resp["LastEvaluatedKey"] = {"sk": pagina[-1]["sk"]}
        return resp

    def delete_item(self, Key):
        self.items = [i for i in self.items if i["sk"] != Key["sk"] or i["id_punto"] != Key["id_punto"]]


class ClienteDdb:
    def __init__(self, tabla, falla=False):
        self.tabla, self.falla, self.llamadas = tabla, falla, []

    def transact_write_items(self, TransactItems):
        self.llamadas.append(TransactItems)
        if self.falla:
            raise RuntimeError("TransactionCanceledException")
        self.tabla.items = [i for i in self.tabla.items if not (
            i["id_punto"] == TransactItems[1]["Delete"]["Key"]["id_punto"] and i["sk"] == TransactItems[1]["Delete"]["Key"]["sk"])]
        self.tabla.items.append(TransactItems[0]["Put"]["Item"])


BLOQUES = [
    {"id_bloque": "BLQ-1", "empresa_id": "EMP-1", "nombre": "Punto 1"},
    {"id_bloque": "BLQ-2", "empresa_id": "EMP-1", "nombre": "Punto 2"},
    {"id_bloque": "BLQ-9", "empresa_id": "EMP-2", "nombre": "Punto otra empresa"},
    {"id_bloque": "BLQ-off", "empresa_id": "EMP-1", "nombre": "Apagado", "activo": False},
]


@pytest.fixture
def h(monkeypatch):
    spec = importlib.util.spec_from_file_location("api_mediciones_lote_handler", RUTA)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    tabla = TablaPag([_med(1), _med(2), _med(3, "BLQ-9", "EMP-2"), _med(4, "BLQ-1", "EMP-1")])
    s3 = fakes.FakeS3()
    for it in tabla.items:
        for c in ("s3_key_imagen", "s3_key_thumbnail"):
            s3.objetos[(B, it[c])] = b"jpg"
        s3.objetos[(B, it["s3_key_resultado"])] = json.dumps(
            {"id_punto": it["id_punto"], "s3_key_imagen": it["s3_key_imagen"], "x": 1}).encode()
    monkeypatch.setattr(mod, "tabla", tabla)
    monkeypatch.setattr(mod, "s3", s3)
    monkeypatch.setattr(mod, "cliente_ddb", ClienteDdb(tabla))
    monkeypatch.setattr(mod, "tabla_bloques", fakes.FakeTabla(BLOQUES, claves=("id_bloque",)))
    _rol(mod, monkeypatch, "admin")
    return mod


def _rol(h, monkeypatch, rol, empresa="EMP-1"):
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": rol, "empresa_id": empresa}]))


def _post(accion, items, **extra):
    return {
        "httpMethod": "POST", "resource": f"/mediciones/lote/{accion}",
        "requestContext": {"authorizer": {"claims": {"sub": "s"}}},
        "body": json.dumps({"items": items, **extra}),
    }


def _it(n, punto="BLQ-1"):
    return {"id_punto": punto, "id_medicion": f"MED-{n}"}


def _cuerpo(r):
    return json.loads(r["body"])


# ── Paginación ───────────────────────────────────────────────────────────────

def test_recientes_pagina_hasta_juntar_el_limite_tras_el_filtro(h, monkeypatch):
    # Las 3 primeras de cada página son de otra empresa: con Limit=2 la primera página sale vacía.
    h.tabla.items = [_med(n, "BLQ-9", "EMP-2") for n in range(1, 7)] + [_med(n) for n in range(7, 10)]
    ev = {"resource": "/mediciones/recientes", "httpMethod": "GET", "queryStringParameters": {"limit": "2"},
          "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}
    r = h.lambda_handler(ev, None)
    assert [m["id_medicion"] for m in _cuerpo(r)["mediciones"]] == ["MED-7", "MED-8"]
    assert h.tabla.llamadas > 1


def test_recientes_max_1000_y_resumen_quita_campos_pesados(h):
    ev = {"resource": "/mediciones/recientes", "httpMethod": "GET",
          "queryStringParameters": {"limit": "5000", "resumen": "1"},
          "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}
    ms = _cuerpo(h.lambda_handler(ev, None))["mediciones"]
    assert len(ms) == 3 and all("mascaras" not in m and "detecciones" not in m for m in ms)
    # el contorno pesa y se omite; area_base viaja para rotular el % en la galería
    assert all("contorno_placa" not in m and m["area_base"] == "placa" for m in ms)



def test_proyeccion_liviana_lleva_la_base_del_area_y_no_el_contorno(h):
    # DynamoDB solo devuelve lo proyectado (el doble en memoria no proyecta):
    # sin area_base la galería rotularía todo "sobre la foto".
    kw = h._proyeccion_liviana({"ExpressionAttributeNames": {"#e": "empresa_id"}})
    campos = set(kw["ExpressionAttributeNames"].values())
    assert {"area_corroida_pct", "area_base", "area_corroida_pct_foto", "empresa_id"} <= campos
    assert not campos & {"contorno_placa", "mascaras", "detecciones"}
    assert len(kw["ProjectionExpression"].split(", ")) == len(h.CAMPOS_LIVIANOS)

def test_punto_pagina_y_respeta_empresa(h):
    h.tabla.items = [_med(n, "BLQ-1", "EMP-2") for n in range(1, 6)] + [_med(n) for n in range(6, 9)]
    ev = {"httpMethod": "GET", "pathParameters": {"id_punto": "BLQ-1"}, "queryStringParameters": {"limite": "3"},
          "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}
    ms = _cuerpo(h.lambda_handler(ev, None))["mediciones"]
    assert [m["id_medicion"] for m in ms] == ["MED-6", "MED-7", "MED-8"]


# ── Eliminar en lote ─────────────────────────────────────────────────────────

def test_lote_eliminar_borra_item_y_objetos(h):
    r = h.lambda_handler(_post("eliminar", [_it(1), _it(2)]), None)
    assert r["statusCode"] == 200 and _cuerpo(r) == {"ok": ["MED-1", "MED-2"], "error": []}
    assert {i["id_medicion"] for i in h.tabla.items} == {"MED-3", "MED-4"}
    assert len(h.s3.eliminados) == 6


def test_lote_eliminar_resultado_parcial(h):
    r = h.lambda_handler(_post("eliminar", [_it(1), _it(3, "BLQ-9"), _it(99)]), None)
    c = _cuerpo(r)
    assert c["ok"] == ["MED-1"]
    assert {e["id_medicion"] for e in c["error"]} == {"MED-3", "MED-99"}
    assert any(i["id_medicion"] == "MED-3" for i in h.tabla.items)   # la de otra empresa sigue


def test_eliminar_individual_permite_tecnico(h, monkeypatch):
    _rol(h, monkeypatch, "tecnico")
    ev = {"httpMethod": "DELETE", "pathParameters": {"id_punto": "BLQ-1"},
          "queryStringParameters": {"id_medicion": "MED-1"},
          "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}
    assert h.lambda_handler(ev, None)["statusCode"] == 200
    _rol(h, monkeypatch, "cliente")
    assert h.lambda_handler(ev, None)["statusCode"] == 403


# ── Roles ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("accion", ["eliminar", "mover"])
def test_cliente_403(h, monkeypatch, accion):
    _rol(h, monkeypatch, "cliente")
    assert h.lambda_handler(_post(accion, [_it(1)], destino_bloque_id="BLQ-2"), None)["statusCode"] == 403
    assert len(h.tabla.items) == 4


def test_admin_otra_empresa_error_por_item(h, monkeypatch):
    _rol(h, monkeypatch, "admin", "EMP-2")
    c = _cuerpo(h.lambda_handler(_post("eliminar", [_it(1)]), None))
    assert c["ok"] == [] and c["error"][0]["id_medicion"] == "MED-1"
    assert len(h.tabla.items) == 4


def test_super_admin_elimina_de_otra_empresa(h, monkeypatch):
    _rol(h, monkeypatch, "super_admin", "EMP-X")
    assert _cuerpo(h.lambda_handler(_post("eliminar", [_it(3, "BLQ-9")]), None))["ok"] == ["MED-3"]


def test_usuario_sin_empresa_no_toca_nada(h, monkeypatch):
    _rol(h, monkeypatch, "tecnico", None)
    h.tabla.items.append({**_med(5), "empresa_id": None})
    c = _cuerpo(h.lambda_handler(_post("eliminar", [_it(5)]), None))
    assert c["ok"] == []


# ── Validación del body ──────────────────────────────────────────────────────

def test_mas_de_100_items_400(h):
    r = h.lambda_handler(_post("eliminar", [_it(n) for n in range(101)]), None)
    assert r["statusCode"] == 400


@pytest.mark.parametrize("body", ["no json", "[]", "{}", '{"items": []}', '{"items": [5]}', '{"items": [{"id_punto": "a"}]}'])
def test_body_invalido_400(h, body):
    ev = _post("eliminar", [])
    ev["body"] = body
    assert h.lambda_handler(ev, None)["statusCode"] == 400


def test_mover_exige_destino(h):
    assert h.lambda_handler(_post("mover", [_it(1)]), None)["statusCode"] == 400


# ── Mover ────────────────────────────────────────────────────────────────────

def test_mover_actualiza_campos_claves_y_s3(h):
    r = h.lambda_handler(_post("mover", [_it(1)], destino_bloque_id="BLQ-2"), None)
    assert _cuerpo(r) == {"ok": ["MED-1"], "error": []}
    nuevo = next(i for i in h.tabla.items if i["id_medicion"] == "MED-1")
    assert nuevo["id_punto"] == nuevo["bloque_id"] == "BLQ-2"
    assert nuevo["bloque_nombre"] == "Punto 2" and nuevo["empresa_id"] == "EMP-1"
    assert nuevo["s3_key_imagen"] == "empresas/EMP-1/BLQ-2/MED-1.jpg"
    assert nuevo["s3_key_thumbnail"] == "empresas/EMP-1/BLQ-2/MED-1_thumb.jpg"
    # objetos nuevos presentes, viejos borrados, JSON reescrito
    assert (B, nuevo["s3_key_imagen"]) in h.s3.objetos and (B, "empresas/EMP-1/BLQ-1/MED-1.jpg") not in h.s3.objetos
    res = json.loads(h.s3.objetos[(B, nuevo["s3_key_resultado"])])
    assert res["id_punto"] == "BLQ-2" and res["s3_key_imagen"] == nuevo["s3_key_imagen"] and res["x"] == 1
    # transacción: Put con attribute_not_exists + Delete con attribute_exists
    put, dele = h.cliente_ddb.llamadas[0]
    assert "attribute_not_exists" in put["Put"]["ConditionExpression"]
    assert "attribute_exists" in dele["Delete"]["ConditionExpression"]


def test_mover_misma_ubicacion_es_ok_sin_cambios(h):
    c = _cuerpo(h.lambda_handler(_post("mover", [_it(1)], destino_bloque_id="BLQ-1"), None))
    assert c["ok"] == ["MED-1"] and h.cliente_ddb.llamadas == [] and h.s3.eliminados == []


def test_mover_transaccion_fallida_quita_las_copias(h):
    h.cliente_ddb.falla = True
    c = _cuerpo(h.lambda_handler(_post("mover", [_it(1)], destino_bloque_id="BLQ-2"), None))
    assert c["ok"] == [] and c["error"][0]["id_medicion"] == "MED-1"
    assert not [k for (_, k) in h.s3.objetos if "/BLQ-2/" in k]            # copias quitadas
    assert (B, "empresas/EMP-1/BLQ-1/MED-1.jpg") in h.s3.objetos           # originales intactos
    assert any(i["id_punto"] == "BLQ-1" and i["id_medicion"] == "MED-1" for i in h.tabla.items)


def test_mover_admin_no_puede_a_otra_empresa(h):
    assert h.lambda_handler(_post("mover", [_it(1)], destino_bloque_id="BLQ-9"), None)["statusCode"] == 403


def test_mover_tecnico_propio_ok(h, monkeypatch):
    _rol(h, monkeypatch, "tecnico")
    assert _cuerpo(h.lambda_handler(_post("mover", [_it(1)], destino_bloque_id="BLQ-2"), None))["ok"] == ["MED-1"]


def test_mover_super_admin_entre_empresas_cambia_empresa_y_prefijo(h, monkeypatch):
    _rol(h, monkeypatch, "super_admin", "EMP-X")
    assert _cuerpo(h.lambda_handler(_post("mover", [_it(1)], destino_bloque_id="BLQ-9"), None))["ok"] == ["MED-1"]
    nuevo = next(i for i in h.tabla.items if i["id_medicion"] == "MED-1")
    assert nuevo["empresa_id"] == "EMP-2" and nuevo["s3_key_imagen"] == "empresas/EMP-2/BLQ-9/MED-1.jpg"


def test_mover_destino_inexistente_o_inactivo(h):
    assert h.lambda_handler(_post("mover", [_it(1)], destino_bloque_id="BLQ-zzz"), None)["statusCode"] == 404
    assert h.lambda_handler(_post("mover", [_it(1)], destino_bloque_id="BLQ-off"), None)["statusCode"] == 400


def test_mover_resultado_parcial(h):
    c = _cuerpo(h.lambda_handler(_post("mover", [_it(1), _it(99)], destino_bloque_id="BLQ-2"), None))
    assert c["ok"] == ["MED-1"] and c["error"][0]["id_medicion"] == "MED-99"
