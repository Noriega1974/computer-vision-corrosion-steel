"""GET /indicadores y regla del técnico (solo mueve/elimina lo que tomó) en api_mediciones."""
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

import fakes

RUTA = Path(__file__).resolve().parents[2] / "pf_corrosion_infra" / "lambda_src" / "api_mediciones" / "handler.py"
# 2026-11-04 15:00 UTC = 10:00 en Colombia (hoy local: 2026-11-04). Ventana: 2026-10-06 .. 2026-11-04.
AHORA = datetime(2026, 11, 4, 15, 0, tzinfo=timezone.utc)


def _med(punto, ts, nivel=0, pct="0", empresa="EMP-1", **extra):
    return {"id_punto": punto, "sk": f"MED#{ts}", "timestamp": ts, "nivel_corrosion": nivel,
            "area_corroida_pct": pct, "empresa_id": empresa, "id_medicion": f"MED-{punto}-{ts}", **extra}


class TablaMed:
    """Fake de la tabla de mediciones: Query por partición (desc) o por GSI (COUNT), con Limit y paginación."""

    def __init__(self, items):
        self.items = list(items)
        self.consultas = []

    def query(self, **kw):
        self.consultas.append(kw)
        valores = []

        def rec(c):
            for v in c.get_expression()["values"]:
                if hasattr(v, "get_expression"):
                    rec(v)
                elif not hasattr(v, "name"):
                    valores.append(v)
        rec(kw["KeyConditionExpression"])
        if kw.get("IndexName"):
            filas = [i for i in self.items if i["timestamp"] >= valores[1]]
            filtro = kw.get("FilterExpression")
            if filtro is not None:
                filas = [i for i in filas if i.get("empresa_id") == filtro._values[1]]
            assert kw["Select"] == "COUNT"
            # Dos "páginas" para ejercitar la paginación.
            if "ExclusiveStartKey" not in kw and len(filas) > 1:
                return {"Count": 1, "LastEvaluatedKey": {"x": 1}}
            return {"Count": len(filas) - (1 if len(filas) > 1 else 0)}
        filas = sorted((i for i in self.items if i["id_punto"] == valores[0]), key=lambda i: i["sk"], reverse=True)
        inicio = kw.get("ExclusiveStartKey", {}).get("i", 0)
        limite = kw["Limit"]
        resp = {"Items": [dict(i) for i in filas[inicio:inicio + limite]]}
        if inicio + limite < len(filas):
            resp["LastEvaluatedKey"] = {"i": inicio + limite}
        return resp


class TablaBloques(fakes.FakeTabla):
    def __init__(self, items):
        super().__init__(items)
        self.consultas = []

    def query(self, **kw):
        self.consultas.append(("query", kw))
        empresa = kw["KeyConditionExpression"].get_expression()["values"][1]
        return {"Items": [dict(i) for i in self.items if i.get("empresa_id") == empresa]}

    def scan(self, **kw):
        self.consultas.append(("scan", kw))
        return {"Items": [dict(i) for i in self.items]}


def _bloque(i, nombre, empresa="EMP-1", **extra):
    return {"id_bloque": i, "nombre": nombre, "empresa_id": empresa, **extra}


@pytest.fixture
def h(monkeypatch):
    spec = importlib.util.spec_from_file_location("api_mediciones_indicadores_handler", RUTA)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1"}]))
    monkeypatch.setattr(mod, "tabla_empresas", fakes.FakeTabla([]))
    monkeypatch.setattr(mod, "_ahora", lambda: AHORA)
    return mod


def _montar(h, bloques, meds):
    h.tabla_bloques = TablaBloques(bloques)
    h.tabla = TablaMed(meds)


