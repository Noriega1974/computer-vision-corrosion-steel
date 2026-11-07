"""GET /mediciones/resumen-diario y GET /mediciones/{id_punto}?desde&hasta (días locales UTC-5)."""
import importlib.util
import json
from pathlib import Path

import pytest

import fakes

RUTA = Path(__file__).resolve().parents[2] / "pf_corrosion_infra" / "lambda_src" / "api_mediciones" / "handler.py"


class TablaPaginada(fakes.FakeTabla):
    """query() devuelve los ítems en páginas de `pagina` con LastEvaluatedKey y registra los kwargs."""

    def __init__(self, items, pagina=2):
        super().__init__(items)
        self.pagina = pagina
        self.kwargs = []

    def query(self, **kw):
        self.kwargs.append(kw)
        inicio = kw.get("ExclusiveStartKey", {}).get("i", 0)
        trozo = [dict(i) for i in self.items[inicio:inicio + self.pagina]]
        resp = {"Items": trozo}
        if inicio + self.pagina < len(self.items):
            resp["LastEvaluatedKey"] = {"i": inicio + self.pagina}
        return resp


def _med(ts, nivel=0, pct="0.0", lote=None, punto="BLQ-1", empresa="EMP-1"):
    it = {"id_punto": punto, "sk": f"MED#{ts}", "timestamp": ts, "nivel_corrosion": nivel,
          "area_corroida_pct": pct, "empresa_id": empresa, "id_medicion": f"MED-{ts}"}
    if lote:
        it["lote_id"] = lote
    return it


@pytest.fixture
def h(monkeypatch):
    spec = importlib.util.spec_from_file_location("api_mediciones_resumen_handler", RUTA)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1"}]))
    monkeypatch.setattr(mod, "_agregar_url_imagen", lambda items: items)
    return mod


def _poner(h, items, pagina=2):
    h.tabla = TablaPaginada(items, pagina)


