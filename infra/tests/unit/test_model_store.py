"""model_store: selección de modelo por configuración, descarga y caché."""
import hashlib

import pytest

import model_store as ms
from fakes import FakeS3


@pytest.fixture(autouse=True)
def _limpio(monkeypatch):
    ms.reiniciar_cache()
    for k in ("MODEL_TYPE", "MODEL_LOCAL_PATH", "MODEL_SHA256", "MODEL_BUCKET", "MODEL_KEY"):
        monkeypatch.delenv(k, raising=False)
    yield
    ms.reiniciar_cache()


@pytest.fixture
def modelo_falso(tmp_path):
    ruta = tmp_path / "origen.onnx"
    ruta.write_bytes(b"onnx-falso" * 100)
    return ruta


def _env(monkeypatch, tmp_path, **extra):
    monkeypatch.setenv("MODEL_BUCKET", "bucket-modelos")
    monkeypatch.setenv("MODEL_KEY", "unet/unet_final_1024.onnx")
    monkeypatch.setenv("MODEL_CACHE_DIR", str(tmp_path / "cache"))
    for k, v in extra.items():
        monkeypatch.setenv(k, v)


def test_tipo_modelo_por_defecto_es_unet_y_valida(monkeypatch):
    assert ms.tipo_modelo() == "unet"
    monkeypatch.setenv("MODEL_TYPE", " YOLO ")
    assert ms.tipo_modelo() == "yolo"
    monkeypatch.setenv("MODEL_TYPE", "resnet")
    with pytest.raises(ValueError, match="MODEL_TYPE"):
        ms.tipo_modelo()


def test_ruta_modelo_baja_una_vez_y_cachea(monkeypatch, tmp_path, modelo_falso):
    _env(monkeypatch, tmp_path)
    s3 = FakeS3({("bucket-modelos", "unet/unet_final_1024.onnx"): modelo_falso})
    r1, ms1 = ms.ruta_modelo(s3)
    r2, ms2 = ms.ruta_modelo(s3)
    assert r1 == r2 and r1.read_bytes() == modelo_falso.read_bytes()
    assert s3.descargas == [("bucket-modelos", "unet/unet_final_1024.onnx")]
    assert ms1 >= 0 and ms2 == 0  # la segunda vez sale de la caché
    assert not list((tmp_path / "cache").glob("*.part"))


def test_ruta_modelo_verifica_sha256(monkeypatch, tmp_path, modelo_falso):
    s3 = FakeS3({("bucket-modelos", "unet/unet_final_1024.onnx"): modelo_falso})
    _env(monkeypatch, tmp_path, MODEL_SHA256="0" * 64)
    with pytest.raises(RuntimeError, match="SHA256"):
        ms.ruta_modelo(s3)
    assert list((tmp_path / "cache").iterdir()) == []  # no queda nada truncado/inválido

    ok = hashlib.sha256(modelo_falso.read_bytes()).hexdigest()
    monkeypatch.setenv("MODEL_SHA256", ok.upper())
    assert ms.ruta_modelo(s3)[0].exists()


