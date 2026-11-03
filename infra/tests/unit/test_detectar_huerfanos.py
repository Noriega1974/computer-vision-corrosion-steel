"""Pruebas unitarias para el auditor de solo lectura scripts/detectar_huerfanos.py."""
from datetime import datetime, timezone
from pathlib import Path
import importlib.util

import pytest


RAIZ = Path(__file__).resolve().parents[2]
SCRIPT_PATH = RAIZ / "scripts" / "detectar_huerfanos.py"

spec = importlib.util.spec_from_file_location("detectar_huerfanos", SCRIPT_PATH)
detectar_huerfanos = importlib.util.module_from_spec(spec)
spec.loader.exec_module(detectar_huerfanos)


class TablaScanFake:
    def __init__(self, items, page_size=2):
        self.items = list(items)
        self.page_size = page_size

    def scan(self, **kwargs):
        start = int(kwargs.get("ExclusiveStartKey", {}).get("idx", 0))
        chunk = self.items[start : start + self.page_size]
        resp = {"Items": chunk}
        if start + self.page_size < len(self.items):
            resp["LastEvaluatedKey"] = {"idx": start + self.page_size}
        return resp


class DdbResourceFake:
    def __init__(self, tablas):
        self.tablas = tablas

    def Table(self, name):
        return TablaScanFake(self.tablas.get(name, []))


class S3ListFake:
    def __init__(self, contents):
        self.contents = list(contents)

    def list_objects_v2(self, **kwargs):
        start = int(kwargs.get("ContinuationToken", "0"))
        chunk = self.contents[start : start + 2]
        is_trunc = start + 2 < len(self.contents)
        resp = {"Contents": chunk, "IsTruncated": is_trunc}
        if is_trunc:
            resp["NextContinuationToken"] = str(start + 2)
        return resp


class CognitoListFake:
    def __init__(self, users):
        self.users = list(users)

    def list_users(self, **kwargs):
        start = int(kwargs.get("PaginationToken", "0"))
        chunk = self.users[start : start + 2]
        resp = {"Users": chunk}
        if start + 2 < len(self.users):
            resp["PaginationToken"] = str(start + 2)
        return resp


CFG = {
    "tabla_empresas": "t-emp",
    "tabla_bloques": "t-blq",
    "tabla_mediciones": "t-pm",
    "tabla_usuarios": "t-usr",
    "bucket_name": "b-img",
    "user_pool_id": "pool-1",
}


def test_estado_limpio_produce_cero_hallazgos():
    ddb = DdbResourceFake({
        "t-emp": [{"id_empresa": "EMP-1", "nombre": "Zona Norte", "activa": True, "logo_key": "empresas/EMP-1/logo/a.png"}],
        "t-blq": [{"id_bloque": "BLQ-1", "empresa_id": "EMP-1", "nombre": "Punto 1", "portada_key": "empresas/EMP-1/BLQ-1/portada/p.jpg"}],
        "t-pm": [{
            "id_punto": "BLQ-1",
            "sk": "MED#2026-10-20T12:00:00+00:00",
            "id_medicion": "MED-1",
            "empresa_id": "EMP-1",
            "s3_key_imagen": "empresas/EMP-1/BLQ-1/MED-1.jpg",
            "s3_key_thumbnail": "empresas/EMP-1/BLQ-1/MED-1_thumb.jpg",
            "s3_key_resultado": "empresas/EMP-1/BLQ-1/MED-1.json",
        }],
        "t-usr": [
            {"id_usuario": "U-SA", "rol": "super_admin", "email": "sa@x.co", "cognito_sub": "sub-sa", "activo": True},
            {"id_usuario": "U-1", "rol": "admin", "empresa_id": "EMP-1", "email": "adm@x.co", "cognito_sub": "sub-1", "activo": True},
        ],
    })
    s3 = S3ListFake([
        {"Key": "empresas/EMP-1/logo/a.png", "Size": 1200},
        {"Key": "empresas/EMP-1/BLQ-1/portada/p.jpg", "Size": 2400},
        {"Key": "empresas/EMP-1/BLQ-1/MED-1.jpg", "Size": 45000},
        {"Key": "empresas/EMP-1/BLQ-1/MED-1_thumb.jpg", "Size": 8000},
        {"Key": "empresas/EMP-1/BLQ-1/MED-1.json", "Size": 950},
    ])
    cog = CognitoListFake([
        {"Username": "sa@x.co", "Enabled": True, "Attributes": [{"Name": "sub", "Value": "sub-sa"}, {"Name": "email", "Value": "sa@x.co"}]},
        {"Username": "adm@x.co", "Enabled": True, "Attributes": [{"Name": "sub", "Value": "sub-1"}, {"Name": "email", "Value": "adm@x.co"}]},
    ])

    rep = detectar_huerfanos.auditar_huerfanos(ddb, s3, cog, CFG)
    assert rep["resumen"]["total_hallazgos"] == 0
    assert rep["s3_huerfanos"]["archivos_huerfanos"] == []
    assert rep["referencias_s3_rotas"] == []


