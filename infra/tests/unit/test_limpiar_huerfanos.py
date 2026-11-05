"""Pruebas unitarias de scripts/limpiar_huerfanos.py (dobles en memoria, sin AWS)."""
import importlib.util
from pathlib import Path

import pytest
from botocore.exceptions import ClientError

RAIZ = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("limpiar_huerfanos", RAIZ / "scripts" / "limpiar_huerfanos.py")
limpiar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(limpiar)

CFG = {**limpiar.det.DEFAULT_CONFIG, "tabla_empresas": "t-emp", "tabla_bloques": "t-blq",
       "tabla_mediciones": "t-pm", "bucket_name": "b-img"}


def _conflicto():
    return ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "x")


class Tabla:
    def __init__(self, items):
        self.items = [dict(i) for i in items]
        self.escrituras = []
        self.conflicto_en = set()   # claves (id_punto, sk) que simulan condición fallida

    def scan(self, **_):
        return {"Items": [dict(i) for i in self.items]}

    def delete_item(self, Key, ConditionExpression=None, ExpressionAttributeValues=None):
        k = (Key["id_punto"], Key["sk"])
        if k in self.conflicto_en:
            raise _conflicto()
        self.escrituras.append(("delete", k, ConditionExpression))
        self.items = [i for i in self.items if (i["id_punto"], i["sk"]) != k]

    def update_item(self, Key, UpdateExpression, ConditionExpression, ExpressionAttributeValues):
        k = (Key["id_punto"], Key["sk"])
        if k in self.conflicto_en:
            raise _conflicto()
        self.escrituras.append(("update", k, ExpressionAttributeValues[":k"]))
        next(i for i in self.items if (i["id_punto"], i["sk"]) == k)["idem_key"] = ExpressionAttributeValues[":k"]


class Ddb:
    def __init__(self, tablas):
        self.tablas = {n: Tabla(i) for n, i in tablas.items()}

    def Table(self, name):
        return self.tablas.setdefault(name, Tabla([]))


class S3:
    def __init__(self, contents):
        self.contents, self.borrados = list(contents), []

    def list_objects_v2(self, **_):
        return {"Contents": self.contents, "IsTruncated": False}

    def delete_object(self, Bucket, Key):
        self.borrados.append((Bucket, Key))


def _escenario():
    ddb = Ddb({
        "t-emp": [{"id_empresa": "EMP-1"}],
        "t-blq": [{"id_bloque": "BLQ-1", "empresa_id": "EMP-1"}],
        "t-pm": [
            {"id_punto": "BLQ-1", "sk": "MED#1", "id_medicion": "MED-1"},                            # viva, sin idem_key
            {"id_punto": "BLQ-1", "sk": "MED#2", "id_medicion": "MED-2", "idem_key": "uploads/s/b.jpg"},  # viva, ya tiene
            {"id_punto": "IDEM#uploads/s/a.jpg", "sk": "IDEM", "estado": "listo", "id_medicion": "MED-1"},
            {"id_punto": "IDEM#uploads/s/b.jpg", "sk": "IDEM", "estado": "listo", "id_medicion": "MED-2"},
            {"id_punto": "IDEM#uploads/s/muerta.jpg", "sk": "IDEM", "estado": "listo", "id_medicion": "MED-0"},
            {"id_punto": "IDEM#uploads/s/en-curso.jpg", "sk": "IDEM", "estado": "procesando"},
        ],
    })
    s3 = S3([
        {"Key": "empresas/EMP-1/", "Size": 0},
        {"Key": "empresas/EMP-1/BLQ-1/", "Size": 0},
        {"Key": "empresas/EMP-1/BLQ-1/MED-1.jpg", "Size": 99},
        {"Key": "empresas/EMP-1/BLQ-OFF/", "Size": 0},          # punto borrado
        {"Key": "empresas/EMP-OFF/", "Size": 0},                # zona borrada
        {"Key": "empresas/EMP-OFF/BLQ-9/foto.jpg", "Size": 5},  # objeto real de zona borrada: NO se toca
        {"Key": "empresas/EMP-OFF/BLQ-8/", "Size": 7},          # termina en "/" pero pesa: NO se toca
        {"Key": "uploads/s/a.jpg", "Size": 10},
    ])
    return ddb, s3


def test_plan_solo_incluye_huerfanos_comprobados():
    ddb, s3 = _escenario()
    plan = limpiar.planificar(ddb, s3, CFG)
    assert [i["id_punto"] for i in plan["idem"]] == ["IDEM#uploads/s/muerta.jpg"]
    assert [m["key"] for m in plan["marcadores"]] == ["empresas/EMP-1/BLQ-OFF/", "empresas/EMP-OFF/"]
    assert plan["backfill"] == [{"id_punto": "BLQ-1", "sk": "MED#1", "id_medicion": "MED-1", "idem_key": "uploads/s/a.jpg"}]


def test_planificar_no_escribe_nada():
    ddb, s3 = _escenario()
    limpiar.planificar(ddb, s3, CFG)
    assert all(t.escrituras == [] for t in ddb.tablas.values()) and s3.borrados == []


