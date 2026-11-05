"""DELETE /empresas/{id_empresa} (api_usuarios): solo super_admin y solo una zona vacía.
Todo local: DynamoDB y S3 son dobles en memoria."""
import json
import uuid

import pytest

import fakes
from test_borrados_robustos import _cargar

B = "bucket-de-prueba"
RECURSO = "/empresas/{id_empresa}"


class TablaPorIndice(fakes.FakeTabla):
    """query() que distingue el índice: `cognito-sub-index` devuelve al usuario que
    llama; `empresa-index` / `empresa_id-index` cuentan los ítems de esa empresa."""

    def __init__(self, items, llamante=None):
        super().__init__(items)
        self.llamante = llamante

    def query(self, **kw):
        if kw["IndexName"] == "cognito-sub-index":
            return {"Items": [self.llamante] if self.llamante else []}
        empresa = kw["KeyConditionExpression"]._values[1]
        coinciden = [i for i in self.items if i.get("empresa_id") == empresa]
        if kw.get("Select") == "COUNT":
            return {"Count": len(coinciden)}
        return {"Items": coinciden}


class S3Lista(fakes.FakeS3):
    """FakeS3 con list_objects_v2 paginado (2 por página) y tamaño de objeto."""

    def list_objects_v2(self, Bucket, Prefix, ContinuationToken=None):
        claves = sorted(k for (b, k) in self.objetos if b == Bucket and k.startswith(Prefix))
        inicio = int(ContinuationToken or 0)
        pagina = claves[inicio:inicio + 2]
        resp = {"Contents": [{"Key": k, "Size": len(self.objetos[(Bucket, k)])} for k in pagina]}
        if inicio + 2 < len(claves):
            resp.update(IsTruncated=True, NextContinuationToken=str(inicio + 2))
        return resp


@pytest.fixture
def u(monkeypatch):
    mod = _cargar("api_usuarios_eliminar_zona", "api_usuarios", monkeypatch)
    monkeypatch.setenv("TABLA_BLOQUES", "t-blq")
    s3 = S3Lista()
    monkeypatch.setattr(mod, "s3", s3)
    monkeypatch.setattr(mod, "tabla_empresas", fakes.FakeTabla(
        [{"id_empresa": "EMP-1", "nombre": "Uno"}, {"id_empresa": "EMP-2", "nombre": "Dos"}], claves=("id_empresa",)))
    monkeypatch.setattr(mod, "tabla", TablaPorIndice([], {"rol": "super_admin", "id_usuario": "U"}))
    monkeypatch.setattr(mod, "tabla_bloques", TablaPorIndice([]))
    return mod


def _rol(u, monkeypatch, rol, empresa="EMP-1"):
    monkeypatch.setattr(u, "tabla", TablaPorIndice([], {"rol": rol, "empresa_id": empresa, "id_usuario": "U"}))


def _delete(id_empresa="EMP-1"):
    return {"httpMethod": "DELETE", "resource": RECURSO, "pathParameters": {"id_empresa": id_empresa},
            "requestContext": {"authorizer": {"claims": {"sub": "s", "email": "a@b.c"}}}}


def _cuerpo(r):
    return json.loads(r["body"])


def _ids(u):
    return [e["id_empresa"] for e in u.tabla_empresas.items]


@pytest.mark.parametrize("rol", ["admin", "tecnico", "cliente"])
def test_roles_distintos_de_super_admin_403(u, monkeypatch, rol):
    _rol(u, monkeypatch, rol)
    assert u.lambda_handler(_delete(), None)["statusCode"] == 403
    assert _ids(u) == ["EMP-1", "EMP-2"]


def test_sin_registro_403(u, monkeypatch):
    monkeypatch.setattr(u, "tabla", TablaPorIndice([], None))
    assert u.lambda_handler(_delete(), None)["statusCode"] == 403


def test_no_existe_404(u):
    assert u.lambda_handler(_delete("EMP-zzz"), None)["statusCode"] == 404