def test_detecta_todas_las_categorias_de_huerfanos_y_discordancias():
    ahora = datetime(2026, 11, 3, 12, 0, 0, tzinfo=timezone.utc)
    ddb = DdbResourceFake({
        "t-emp": [
            {"id_empresa": "EMP-1", "nombre": "Activa", "activa": True},
            {"id_empresa": "EMP-OFF", "nombre": "Inactiva", "activa": False},
        ],
        "t-blq": [
            {"id_bloque": "BLQ-OK", "empresa_id": "EMP-1", "nombre": "Punto OK"},
            {"id_bloque": "BLQ-HUERFANO", "empresa_id": "EMP-BORRADA", "nombre": "Sin zona"},
            {"id_bloque": "BLQ-INACTIVA", "empresa_id": "EMP-OFF", "nombre": "En zona apagada"},
        ],
        "t-pm": [
            {"id_punto": "PT-VIEJO", "sk": "METADATA", "nombre": "Punto legado"},
            {
                "id_punto": "BLQ-NO-EXISTE",
                "sk": "MED#2026-10-01T00:00:00+00:00",
                "id_medicion": "MED-SIN-BLQ",
                "empresa_id": "EMP-1",
                "s3_key_imagen": "empresas/EMP-1/BLQ-NO-EXISTE/MED-SIN-BLQ.jpg",
            },
            {
                "id_punto": "BLQ-OK",
                "sk": "MED#2026-10-02T00:00:00+00:00",
                "id_medicion": "MED-EMP-DISTINTA",
                "empresa_id": "EMP-OTRA",
                "s3_key_imagen": "empresas/EMP-1/BLQ-OK/FALTA-EN-S3.jpg",
            },
        ],
        "t-usr": [
            # Colaborador sin empresa_id (bug histórico de POST /colaborador por super_admin)
            {
                "id_usuario": "U-COLAB-SIN-EMP",
                "rol": "tecnico",
                "es_colaborador": True,
                "empresa_id": "",
                "email": "colab@temporal.local",
                "cognito_username": "colab",
                "activo": True,
                "vence_en": "2026-10-15T00:00:00+00:00",  # ya expirado
            },
            # Usuario en DDB que no existe en Cognito
            {
                "id_usuario": "U-FANTASMA",
                "rol": "cliente",
                "empresa_id": "EMP-1",
                "email": "fantasma@x.co",
                "cognito_sub": "sub-fantasma",
                "activo": True,
            },
        ],
    })
    s3 = S3ListFake([
        {"Key": "empresas/EMP-1/BLQ-NO-EXISTE/MED-SIN-BLQ.jpg", "Size": 1000},
        {"Key": "empresas/EMP-1/BLQ-OK/HUERFANO-SUELTO.jpg", "Size": 5432},
        {"Key": "empresas/EMP-1/", "Size": 0},
        {"Key": "uploads/sub-1/temp.jpg", "Size": 2048},
    ])
    cog = CognitoListFake([
        # El colaborador existe en Cognito pero está Enabled=False mientras en DDB activo=True
        {"Username": "colab", "Enabled": False, "Attributes": [{"Name": "sub", "Value": "sub-colab"}]},
        # Usuario suelto en Cognito sin fila en DDB
        {"Username": "suelto@x.co", "Enabled": True, "Attributes": [{"Name": "sub", "Value": "sub-suelto"}, {"Name": "email", "Value": "suelto@x.co"}]},
    ])

    rep = detectar_huerfanos.auditar_huerfanos(ddb, s3, cog, CFG, ahora=ahora)

    assert [b["id_bloque"] for b in rep["bloques_sin_empresa"]] == ["BLQ-HUERFANO"]
    assert [b["id_bloque"] for b in rep["bloques_empresa_inactiva"]] == ["BLQ-INACTIVA"]
    assert [m["id_medicion"] for m in rep["mediciones_sin_bloque"]] == ["MED-SIN-BLQ"]
    assert [m["id_medicion"] for m in rep["mediciones_empresa_discordante"]] == ["MED-EMP-DISTINTA"]
    assert [x["id_punto"] for x in rep["items_metadata_legado"]] == ["PT-VIEJO"]
    assert [u["id_usuario"] for u in rep["usuarios_sin_empresa"]] == ["U-COLAB-SIN-EMP"]
    assert [u["id_usuario"] for u in rep["usuarios_ddb_sin_cognito"]] == ["U-FANTASMA"]
    assert [c["username"] for c in rep["cognito_sin_usuario_ddb"]] == ["suelto@x.co"]

    motivos = {d["motivo"] for d in rep["usuarios_estado_discordante"]}
    assert "colaborador_expirado_sigue_activo" in motivos
    assert "activo_ddb_difiere_de_cognito_enabled" in motivos

    assert [o["key"] for o in rep["s3_huerfanos"]["archivos_huerfanos"]] == [
        "empresas/EMP-1/BLQ-OK/HUERFANO-SUELTO.jpg"
    ]
    assert [o["key"] for o in rep["s3_huerfanos"]["marcadores_carpeta"]] == ["empresas/EMP-1/"]
    assert [o["key"] for o in rep["s3_huerfanos"]["subidas_temporales"]] == ["uploads/sub-1/temp.jpg"]
    assert [r["key"] for r in rep["referencias_s3_rotas"]] == ["empresas/EMP-1/BLQ-OK/FALTA-EN-S3.jpg"]

    texto = detectar_huerfanos.formatear_reporte_humano(rep)
    assert "Auditoría de integridad y huérfanos" in texto
    assert "Archivos S3 huérfanos: 1" in texto
    # Intentional states are informational, not findings.
    assert rep["resumen"]["total_informativos"] == 2
    assert rep["resumen"]["total_hallazgos"] == len(
        rep["bloques_sin_empresa"] + rep["mediciones_sin_bloque"] + rep["mediciones_empresa_discordante"]
        + rep["usuarios_sin_empresa"] + rep["usuarios_ddb_sin_cognito"] + rep["cognito_sin_usuario_ddb"]
        + rep["usuarios_estado_discordante"] + rep["s3_huerfanos"]["archivos_huerfanos"]
        + rep["referencias_s3_rotas"]
    )
    d = [x for x in rep["usuarios_estado_discordante"] if x["motivo"] == "colaborador_expirado_sigue_activo"]
    assert d[0]["vence_en"] == "2026-10-15T00:00:00+00:00"