def _resumen(h, **qp):
    return h.lambda_handler({"httpMethod": "GET", "resource": "/mediciones/resumen-diario",
                             "queryStringParameters": qp,
                             "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}, None)


def _valores(kw):
    """Valores literales (aplanados) de la KeyConditionExpression."""
    salida = []

    def recorrer(cond):
        for v in cond.get_expression()["values"]:
            if hasattr(v, "get_expression"):
                recorrer(v)
            elif not hasattr(v, "name"):
                salida.append(v)

    recorrer(kw["KeyConditionExpression"])
    return salida


def test_agrega_por_dia_local_con_todos_los_niveles_y_lotes(h):
    _poner(h, [
        _med("2026-10-26T15:00:00+00:00", 3, "40.5", lote="L1"),
        _med("2026-10-26T16:00:00+00:00", 0, "0.2", lote="L1"),
        _med("2026-10-26T17:00:00+00:00", 1, "3", lote="L2"),
        _med("2026-10-26T18:00:00+00:00", 0, "0"),
        _med("2026-10-27T12:00:00+00:00", 2, "12.5"),
    ])
    cuerpo = json.loads(_resumen(h, anio="2026")["body"])
    d26, d27 = cuerpo["dias"]
    promedio = d26.pop("promedio_pct")
    assert promedio == pytest.approx((40.5 + 0.2 + 3 + 0) / 4)
    assert d26 == {"fecha": "2026-10-26", "total": 4, "por_nivel": [2, 1, 0, 1],
                   "lotes": {"count": 2, "imagenes": 3}, "peor_nivel": 3, "max_pct": 40.5, "min_pct": 0,
                   "nivel_promedio": 1.0, "nivel_ponderado": 1}
    assert d27["fecha"] == "2026-10-27" and d27["por_nivel"] == [0, 0, 1, 0] and d27["lotes"] == {"count": 0, "imagenes": 0}
    assert cuerpo["totales"] == {"imagenes": 5, "lotes": 2, "imagenes_en_lotes": 3}
    assert cuerpo["truncado"] is False


def test_pagina_completa_sin_el_tope_de_1000(h):
    _poner(h, [_med(f"2026-03-05T1{i % 10}:00:00.{i:06d}+00:00") for i in range(2500)], pagina=500)
    cuerpo = json.loads(_resumen(h, anio="2026")["body"])
    assert cuerpo["totales"]["imagenes"] == 2500 and cuerpo["dias"][0]["total"] == 2500
    assert len(h.tabla.kwargs) == 5


def test_el_dia_local_es_utc_menos_5(h):
    # 03:30 UTC del 27 es 22:30 del 26 en Colombia; 05:00 UTC del 27 ya es el 27.
    _poner(h, [_med("2026-10-27T03:30:00+00:00"), _med("2026-10-27T05:00:00+00:00")])
    fechas = [d["fecha"] for d in json.loads(_resumen(h, anio="2026")["body"])["dias"]]
    assert fechas == ["2026-10-26", "2026-10-27"]


def test_limites_del_anio_y_filtro_de_empresa(h):
    _poner(h, [])
    _resumen(h, anio="2026")
    kw = h.tabla.kwargs[0]
    assert kw["IndexName"] == "tipo-timestamp-index"
    assert _valores(kw) == ["medicion", "2026-01-01T05:00:00", "2027-01-01T04:59:59.999999+00:00"]
    assert "FilterExpression" in kw  # admin: solo su empresa
    assert "#c1" in kw["ProjectionExpression"] and "mascaras" not in kw["ExpressionAttributeNames"].values()


def test_super_admin_no_filtra_por_empresa(h, monkeypatch):
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": "super_admin"}]))
    _poner(h, [])
    _resumen(h, anio="2026")
    assert "FilterExpression" not in h.tabla.kwargs[0]


def test_super_admin_puede_acotar_a_una_zona_y_los_demas_no(h, monkeypatch):
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": "super_admin"}]))
    _poner(h, [])
    _resumen(h, anio="2026", empresa_id="EMP-9")
    assert "FilterExpression" in h.tabla.kwargs[0]
    assert "EMP-9" in h.tabla.kwargs[0]["FilterExpression"].get_expression()["values"]
    # un admin no puede ver otra zona pasando empresa_id: su filtro sigue siendo el suyo
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1"}]))
    _poner(h, [])
    _resumen(h, anio="2026", empresa_id="EMP-9")
    filtro = h.tabla.kwargs[0]["FilterExpression"].get_expression()["values"]
    assert "EMP-1" in filtro and "EMP-9" not in filtro


def test_con_id_punto_usa_la_clave_primaria(h):
    _poner(h, [_med("2026-10-26T15:00:00+00:00")])
    _resumen(h, anio="2026", id_punto="BLQ-1")
    kw = h.tabla.kwargs[0]
    assert "IndexName" not in kw
    assert "MED#2026-01-01T05:00:00" in _valores(kw) and "BLQ-1" in _valores(kw)


def test_ignora_niveles_y_porcentajes_invalidos(h):
    _poner(h, [_med("2026-10-26T15:00:00+00:00", None, "nan"), _med("2026-10-26T16:00:00+00:00", 7, "x"),
               _med("2026-10-26T17:00:00+00:00", "2", "5")])
    d = json.loads(_resumen(h, anio="2026")["body"])["dias"][0]
    assert d["total"] == 3 and d["por_nivel"] == [0, 0, 1, 0] and d["peor_nivel"] == 2 and d["max_pct"] == 5


@pytest.mark.parametrize("anio", [None, "", "abc", "2025", "10000"])
def test_anio_invalido_400(h, anio):
    _poner(h, [])
    qp = {} if anio is None else {"anio": anio}
    assert _resumen(h, **qp)["statusCode"] == 400
    assert h.tabla.kwargs == []


# ── K2: ?desde&hasta ─────────────────────────────────────────────────────────

def _punto(h, **qp):
    return h.lambda_handler({"httpMethod": "GET", "resource": "/mediciones/{id_punto}",
                             "pathParameters": {"id_punto": "BLQ-1"}, "queryStringParameters": qp,
                             "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}, None)


def test_rango_de_un_dia_usa_between_en_sk_y_limite_maximo(h):
    _poner(h, [_med("2026-10-26T15:00:00+00:00")], pagina=1000)
    cuerpo = json.loads(_punto(h, desde="2026-10-26", hasta="2026-10-26", resumen="1")["body"])
    kw = h.tabla.kwargs[0]
    assert "MED#2026-10-26T05:00:00" in _valores(kw)
    assert "MED#2026-10-27T04:59:59.999999+00:00" in _valores(kw)
    assert kw["Limit"] == h.LIMITE_PUNTO_MAX + 1
    assert cuerpo["total"] == 1 and cuerpo["truncado"] is False


def test_rango_con_mas_de_500_marca_truncado(h):
    _poner(h, [_med(f"2026-10-26T15:00:00.{i:06d}+00:00") for i in range(501)], pagina=1000)
    cuerpo = json.loads(_punto(h, desde="2026-10-26", hasta="2026-10-26")["body"])
    assert cuerpo["total"] == 500 and cuerpo["truncado"] is True


@pytest.mark.parametrize("qp", [{"desde": "26-10-2026"}, {"hasta": "2026-13-40"},
                                {"desde": "2026-10-27", "hasta": "2026-10-26"}])
def test_rango_invalido_400(h, qp):
    _poner(h, [])
    assert _punto(h, **qp)["statusCode"] == 400


def test_sin_rango_no_cambia_la_respuesta(h):
    _poner(h, [_med("2026-10-26T15:00:00+00:00")], pagina=1000)
    cuerpo = json.loads(_punto(h)["body"])
    assert "truncado" not in cuerpo and h.tabla.kwargs[0]["Limit"] == 50


@pytest.mark.parametrize("limite,esperado", [("0", 1), ("-5", 1), ("9999", 500), ("7", 7)])
def test_rango_acota_limite_a_1_y_el_maximo(h, limite, esperado):
    _poner(h, [], pagina=1000)
    r = _punto(h, desde="2026-10-26", hasta="2026-10-26", limite=limite)
    assert r["statusCode"] == 200
    assert h.tabla.kwargs[0]["Limit"] == esperado + 1


@pytest.mark.parametrize("qp", [{"desde": "2026-10-26", "limite": "abc"}, {"limite": "1.5"}])
def test_limite_no_numerico_400_en_punto(h, qp):
    _poner(h, [])
    r = _punto(h, **qp)
    assert r["statusCode"] == 400 and h.tabla.kwargs == []


# ── GET /mediciones/recientes?desde&hasta ────────────────────────────────────

def _recientes(h, **qp):
    return h.lambda_handler({"httpMethod": "GET", "resource": "/mediciones/recientes",
                             "queryStringParameters": qp,
                             "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}, None)


def test_recientes_sin_rango_no_cambia(h):
    _poner(h, [_med("2026-10-26T15:00:00+00:00")], pagina=1000)
    cuerpo = json.loads(_recientes(h)["body"])
    kw = h.tabla.kwargs[0]
    assert "truncado" not in cuerpo and kw["Limit"] == 20 and _valores(kw) == ["medicion"]


def test_recientes_con_rango_usa_between_en_el_gsi_y_limite_maximo(h):
    _poner(h, [_med("2026-10-26T15:00:00+00:00")], pagina=1000)
    cuerpo = json.loads(_recientes(h, desde="2026-10-26", hasta="2026-10-26", resumen="1")["body"])
    kw = h.tabla.kwargs[0]
    assert kw["IndexName"] == "tipo-timestamp-index" and kw["ScanIndexForward"] is False
    assert _valores(kw) == ["medicion", "2026-10-26T05:00:00", "2026-10-27T04:59:59.999999+00:00"]
    assert kw["Limit"] == h.LIMITE_RECIENTES_MAX + 1
    assert "EMP-1" in kw["FilterExpression"].get_expression()["values"]
    assert cuerpo["total"] == 1 and cuerpo["truncado"] is False


def test_recientes_con_rango_marca_truncado_y_recorta(h):
    _poner(h, [_med(f"2026-10-26T15:00:00.{i:06d}+00:00") for i in range(6)], pagina=1000)
    cuerpo = json.loads(_recientes(h, desde="2026-10-26", limit="5")["body"])
    assert cuerpo["total"] == 5 and cuerpo["truncado"] is True


def test_recientes_solo_desde_o_solo_hasta(h):
    _poner(h, [], pagina=1000)
    _recientes(h, desde="2026-10-26")
    assert _valores(h.tabla.kwargs[-1]) == ["medicion", "2026-10-26T05:00:00"]
    _recientes(h, hasta="2026-10-26")
    valores = _valores(h.tabla.kwargs[-1])
    assert valores == ["medicion", "2026-10-27T04:59:59.999999+00:00"]
    assert "" not in valores  # real DynamoDB rejects empty key values


def test_recientes_super_admin_sin_filtro_de_empresa(h, monkeypatch):
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": "super_admin"}]))
    _poner(h, [], pagina=1000)
    _recientes(h, desde="2026-10-26", hasta="2026-10-26")
    assert "FilterExpression" not in h.tabla.kwargs[0]


@pytest.mark.parametrize("qp", [{"desde": "26-10-2026"}, {"hasta": "2026-13-40"},
                                {"desde": "2026-10-27", "hasta": "2026-10-26"}, {"limit": "abc"}])
def test_recientes_invalido_400(h, qp):
    _poner(h, [])
    assert _recientes(h, **qp)["statusCode"] == 400 and h.tabla.kwargs == []


def test_promedios_del_dia_ponderan_todas_las_fotos_no_la_peor(h):
    # 9 fotos severas y 1 limpia: el promedio es de las 10, el peor sigue siendo el nivel 3.
    _poner(h, [_med(f"2026-10-26T15:{i:02d}:00+00:00", 3, "30") for i in range(9)]
              + [_med("2026-10-26T16:00:00+00:00", 0, "0")])
    d = json.loads(_resumen(h, anio="2026")["body"])["dias"][0]
    assert d["promedio_pct"] == pytest.approx(27.0)
    assert d["nivel_promedio"] == 2.7 and d["nivel_ponderado"] == 3 and d["peor_nivel"] == 3


def test_nivel_ponderado_redondea_al_mas_cercano_y_medio_sube(h):
    _poner(h, [_med("2026-10-26T15:00:00+00:00", 1, "1"), _med("2026-10-26T16:00:00+00:00", 2, "2"),
               _med("2026-10-27T15:00:00+00:00", 0, "0"), _med("2026-10-27T16:00:00+00:00", 0, "0"),
               _med("2026-10-27T17:00:00+00:00", 1, "1")])
    d26, d27 = json.loads(_resumen(h, anio="2026")["body"])["dias"]
    assert d26["nivel_promedio"] == 1.5 and d26["nivel_ponderado"] == 2
    assert d27["nivel_promedio"] == 0.33 and d27["nivel_ponderado"] == 0


def test_promedios_son_null_sin_datos_validos_y_ignoran_los_invalidos(h):
    _poner(h, [_med("2026-10-26T15:00:00+00:00", None, "nan"),
               _med("2026-10-27T15:00:00+00:00", None, "4"), _med("2026-10-27T16:00:00+00:00", 2, "x")])
    d26, d27 = json.loads(_resumen(h, anio="2026")["body"])["dias"]
    assert d26["promedio_pct"] is None and d26["nivel_promedio"] is None and d26["nivel_ponderado"] is None
    assert d27["promedio_pct"] == 4 and d27["nivel_ponderado"] == 2


def test_min_pct_es_el_menor_porcentaje_valido_del_dia(h):
    _poner(h, [_med("2026-10-26T15:00:00+00:00", 3, "40.5"), _med("2026-10-26T16:00:00+00:00", 1, "3"),
               _med("2026-10-26T17:00:00+00:00", 2, "x"), _med("2026-10-26T18:00:00+00:00", 0, "12")])
    d = json.loads(_resumen(h, anio="2026")["body"])["dias"][0]
    assert d["min_pct"] == 3 and d["max_pct"] == 40.5


def test_min_pct_es_null_si_ninguna_foto_del_dia_tiene_porcentaje(h):
    _poner(h, [_med("2026-10-26T15:00:00+00:00", 1, "nan"), _med("2026-10-26T16:00:00+00:00", 2, "x")])
    d = json.loads(_resumen(h, anio="2026")["body"])["dias"][0]
    assert d["min_pct"] is None and d["max_pct"] is None