def _get(h, **qp):
    r = h.lambda_handler({"httpMethod": "GET", "resource": "/indicadores", "queryStringParameters": qp or None,
                          "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}, None)
    return r["statusCode"], json.loads(r["body"])


def _super(h, monkeypatch):
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": "super_admin"}]))


def test_sin_datos_devuelve_ceros_y_nulos(h):
    _montar(h, [], [])
    codigo, c = _get(h)
    assert codigo == 200
    assert c == {"total_puntos": 0, "por_nivel": [0, 0, 0, 0], "sin_mediciones": 0, "mas_critico": None,
                 "subieron_nivel": {"cantidad": 0, "puntos": []},
                 "cobertura": {"con_medicion_30d": 0, "total_puntos": 0, "mas_atrasado": None},
                 "mediciones_30d": 0, "mediciones_30d_truncado": False, "puntos_truncados": 0,
                 "parcial": False, "generado_en": "2026-11-04T15:00:00Z"}


def test_incluye_puntos_sin_fotos_y_excluye_inactivos(h):
    _montar(h, [_bloque("B1", "Con fotos"), _bloque("B2", "Sin fotos"), _bloque("B3", "Apagado", activo=False)],
            [_med("B1", "2026-11-03T15:00:00+00:00", 2, "20")])
    _, c = _get(h)
    assert c["total_puntos"] == 2 and c["sin_mediciones"] == 1 and c["por_nivel"] == [0, 0, 1, 0]
    assert c["cobertura"]["con_medicion_30d"] == 1 and c["cobertura"]["total_puntos"] == 2
    # el nunca medido es el más atrasado, sin días ni fecha
    assert c["cobertura"]["mas_atrasado"] == {"id_punto": "B2", "nombre": "Sin fotos", "dias": None, "fecha": None}


def test_estado_actual_es_el_promedio_del_ultimo_dia_local_y_el_nivel_ponderado_redondea_hacia_arriba(h):
    # 03:30 UTC del 3 pertenece al día local 2 (UTC-5): no cuenta en el último día (3).
    _montar(h, [_bloque("B1", "A")], [
        _med("B1", "2026-11-03T03:30:00+00:00", 3, "90"),
        _med("B1", "2026-11-03T15:00:00+00:00", 1, "10"),
        _med("B1", "2026-11-03T16:00:00+00:00", 2, "30"),   # niveles 1 y 2 -> media 1,5 -> 2
    ])
    _, c = _get(h)
    assert c["mas_critico"] == {"id_punto": "B1", "nombre": "A", "promedio_pct": 20.0, "nivel": 2, "fecha": "2026-11-03"}
    assert c["por_nivel"] == [0, 0, 1, 0]


def test_subieron_nivel_compara_con_el_dia_medido_anterior_y_dentro_de_30_dias(h):
    _montar(h, [_bloque("S", "Sube"), _bloque("I", "Igual"), _bloque("B", "Baja"), _bloque("V", "Viejo"), _bloque("U", "Una sola")], [
        _med("S", "2026-10-20T15:00:00+00:00", 0, "1"), _med("S", "2026-11-02T15:00:00+00:00", 3, "40"),
        _med("I", "2026-10-20T15:00:00+00:00", 2, "10"), _med("I", "2026-11-02T15:00:00+00:00", 2, "11"),
        _med("B", "2026-10-20T15:00:00+00:00", 3, "40"), _med("B", "2026-11-02T15:00:00+00:00", 1, "5"),
        # sube, pero su última medición es de hace más de 30 días: no cuenta
        _med("V", "2026-08-01T15:00:00+00:00", 0, "1"), _med("V", "2026-08-10T15:00:00+00:00", 3, "40"),
        _med("U", "2026-11-02T15:00:00+00:00", 3, "40"),
    ])
    _, c = _get(h)
    assert c["subieron_nivel"] == {"cantidad": 1, "puntos": [{"id_punto": "S", "nombre": "Sube", "de": 0, "a": 3, "fecha": "2026-11-02"}]}
    assert c["cobertura"]["con_medicion_30d"] == 4   # todos menos "Viejo"
    assert c["cobertura"]["mas_atrasado"] == {"id_punto": "V", "nombre": "Viejo", "dias": 86, "fecha": "2026-08-10"}


def test_subieron_limita_la_lista_a_10_pero_cuenta_todos(h):
    bloques = [_bloque(f"B{i:02d}", f"P{i:02d}") for i in range(12)]
    meds = [m for i in range(12) for m in (_med(f"B{i:02d}", "2026-10-20T15:00:00+00:00", 0), _med(f"B{i:02d}", "2026-11-02T15:00:00+00:00", 1, "5"))]
    _montar(h, bloques, meds)
    _, c = _get(h)
    assert c["subieron_nivel"]["cantidad"] == 12 and len(c["subieron_nivel"]["puntos"]) == 10


def test_mas_critico_desempata_por_nivel_y_luego_por_fecha_reciente(h):
    _montar(h, [_bloque("A", "A"), _bloque("B", "B"), _bloque("C", "C")], [
        _med("A", "2026-11-01T15:00:00+00:00", 2, "30"),
        _med("B", "2026-11-02T15:00:00+00:00", 3, "30"),   # mismo % y nivel mayor
        _med("C", "2026-10-30T15:00:00+00:00", 3, "30"),   # igual a B pero más viejo
    ])
    _, c = _get(h)
    assert c["mas_critico"]["id_punto"] == "B"


def test_pagina_hasta_ver_tres_dias_y_no_mas(h):
    meds = [_med("B1", f"2026-11-03T{hh:02d}:00:00+00:00", 1, "5") for hh in range(6, 20)]       # 14 fotos el mismo día
    meds += [_med("B1", "2026-11-02T15:00:00+00:00", 0), _med("B1", "2026-11-01T15:00:00+00:00", 3), _med("B1", "2026-10-31T15:00:00+00:00", 3)]
    _montar(h, [_bloque("B1", "A")], meds)
    h.PAGINA_ESTADO = 10
    _, c = _get(h)
    assert c["subieron_nivel"]["cantidad"] == 1   # 0 -> 1
    por_punto = [k for k in h.tabla.consultas if not k.get("IndexName")]
    assert len(por_punto) == 2   # 17 fotos en páginas de 10; el 3.er día ya apareció en la 2.ª
    assert all(k["ScanIndexForward"] is False for k in por_punto)


def test_mediciones_30d_usa_el_gsi_con_conteo_paginado(h):
    _montar(h, [_bloque("B1", "A")], [_med("B1", "2026-11-03T15:00:00+00:00", 1, "5"), _med("B1", "2026-11-02T15:00:00+00:00", 1, "5"),
                                       _med("B1", "2026-09-01T15:00:00+00:00", 1, "5")])
    _, c = _get(h)
    assert c["mediciones_30d"] == 2
    gsi = [k for k in h.tabla.consultas if k.get("IndexName") == "tipo-timestamp-index"]
    assert len(gsi) == 2 and "FilterExpression" in gsi[0]   # paginó y filtró por empresa


def test_admin_solo_ve_su_empresa_aunque_pase_empresa_id(h):
    _montar(h, [_bloque("B1", "Mía"), _bloque("B2", "Ajena", empresa="EMP-2")],
            [_med("B1", "2026-11-03T15:00:00+00:00", 1, "5"), _med("B2", "2026-11-03T15:00:00+00:00", 3, "50", empresa="EMP-2")])
    _, c = _get(h, empresa_id="EMP-2")
    assert c["total_puntos"] == 1 and c["mas_critico"]["id_punto"] == "B1" and c["mediciones_30d"] == 1
    assert h.tabla_bloques.consultas[0][0] == "query"


def test_usuario_sin_empresa_no_ve_nada(h, monkeypatch):
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": "cliente"}]))
    _montar(h, [_bloque("B1", "A")], [_med("B1", "2026-11-03T15:00:00+00:00")])
    _, c = _get(h)
    assert c["total_puntos"] == 0 and c["mediciones_30d"] == 0
    assert h.tabla.consultas == []


def test_super_admin_ve_todo_o_filtra_por_empresa(h, monkeypatch):
    _super(h, monkeypatch)
    _montar(h, [_bloque("B1", "A"), _bloque("B2", "B", empresa="EMP-2")],
            [_med("B1", "2026-11-03T15:00:00+00:00"), _med("B2", "2026-11-03T15:00:00+00:00", empresa="EMP-2")])
    _, todo = _get(h)
    assert todo["total_puntos"] == 2 and h.tabla_bloques.consultas[0][0] == "scan"
    assert "FilterExpression" not in [k for k in h.tabla.consultas if k.get("IndexName")][0]
    _, una = _get(h, empresa_id="EMP-2")
    assert una["total_puntos"] == 1 and una["mas_critico"]["id_punto"] == "B2"
    assert "FilterExpression" in [k for k in h.tabla.consultas if k.get("IndexName")][-1]


def test_cuenta_inactiva_403(h, monkeypatch):
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1", "activo": False}]))
    _montar(h, [], [])
    assert _get(h)[0] == 403


def test_sin_registro_de_usuario_403(h, monkeypatch):
    monkeypatch.setattr(h, "tabla_usuarios", fakes.FakeTabla([]))
    _montar(h, [], [])
    assert _get(h)[0] == 403


def test_respuesta_completa_no_es_parcial(h):
    _montar(h, [_bloque("B1", "A")], [_med("B1", "2026-11-03T15:00:00+00:00")])
    _, r = _get(h)
    assert r["parcial"] is False and r["mediciones_30d_truncado"] is False and r["puntos_truncados"] == 0


def test_punto_que_agota_el_tope_de_paginas_marca_parcial(h, monkeypatch):
    monkeypatch.setattr(h, "PAGINA_ESTADO", 1)
    monkeypatch.setattr(h, "MAX_PAGINAS_ESTADO", 1)
    _montar(h, [_bloque("B1", "A")], [_med("B1", "2026-11-03T15:00:00+00:00"), _med("B1", "2026-11-03T14:00:00+00:00")])
    _, r = _get(h)
    assert r["puntos_truncados"] == 1 and r["parcial"] is True


def test_conteo_que_agota_el_tope_de_paginas_marca_truncado(h, monkeypatch):
    monkeypatch.setattr(h, "MAX_PAGINAS_RESUMEN", 1)
    _montar(h, [_bloque("B1", "A")], [_med("B1", "2026-11-03T15:00:00+00:00"), _med("B1", "2026-11-03T14:00:00+00:00")])
    _, r = _get(h)
    assert r["mediciones_30d_truncado"] is True and r["parcial"] is True


def test_usuario_actual_se_lee_una_sola_vez_por_peticion(h):
    class Contada(fakes.FakeTabla):
        lecturas = 0

        def query(self, **kw):
            Contada.lecturas += 1
            return super().query(**kw)

    h.tabla_usuarios = Contada([{"rol": "admin", "empresa_id": "EMP-1"}])
    _montar(h, [_bloque("B1", "A")], [_med("B1", "2026-11-03T15:00:00+00:00")])
    assert _get(h)[0] == 200
    assert Contada.lecturas == 1