def test_scans_usan_projection_con_alias():
    llamadas = []

    class T(TablaScanFake):
        def scan(self, **kw):
            llamadas.append(kw)
            return super().scan(**kw)

    class D(DdbResourceFake):
        def Table(self, name):
            return T([])

    detectar_huerfanos.auditar_huerfanos(D({}), S3ListFake([]), None, CFG)
    assert len(llamadas) == 4
    for kw in llamadas:
        assert kw["ProjectionExpression"]
        assert set(kw["ExpressionAttributeNames"]) == set(kw["ProjectionExpression"].split(", "))


# ── CLI: explicit targets, account guard, exit codes ─────────────────────────

class StsFake:
    def __init__(self, cuenta):
        self.cuenta = cuenta

    def get_caller_identity(self):
        return {"Account": self.cuenta}


class SessionFake:
    creadas = []

    def __init__(self, cuenta="111111111111", tablas=None, **kw):
        self.cuenta, self.tablas, self.kw = cuenta, tablas or {}, kw
        self.clientes = []

    def client(self, nombre, **_):
        self.clientes.append(nombre)
        if nombre == "sts":
            return StsFake(self.cuenta)
        if nombre == "s3":
            return S3ListFake([])
        return CognitoListFake([])

    def resource(self, nombre, **_):
        return DdbResourceFake(self.tablas)