def test_ruta_modelo_sin_configuracion_falla_claro(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    monkeypatch.delenv("MODEL_BUCKET")
    with pytest.raises(RuntimeError, match="MODEL_BUCKET"):
        ms.ruta_modelo(FakeS3())


def test_ruta_modelo_objeto_inexistente_propaga_error(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    with pytest.raises(FileNotFoundError):
        ms.ruta_modelo(FakeS3())
    assert not (tmp_path / "cache" / "unet_final_1024.onnx").exists()


def test_ruta_local_para_desarrollo_y_etiqueta(monkeypatch, tmp_path):
    monkeypatch.setenv("MODEL_LOCAL_PATH", str(tmp_path / "m.onnx"))
    assert ms.ruta_modelo(None) == (tmp_path / "m.onnx", 0)
    assert ms.etiqueta_modelo("unet") == "unet:m.onnx"


def test_etiqueta_usa_la_clave_s3(monkeypatch):
    monkeypatch.setenv("MODEL_KEY", "yolo/yolo_final_ep80_1024.onnx")
    assert ms.etiqueta_modelo("yolo") == "yolo:yolo_final_ep80_1024.onnx"


# ── Separador de placa (segundo modelo, caché independiente) ─────────────────

PLACA_ENV = ("PLATE_MODEL_KEY", "PLATE_MODEL_SHA256", "PLATE_MODEL_LOCAL_PATH")


@pytest.fixture
def _sin_placa(monkeypatch):
    for k in PLACA_ENV:
        monkeypatch.delenv(k, raising=False)


def test_placa_habilitada_solo_con_clave_o_ruta_local(monkeypatch, _sin_placa):
    assert ms.placa_habilitada() is False
    monkeypatch.setenv("PLATE_MODEL_KEY", "  ")
    assert ms.placa_habilitada() is False
    monkeypatch.setenv("PLATE_MODEL_KEY", "placa/sep.onnx")
    assert ms.placa_habilitada() is True
    monkeypatch.delenv("PLATE_MODEL_KEY")
    monkeypatch.setenv("PLATE_MODEL_LOCAL_PATH", "/x/sep.onnx")
    assert ms.placa_habilitada() is True


def test_placa_se_baja_con_su_propia_clave_y_sha(monkeypatch, tmp_path, modelo_falso, _sin_placa):
    _env(monkeypatch, tmp_path, PLATE_MODEL_KEY="placa/sep.onnx")
    s3 = FakeS3({("bucket-modelos", "placa/sep.onnx"): modelo_falso})
    ruta, _ = ms._ruta("PLATE_MODEL", s3)
    assert ruta.name == "sep.onnx" and ruta.read_bytes() == modelo_falso.read_bytes()
    assert s3.descargas == [("bucket-modelos", "placa/sep.onnx")]  # no baja el modelo principal

    ms.reiniciar_cache()
    ruta.unlink()
    monkeypatch.setenv("PLATE_MODEL_SHA256", "0" * 64)
    with pytest.raises(RuntimeError, match="PLATE_MODEL_SHA256"):
        ms._ruta("PLATE_MODEL", s3)
    assert not list((tmp_path / "cache").glob("*"))
    monkeypatch.setenv("PLATE_MODEL_SHA256", hashlib.sha256(modelo_falso.read_bytes()).hexdigest())
    assert ms._ruta("PLATE_MODEL", s3)[0].exists()
    # el SHA del modelo principal no afecta al separador y viceversa
    monkeypatch.setenv("MODEL_SHA256", "f" * 64)
    assert ms._ruta("PLATE_MODEL", s3)[1] == 0


def test_placa_sin_clave_falla_claro_y_local_salta_s3(monkeypatch, tmp_path, _sin_placa):
    _env(monkeypatch, tmp_path)
    with pytest.raises(RuntimeError, match="PLATE_MODEL_KEY"):
        ms._ruta("PLATE_MODEL", FakeS3())
    monkeypatch.setenv("PLATE_MODEL_LOCAL_PATH", str(tmp_path / "s.onnx"))
    assert ms._ruta("PLATE_MODEL", None) == (tmp_path / "s.onnx", 0)
    assert ms.etiqueta_placa() == "placa:s.onnx"
    monkeypatch.delenv("PLATE_MODEL_LOCAL_PATH")
    monkeypatch.setenv("PLATE_MODEL_KEY", "placa/separador_placa_v1_512.onnx")
    assert ms.etiqueta_placa() == "placa:separador_placa_v1_512.onnx"


def test_sesiones_principal_y_placa_se_cachean_por_separado(monkeypatch, tmp_path, _sin_placa):
    onnx = pytest.importorskip("onnx")  # noqa: F841
    import modelo_falso_onnx
    unet = modelo_falso_onnx.construir(tmp_path / "u.onnx")
    placa = modelo_falso_onnx.construir_placa(tmp_path / "p.onnx")
    monkeypatch.setenv("MODEL_LOCAL_PATH", str(unet))
    monkeypatch.setenv("PLATE_MODEL_LOCAL_PATH", str(placa))
    s1, t1 = ms.obtener_sesion(None, 1024)
    p1, tp1 = ms.obtener_sesion_placa(None, 512)
    assert s1 is not p1 and t1["carga_ms"] >= 0 and tp1["carga_ms"] >= 0
    assert ms.obtener_sesion(None, 1024)[0] is s1            # caché del principal
    assert ms.obtener_sesion_placa(None, 512)[0] is p1       # caché del separador
    assert ms.obtener_sesion_placa(None, 512)[1]["carga_ms"] == 0
    with pytest.raises(RuntimeError, match="expects input"):
        ms.reiniciar_cache()
        ms.obtener_sesion_placa(None, 1024)                  # el tamaño se valida por modelo