def test_aplicar_borra_solo_lo_planeado_y_rellena_idem_key():
    ddb, s3 = _escenario()
    plan = limpiar.planificar(ddb, s3, CFG)
    hecho = limpiar.aplicar_plan(ddb, s3, CFG, plan)
    assert hecho == {"idem": 1, "marcadores": 2, "backfill": 1, "omitidos": 0}
    assert s3.borrados == [("b-img", "empresas/EMP-1/BLQ-OFF/"), ("b-img", "empresas/EMP-OFF/")]
    pm = ddb.Table("t-pm")
    assert {i["id_punto"] for i in pm.items} == {
        "BLQ-1", "IDEM#uploads/s/a.jpg", "IDEM#uploads/s/b.jpg", "IDEM#uploads/s/en-curso.jpg"}
    assert next(i for i in pm.items if i.get("sk") == "MED#1")["idem_key"] == "uploads/s/a.jpg"
    # solo se borró la fila IDEM huérfana; ninguna medición, empresa ni bloque
    assert [e[:2] for e in pm.escrituras if e[0] == "delete"] == [("delete", ("IDEM#uploads/s/muerta.jpg", "IDEM"))]
    assert len(ddb.Table("t-emp").items) == 1 and len(ddb.Table("t-blq").items) == 1


def test_cambio_concurrente_se_omite_sin_fallar():
    ddb, s3 = _escenario()
    plan = limpiar.planificar(ddb, s3, CFG)
    ddb.Table("t-pm").conflicto_en = {("IDEM#uploads/s/muerta.jpg", "IDEM"), ("BLQ-1", "MED#1")}
    hecho = limpiar.aplicar_plan(ddb, s3, CFG, plan)
    assert hecho["idem"] == 0 and hecho["backfill"] == 0 and hecho["omitidos"] == 2


def test_error_distinto_de_condicion_se_propaga():
    ddb, s3 = _escenario()
    plan = limpiar.planificar(ddb, s3, CFG)

    def falla(**_):
        raise ClientError({"Error": {"Code": "AccessDeniedException"}}, "x")

    ddb.Table("t-pm").delete_item = falla
    with pytest.raises(ClientError):
        limpiar.aplicar_plan(ddb, s3, CFG, plan)


def test_tablas_vacias_con_marcadores_aborta():
    ddb = Ddb({})
    with pytest.raises(RuntimeError, match="vacías"):
        limpiar.planificar(ddb, S3([{"Key": "empresas/EMP-1/", "Size": 0}]), CFG)


# ── CLI ──────────────────────────────────────────────────────────────────────

class Sesion:
    ddb = s3 = None
    cuenta = "111111111111"

    def __init__(self, **_):
        pass

    def client(self, nombre, **_):
        if nombre == "sts":
            outer = Sesion
            return type("Sts", (), {"get_caller_identity": lambda self: {"Account": outer.cuenta}})()
        return Sesion.s3

    def resource(self, *_a, **_k):
        return Sesion.ddb


@pytest.fixture
def sesion(monkeypatch):
    Sesion.cuenta = "111111111111"
    Sesion.ddb, Sesion.s3 = _escenario()
    d = limpiar.det.DEFAULT_CONFIG   # el CLI usa los nombres de tabla por defecto
    for corto, largo in (("t-emp", d["tabla_empresas"]), ("t-blq", d["tabla_bloques"]), ("t-pm", d["tabla_mediciones"])):
        Sesion.ddb.tablas[largo] = Sesion.ddb.tablas.pop(corto)
    monkeypatch.setattr(limpiar.boto3, "Session", Sesion)
    return Sesion


ARGS = ["--expected-account", "111111111111", "--bucket", "b-img"]


def test_cli_simulacion_por_defecto_no_escribe(sesion, capsys):
    assert limpiar.main(ARGS) == 0
    salida = capsys.readouterr().out
    assert "SIMULACIÓN" in salida and "IDEM#uploads/s/muerta.jpg" in salida and "empresas/EMP-OFF/" in salida
    assert sesion.s3.borrados == [] and all(t.escrituras == [] for t in sesion.ddb.tablas.values())


def test_cli_aplicar_ejecuta(sesion, capsys):
    assert limpiar.main(ARGS + ["--aplicar"]) == 0
    assert "APLICANDO" in capsys.readouterr().out
    assert len(sesion.s3.borrados) == 2
    assert not any(i["id_punto"] == "IDEM#uploads/s/muerta.jpg"
                   for i in sesion.ddb.Table(limpiar.det.DEFAULT_CONFIG["tabla_mediciones"]).items)


def test_cli_cuenta_distinta_aborta_antes_de_leer(sesion, capsys):
    sesion.cuenta = "999999999999"
    assert limpiar.main(ARGS + ["--aplicar"]) == 1
    assert "no coincide" in capsys.readouterr().err
    assert sesion.s3.borrados == [] and all(t.escrituras == [] for t in sesion.ddb.tablas.values())


@pytest.mark.parametrize("args", [["--bucket", "b"], ["--expected-account", "111111111111"]])
def test_cli_exige_cuenta_y_bucket_explicitos(sesion, args):
    assert limpiar.main(args) == 1