@pytest.fixture
def sesion(monkeypatch):
    """Patch boto3.Session; returns a holder whose `.sesion` is the last session."""
    class Holder:
        tablas = {}
        cuenta = "111111111111"
        sesion = None

    def fabrica(**kw):
        Holder.sesion = SessionFake(Holder.cuenta, Holder.tablas, **kw)
        return Holder.sesion

    monkeypatch.setattr(detectar_huerfanos.boto3, "Session", fabrica)
    return Holder


ARGS_OK = ["--expected-account", "111111111111", "--bucket", "b", "--user-pool-id", "p"]


def test_sin_bucket_ni_skip_es_error_1(sesion, capsys):
    assert detectar_huerfanos.main(["--expected-account", "111111111111", "--user-pool-id", "p"]) == 1
    assert "--bucket" in capsys.readouterr().err
    assert sesion.sesion is None  # nothing was contacted


def test_sin_user_pool_ni_skip_es_error_1(sesion, capsys):
    assert detectar_huerfanos.main(["--expected-account", "111111111111", "--bucket", "b"]) == 1
    assert "--user-pool-id" in capsys.readouterr().err


def test_sin_expected_account_es_error_1(sesion):
    assert detectar_huerfanos.main(["--bucket", "b", "--user-pool-id", "p"]) == 1


def test_cuenta_distinta_aborta_antes_de_leer(sesion, capsys):
    sesion.cuenta = "222222222222"
    assert detectar_huerfanos.main(ARGS_OK) == 1
    err = capsys.readouterr().err
    assert "222222222222" in err and "no coincide" in err
    assert sesion.sesion.clientes == ["sts"]  # no s3/cognito client created


def test_cuenta_correcta_se_imprime_y_perfil_se_usa(sesion, capsys):
    assert detectar_huerfanos.main(ARGS_OK + ["--profile", "mi-perfil"]) == 0
    assert "111111111111" in capsys.readouterr().err
    assert sesion.sesion.kw["profile_name"] == "mi-perfil"


def test_skip_avisa_en_voz_alta_y_no_crea_clientes(sesion, capsys):
    rc = detectar_huerfanos.main(["--expected-account", "111111111111", "--skip-s3", "--skip-cognito"])
    err = capsys.readouterr().err
    assert rc == 0
    assert err.count("SKIPPED") == 2
    assert sesion.sesion.clientes == ["sts"]


def test_exit_2_con_hallazgos(sesion):
    sesion.tablas = {detectar_huerfanos.DEFAULT_CONFIG["tabla_bloques"]: [{"id_bloque": "B", "empresa_id": "NO", "nombre": "x"}]}
    assert detectar_huerfanos.main(ARGS_OK) == 2


def test_estados_intencionales_no_cuentan_exit_0(sesion):
    sesion.tablas = {
        detectar_huerfanos.DEFAULT_CONFIG["tabla_empresas"]: [{"id_empresa": "E", "activa": False}],
        detectar_huerfanos.DEFAULT_CONFIG["tabla_bloques"]: [{"id_bloque": "B", "empresa_id": "E", "nombre": "x"}],
        detectar_huerfanos.DEFAULT_CONFIG["tabla_mediciones"]: [{"id_punto": "PT", "sk": "METADATA"}],
    }
    assert detectar_huerfanos.main(ARGS_OK) == 0


def test_error_inesperado_es_exit_1(sesion, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("AccessDenied")
    monkeypatch.setattr(detectar_huerfanos, "auditar_huerfanos", boom)
    assert detectar_huerfanos.main(ARGS_OK) == 1