def test_con_puntos_409_con_conteo(u):
    u.tabla_bloques.items = [{"id_bloque": "B1", "empresa_id": "EMP-1"}, {"id_bloque": "B2", "empresa_id": "EMP-1"}]
    r = u.lambda_handler(_delete(), None)
    assert r["statusCode"] == 409 and _cuerpo(r)["puntos"] == 2 and _cuerpo(r)["usuarios"] == 0
    assert "2 puntos" in _cuerpo(r)["error"] and "usuario" not in _cuerpo(r)["error"].split("aún tiene")[1].split(".")[0]
    assert _ids(u) == ["EMP-1", "EMP-2"]


def test_con_usuarios_409_con_conteo(u, monkeypatch):
    monkeypatch.setattr(u, "tabla", TablaPorIndice(
        [{"id_usuario": "X", "empresa_id": "EMP-1"}], {"rol": "super_admin", "id_usuario": "U"}))
    r = u.lambda_handler(_delete(), None)
    assert r["statusCode"] == 409 and _cuerpo(r)["usuarios"] == 1 and "1 usuario" in _cuerpo(r)["error"]


def test_con_puntos_y_usuarios_menciona_ambos_y_no_toca_s3(u, monkeypatch):
    u.tabla_bloques.items = [{"id_bloque": "B1", "empresa_id": "EMP-1"}]
    monkeypatch.setattr(u, "tabla", TablaPorIndice(
        [{"id_usuario": "X", "empresa_id": "EMP-1"}, {"id_usuario": "Y", "empresa_id": "EMP-1"}], {"rol": "super_admin"}))
    u.s3.objetos[(B, "empresas/EMP-1/")] = b""
    r = u.lambda_handler(_delete(), None)
    assert r["statusCode"] == 409 and "1 punto y 2 usuarios" in _cuerpo(r)["error"]
    assert u.s3.eliminados == [] and (B, "empresas/EMP-1/") in u.s3.objetos


def test_vacia_se_borra_con_logo_y_marcadores(u):
    logo = f"empresas/EMP-1/logo/{uuid.uuid4()}.png"
    u.tabla_empresas.items[0]["logo_key"] = logo
    for k in ("empresas/EMP-1/", "empresas/EMP-1/BLQ-viejo/"):
        u.s3.objetos[(B, k)] = b""
    u.s3.objetos[(B, logo)] = b"png"
    u.s3.objetos[(B, "empresas/EMP-2/")] = b""          # otra zona: no se toca
    r = u.lambda_handler(_delete(), None)
    assert r["statusCode"] == 200 and _cuerpo(r) == {"ok": True, "id_empresa": "EMP-1"}
    assert _ids(u) == ["EMP-2"]
    assert {k for _, k in u.s3.eliminados} == {"empresas/EMP-1/", "empresas/EMP-1/BLQ-viejo/", logo}
    assert (B, "empresas/EMP-2/") in u.s3.objetos


def test_vacia_sin_objetos_en_s3_tambien_se_borra(u):
    assert u.lambda_handler(_delete(), None)["statusCode"] == 200 and _ids(u) == ["EMP-2"]


def test_objetos_reales_frenan_el_borrado_y_no_se_borra_nada(u):
    u.s3.objetos[(B, "empresas/EMP-1/")] = b""
    u.s3.objetos[(B, "empresas/EMP-1/BLQ-1/MED-1.jpg")] = b"foto"
    r = u.lambda_handler(_delete(), None)
    assert r["statusCode"] == 409 and _cuerpo(r)["archivos"] == 1
    assert u.s3.eliminados == [] and _ids(u) == ["EMP-1", "EMP-2"]


def test_si_falla_el_borrado_de_s3_el_item_se_conserva(u, monkeypatch):
    u.s3.objetos[(B, "empresas/EMP-1/")] = b""

    def falla(Bucket, Key):
        raise RuntimeError("AccessDenied")

    monkeypatch.setattr(u.s3, "delete_object", falla)
    assert u.lambda_handler(_delete(), None)["statusCode"] == 500
    assert _ids(u) == ["EMP-1", "EMP-2"]
