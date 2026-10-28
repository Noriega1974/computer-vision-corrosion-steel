"""Robustez de borrados: huérfanos S3 (reintento + ORPHAN_S3 + advertencias),
borrado de usuario idempotente ante Cognito, carrera al borrar un punto y
cleanup de colaboradores (paginación + cierre global de sesión).
Todo local: S3, DynamoDB y Cognito son dobles en memoria."""
import importlib.util
import json
import logging
from pathlib import Path

import boto3
import pytest

import fakes
from test_api_mediciones_lote import _med, _post, _it, _cuerpo, ClienteDdb, TablaPag, BLOQUES, B

RAIZ = Path(__file__).resolve().parents[2]
SRC = RAIZ / "pf_corrosion_infra" / "lambda_src"
CAUSA = RuntimeError("AccessDenied")


def _cargar(nombre, carpeta, monkeypatch):
    for k, v in {
        "TABLA_EMPRESAS": "t-emp", "TABLA_PUNTOS_MEDICIONES": "t-pm", "TABLA_PUNTOS": "t-pm",
        "USER_POOL_ID": "pool",
    }.items():
        monkeypatch.setenv(k, v)
    spec = importlib.util.spec_from_file_location(nombre, SRC / carpeta / "handler.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class S3Falla(fakes.FakeS3):
    """delete_object falla `veces` veces seguidas para las claves en `claves`
    (None = todas); `veces=1` simula un fallo transitorio que el reintento cura."""

    def __init__(self, claves=None, veces=99):
        super().__init__()
        self.claves, self.veces, self.intentos = claves, veces, {}

    def delete_object(self, Bucket, Key):
        if self.claves is None or Key in self.claves:
            self.intentos[Key] = self.intentos.get(Key, 0) + 1
            if self.intentos[Key] <= self.veces:
                raise CAUSA
        super().delete_object(Bucket, Key)


def _orphans(caplog):
    return [r for r in caplog.records if r.levelno == logging.ERROR and "ORPHAN_S3" in r.getMessage()]


# ═══ api_mediciones ══════════════════════════════════════════════════════════

@pytest.fixture
def m(monkeypatch):
    mod = _cargar("api_mediciones_borrados", "api_mediciones", monkeypatch)
    tabla = TablaPag([_med(1), _med(2), _med(4)])
    monkeypatch.setattr(mod, "tabla", tabla)
    monkeypatch.setattr(mod, "s3", fakes.FakeS3())
    monkeypatch.setattr(mod, "cliente_ddb", ClienteDdb(tabla))
    monkeypatch.setattr(mod, "tabla_bloques", fakes.FakeTabla(BLOQUES, claves=("id_bloque",)))
    monkeypatch.setattr(mod, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1"}]))
    return mod


def _delete_ev(n):
    return {"httpMethod": "DELETE", "pathParameters": {"id_punto": "BLQ-1"},
            "queryStringParameters": {"id_medicion": f"MED-{n}"},
            "requestContext": {"authorizer": {"claims": {"sub": "s"}}}}


def test_s3_fallo_transitorio_se_cura_con_el_reintento(m, monkeypatch, caplog):
    monkeypatch.setattr(m, "s3", S3Falla(veces=1))
    r = m.lambda_handler(_delete_ev(1), None)
    assert r["statusCode"] == 200 and _cuerpo(r) == {"ok": True, "id_medicion": "MED-1"}
    assert _orphans(caplog) == []


def test_eliminar_individual_s3_persistente_200_con_advertencias_y_orphan(m, monkeypatch, caplog):
    clave = _med(1)["s3_key_thumbnail"]
    s3 = S3Falla(claves={clave})
    monkeypatch.setattr(m, "s3", s3)
    r = m.lambda_handler(_delete_ev(1), None)
    c = _cuerpo(r)
    assert r["statusCode"] == 200 and c["ok"] is True and c["id_medicion"] == "MED-1"
    assert c["advertencias"] == [{"id_medicion": "MED-1", "motivo": m.ADVERTENCIA_S3}]
    assert s3.intentos[clave] == 2                                  # intento + un reintento
    assert not any(i["id_medicion"] == "MED-1" for i in m.tabla.items)   # el ítem sí se borró
    registros = _orphans(caplog)
    assert len(registros) == 1 and f"key={clave}" in registros[0].getMessage()


def test_lote_eliminar_s3_persistente_agrega_advertencias_sin_cambiar_ok_error(m, monkeypatch, caplog):
    clave = _med(2)["s3_key_imagen"]
    monkeypatch.setattr(m, "s3", S3Falla(claves={clave}))
    c = _cuerpo(m.lambda_handler(_post("eliminar", [_it(1), _it(2)]), None))
    assert c["ok"] == ["MED-1", "MED-2"] and c["error"] == []
    assert c["advertencias"] == [{"id_medicion": "MED-2", "motivo": m.ADVERTENCIA_S3}]
    assert len(_orphans(caplog)) == 1


def test_lote_eliminar_sin_fallos_no_incluye_advertencias(m):
    c = _cuerpo(m.lambda_handler(_post("eliminar", [_it(1)]), None))
    assert c == {"ok": ["MED-1"], "error": []}


def test_mover_borrado_de_original_fallido_reintenta_y_registra_orphan(m, monkeypatch, caplog):
    vieja = _med(1)["s3_key_imagen"]
    s3 = S3Falla(claves={vieja})
    for k in ("s3_key_imagen", "s3_key_thumbnail"):
        s3.objetos[(B, _med(1)[k])] = b"x"
    s3.objetos[(B, _med(1)["s3_key_resultado"])] = json.dumps({"id_punto": "BLQ-1"}).encode()
    monkeypatch.setattr(m, "s3", s3)
    c = _cuerpo(m.lambda_handler(_post("mover", [_it(1)], destino_bloque_id="BLQ-2"), None))
    assert c == {"ok": ["MED-1"], "error": []}                     # el movimiento sigue siendo ok
    assert s3.intentos[vieja] == 2
    assert [r.getMessage() for r in _orphans(caplog)] and f"key={vieja}" in _orphans(caplog)[0].getMessage()


def test_mover_rollback_de_copia_fallido_registra_orphan(m, monkeypatch, caplog):
    copia = "empresas/EMP-1/BLQ-2/MED-1.jpg"
    s3 = S3Falla(claves={copia})
    for k in ("s3_key_imagen", "s3_key_thumbnail"):
        s3.objetos[(B, _med(1)[k])] = b"x"
    s3.objetos[(B, _med(1)["s3_key_resultado"])] = json.dumps({"id_punto": "BLQ-1"}).encode()
    monkeypatch.setattr(m, "s3", s3)
    m.cliente_ddb.falla = True
    c = _cuerpo(m.lambda_handler(_post("mover", [_it(1)], destino_bloque_id="BLQ-2"), None))
    assert c["ok"] == [] and c["error"][0]["id_medicion"] == "MED-1"
    assert s3.intentos[copia] == 2
    assert f"key={copia}" in _orphans(caplog)[0].getMessage()


# ═══ api_puntos ══════════════════════════════════════════════════════════════

class TablaBloques(fakes.FakeTabla):
    def __init__(self, items):
        super().__init__(items, claves=("id_bloque",))
        self.puts = []

    def delete_item(self, Key):
        self.items = [i for i in self.items if i["id_bloque"] != Key["id_bloque"]]

    def put_item(self, Item, ConditionExpression=None):
        self.puts.append((Item, ConditionExpression))
        self.items.append(Item)

    def update_item(self, Key, UpdateExpression, **_):
        item = next(i for i in self.items if i["id_bloque"] == Key["id_bloque"])
        item.pop(UpdateExpression.split()[1], None)


class TablaConteo(fakes.FakeTabla):
    """query(Select=COUNT) devuelve los conteos de `secuencia` en orden
    (el último se repite): simula una medición que entra entre llamadas."""

    def __init__(self, secuencia):
        super().__init__()
        self.secuencia = list(secuencia)
        self.llamadas = 0

    def query(self, **_):
        n = self.secuencia[min(self.llamadas, len(self.secuencia) - 1)]
        self.llamadas += 1
        return {"Count": n}


@pytest.fixture
def p(monkeypatch):
    mod = _cargar("api_puntos_borrados", "api_puntos", monkeypatch)
    monkeypatch.setattr(mod, "tabla_usuarios", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1", "id_usuario": "U"}]))
    monkeypatch.setattr(mod, "s3", fakes.FakeS3())
    return mod


def _del_bloque(ident="BLQ-1"):
    return {"httpMethod": "DELETE", "resource": "/bloques/{id_bloque}", "pathParameters": {"id_bloque": ident},
            "requestContext": {"authorizer": {"claims": {"sub": "s", "email": "a@b.c"}}}}


def _bloque(portada=None):
    b = {"id_bloque": "BLQ-1", "empresa_id": "EMP-1", "nombre": "Uno"}
    if portada:
        b["portada_key"] = portada
    return b


def test_punto_sin_mediciones_se_borra_con_204(p, monkeypatch):
    monkeypatch.setattr(p, "tabla_bloques", TablaBloques([_bloque()]))
    monkeypatch.setattr(p, "tabla", TablaConteo([0]))
    assert p.lambda_handler(_del_bloque(), None)["statusCode"] == 204
    assert p.tabla_bloques.items == []


def test_punto_con_mediciones_409_sin_borrar(p, monkeypatch):
    monkeypatch.setattr(p, "tabla_bloques", TablaBloques([_bloque()]))
    monkeypatch.setattr(p, "tabla", TablaConteo([3]))
    r = p.lambda_handler(_del_bloque(), None)
    assert r["statusCode"] == 409 and p.tabla_bloques.items == [_bloque()]


def test_punto_carrera_medicion_llega_antes_del_borrado_restaura_y_409(p, monkeypatch):
    portada = "empresas/EMP-1/BLQ-1/portada/x.png"
    monkeypatch.setattr(p, "tabla_bloques", TablaBloques([_bloque(portada)]))
    monkeypatch.setattr(p, "tabla", TablaConteo([0, 1]))            # 1.º conteo 0; tras borrar ya hay una
    r = p.lambda_handler(_del_bloque(), None)
    assert r["statusCode"] == 409
    assert "tiene mediciones" in _cuerpo(r)["error"]
    assert p.tabla_bloques.items == [_bloque(portada)]               # punto restaurado
    assert "attribute_not_exists" in p.tabla_bloques.puts[0][1]      # sin pisar nada
    assert p.s3.eliminados == []                                     # la portada NO se borró


def test_portada_quitar_reintenta_y_registra_orphan(p, monkeypatch, caplog):
    portada = "empresas/EMP-1/BLQ-1/portada/x.png"
    s3 = S3Falla(claves={portada})
    monkeypatch.setattr(p, "s3", s3)
    monkeypatch.setattr(p, "tabla_bloques", TablaBloques([_bloque(portada)]))
    ev = {"httpMethod": "DELETE", "resource": "/bloques/{id_bloque}/portada", "pathParameters": {"id_bloque": "BLQ-1"},
          "requestContext": {"authorizer": {"claims": {"sub": "s", "email": "a@b.c"}}}}
    assert p.lambda_handler(ev, None)["statusCode"] == 200
    assert s3.intentos[portada] == 2
    assert f"key={portada}" in _orphans(caplog)[0].getMessage()


# ═══ api_usuarios ════════════════════════════════════════════════════════════

_EXC = boto3.client("cognito-idp", region_name="us-east-1").exceptions
_NoEncontrado = _EXC.UserNotFoundException


class CognitoFalso:
    """Doble de cognito-idp: `exceptions` real de botocore, llamadas registradas."""

    exceptions = _EXC

    def __init__(self, no_existe=(), falla_delete=None):
        self.no_existe, self.falla_delete = set(no_existe), falla_delete
        self.llamadas = []

    def _usuario(self, op, Username, **_):
        self.llamadas.append((op, Username))
        if Username in self.no_existe:
            raise _NoEncontrado({"Error": {"Code": "UserNotFoundException", "Message": "x"}}, op)

    def admin_delete_user(self, UserPoolId, Username):
        self._usuario("admin_delete_user", Username)

    def admin_disable_user(self, UserPoolId, Username):
        self._usuario("admin_disable_user", Username)

    def admin_user_global_sign_out(self, UserPoolId, Username):
        self._usuario("admin_user_global_sign_out", Username)


class TablaUsuarios(fakes.FakeTabla):
    def __init__(self, items, paginas=None, falla_delete=False):
        super().__init__(items, claves=("id_usuario",))
        self.paginas, self.falla_delete = paginas, falla_delete
        self.borrados, self.actualizados, self.scans = [], [], []

    def delete_item(self, Key):
        if self.falla_delete:
            raise RuntimeError("ProvisionedThroughputExceeded")
        self.borrados.append(Key["id_usuario"])
        self.items = [i for i in self.items if i["id_usuario"] != Key["id_usuario"]]

    def update_item(self, Key, **kw):
        self.actualizados.append(Key["id_usuario"])

    def scan(self, **kw):
        self.scans.append(kw)
        if self.paginas is None:
            return {"Items": []}
        i = int(kw["ExclusiveStartKey"]["pag"]) if "ExclusiveStartKey" in kw else 0
        resp = {"Items": self.paginas[i]}
        if i + 1 < len(self.paginas):
            resp["LastEvaluatedKey"] = {"pag": i + 1}
        return resp


@pytest.fixture
def u(monkeypatch):
    mod = _cargar("api_usuarios_borrados", "api_usuarios", monkeypatch)
    monkeypatch.setattr(mod, "tabla_puntos_mediciones", fakes.FakeTabla())   # sin historial
    return mod


def _tabla_borrado(falla_delete=False):
    return TablaUsuarios([
        {"id_usuario": "ADM", "rol": "admin", "empresa_id": "EMP-1", "email": "adm@x.co"},
        {"id_usuario": "OBJ", "rol": "tecnico", "empresa_id": "EMP-1", "email": "obj@x.co", "cognito_sub": "sub-obj"},
    ], falla_delete=falla_delete)


def _del_usuario():
    return {"httpMethod": "DELETE", "resource": "/usuarios/{id_usuario}/eliminar", "pathParameters": {"id_usuario": "OBJ"},
            "requestContext": {"authorizer": {"claims": {"sub": "s", "email": "adm@x.co"}}}}


def test_eliminar_usuario_ya_borrado_en_cognito_continua_y_borra_la_fila(u, monkeypatch):
    monkeypatch.setattr(u, "tabla", _tabla_borrado())
    monkeypatch.setattr(u, "cognito", CognitoFalso(no_existe={"obj@x.co"}))
    r = u.lambda_handler(_del_usuario(), None)
    assert r["statusCode"] == 200 and u.tabla.borrados == ["OBJ"]


def test_eliminar_usuario_reintento_tras_fallo_de_dynamo_ya_no_da_404_para_siempre(u, monkeypatch):
    tabla = _tabla_borrado(falla_delete=True)
    monkeypatch.setattr(u, "tabla", tabla)
    cog = CognitoFalso()
    monkeypatch.setattr(u, "cognito", cog)
    assert u.lambda_handler(_del_usuario(), None)["statusCode"] == 500       # Cognito borrado, Dynamo falló
    cog.no_existe.add("obj@x.co")                                            # el reintento ve UserNotFound
    tabla.falla_delete = False
    assert u.lambda_handler(_del_usuario(), None)["statusCode"] == 200
    assert tabla.borrados == ["OBJ"]


def test_eliminar_usuario_normal_borra_cognito_y_fila(u, monkeypatch):
    monkeypatch.setattr(u, "tabla", _tabla_borrado())
    cog = CognitoFalso()
    monkeypatch.setattr(u, "cognito", cog)
    assert u.lambda_handler(_del_usuario(), None)["statusCode"] == 200
    assert cog.llamadas == [("admin_delete_user", "obj@x.co")] and u.tabla.borrados == ["OBJ"]


def test_eliminar_usuario_conserva_guarda_409_de_historial(u, monkeypatch):
    monkeypatch.setattr(u, "tabla", _tabla_borrado())
    cog = CognitoFalso()
    monkeypatch.setattr(u, "cognito", cog)
    monkeypatch.setattr(u, "tabla_puntos_mediciones", fakes.FakeTabla([{"x": 1}]))
    assert u.lambda_handler(_del_usuario(), None)["statusCode"] == 409
    assert cog.llamadas == [] and u.tabla.borrados == []


def test_eliminar_usuario_sin_permiso_403(u, monkeypatch):
    tabla = _tabla_borrado()
    tabla.items[0]["rol"] = "cliente"
    monkeypatch.setattr(u, "tabla", tabla)
    cog = CognitoFalso()
    monkeypatch.setattr(u, "cognito", cog)
    assert u.lambda_handler(_del_usuario(), None)["statusCode"] == 403 and cog.llamadas == []


def test_logo_quitar_reintenta_y_registra_orphan(u, monkeypatch, caplog):
    logo = "empresas/EMP-1/logo/x.png"
    s3 = S3Falla(claves={logo})
    monkeypatch.setattr(u, "s3", s3)
    monkeypatch.setattr(u, "tabla", fakes.FakeTabla([{"rol": "admin", "empresa_id": "EMP-1", "id_usuario": "U"}]))

    class Emp(fakes.FakeTabla):
        def update_item(self, **_):
            pass
    monkeypatch.setattr(u, "tabla_empresas", Emp([{"id_empresa": "EMP-1", "logo_key": logo}], claves=("id_empresa",)))
    ev = {"httpMethod": "DELETE", "resource": "/empresas/{id_empresa}/logo", "pathParameters": {"id_empresa": "EMP-1"},
          "requestContext": {"authorizer": {"claims": {"sub": "s", "email": "a@b.c"}}}}
    assert u.lambda_handler(ev, None)["statusCode"] == 200
    assert s3.intentos[logo] == 2
    assert f"key={logo}" in _orphans(caplog)[0].getMessage()


# ── Cleanup de colaboradores ─────────────────────────────────────────────────

def _colab(n):
    return {"id_usuario": f"C{n}", "email": f"c{n}@x.co", "cognito_username": f"c{n}@x.co", "nickname": f"c{n}"}


def test_cleanup_pagina_el_scan_y_cierra_sesiones(u, monkeypatch):
    tabla = TablaUsuarios([], paginas=[[_colab(1)], [_colab(2)], [_colab(3)]])
    cog = CognitoFalso()
    monkeypatch.setattr(u, "tabla", tabla)
    monkeypatch.setattr(u, "cognito", cog)
    r = u.lambda_handler({}, None)                                   # evento de EventBridge: sin httpMethod
    assert json.loads(r["body"]) == {"deshabilitados": 3}
    assert len(tabla.scans) == 3 and "ExclusiveStartKey" in tabla.scans[2]
    assert sorted(tabla.actualizados) == ["C1", "C2", "C3"]
    ops = [op for op, _ in cog.llamadas]
    assert ops == ["admin_disable_user", "admin_user_global_sign_out"] * 3   # sign-out tras cada disable


def test_cleanup_sign_out_user_not_found_no_impide_marcar_inactivo(u, monkeypatch):
    class CogSoloSignOut(CognitoFalso):
        def admin_user_global_sign_out(self, UserPoolId, Username):
            self._usuario("admin_user_global_sign_out", Username)
            raise _NoEncontrado({"Error": {"Code": "UserNotFoundException", "Message": "x"}}, "AdminUserGlobalSignOut")

    tabla = TablaUsuarios([], paginas=[[_colab(1)]])
    monkeypatch.setattr(u, "tabla", tabla)
    monkeypatch.setattr(u, "cognito", CogSoloSignOut())
    assert json.loads(u.lambda_handler({}, None)["body"]) == {"deshabilitados": 1}
    assert tabla.actualizados == ["C1"]


def test_cleanup_no_borra_nada(u, monkeypatch):
    tabla = TablaUsuarios([], paginas=[[_colab(1)]])
    cog = CognitoFalso()
    monkeypatch.setattr(u, "tabla", tabla)
    monkeypatch.setattr(u, "cognito", cog)
    u.lambda_handler({}, None)
    assert tabla.borrados == [] and all(op != "admin_delete_user" for op, _ in cog.llamadas)


# ── POST /colaborador: same creation hierarchy as POST /usuarios ─────────────

def _post_colaborador(rol):
    return {"httpMethod": "POST", "resource": "/colaborador",
            "body": json.dumps({"nickname": "colaborador01", "password": "Clave1234", "dias": 7, "rol": rol}),
            "requestContext": {"authorizer": {"claims": {"sub": "s", "email": "adm@x.co", "cognito:groups": "admin"}}}}


class CognitoCrear(CognitoFalso):
    def admin_create_user(self, **kw):
        self.llamadas.append(("admin_create_user", kw.get("Username")))
        raise AssertionError("must not reach Cognito")


@pytest.mark.parametrize("rol", ["admin", "super_admin"])
def test_admin_no_puede_crear_colaborador_de_rango_igual_o_mayor(u, monkeypatch, rol):
    cog = CognitoCrear()
    monkeypatch.setattr(u, "cognito", cog)
    monkeypatch.setattr(u, "_usuario_actual", lambda ev: {"id_usuario": "ADM", "rol": "admin"})
    r = u.lambda_handler(_post_colaborador(rol), None)
    assert r["statusCode"] == 403 and cog.llamadas == []
