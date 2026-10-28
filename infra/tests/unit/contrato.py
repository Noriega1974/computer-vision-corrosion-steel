"""Contrato de respuesta de POST /medicion que consumen la web y el móvil.

Los campos salen de leer el frontend (computer-vision-corrosion-steel/
frontend/src): UploadPage, DeteccionIAPage, MedicionDetailPage, GaleriaPage,
PlantDetail, KPIBar, ChartsRow, BoundingBoxOverlay y SegmentationOverlay.
"""

# Campos de primer nivel que el frontend lee de una medición.
CAMPOS_FRONTEND = {
    "nivel_corrosion", "area_corroida_pct", "confianza_promedio",
    "detecciones", "mascaras",
    "id_medicion", "id_punto", "timestamp", "s3_key_imagen", "s3_key_thumbnail",
}
CLAVES_DETECCION = {"x", "y", "w", "h", "confianza", "clase"}


def validar_contrato(cuerpo: dict) -> None:
    faltan = CAMPOS_FRONTEND - cuerpo.keys()
    assert not faltan, f"faltan campos del contrato: {faltan}"

    assert cuerpo["nivel_corrosion"] in (0, 1, 2, 3)
    assert isinstance(cuerpo["area_corroida_pct"], (int, float))
    assert 0.0 <= cuerpo["area_corroida_pct"] <= 100.0
    assert 0.0 <= cuerpo["confianza_promedio"] <= 1.0

    dets, masks = cuerpo["detecciones"], cuerpo["mascaras"]
    assert isinstance(dets, list) and isinstance(masks, list)
    assert len(dets) == len(masks), "detecciones y mascaras deben ir alineadas por índice"
    for d in dets:
        assert CLAVES_DETECCION <= d.keys(), d
        assert d["clase"] == "corrosion"
        for k in ("x", "y", "w", "h", "confianza"):
            assert 0.0 <= d[k] <= 1.0, (k, d)
    for m in masks:
        pts = m["puntos"]
        assert len(pts) >= 3, "un polígono con <3 puntos rompe SegmentationOverlay"
        for p in pts:
            assert set(p) == {"x", "y"}
            assert 0.0 <= p["x"] <= 1.0 and 0.0 <= p["y"] <= 1.0
    if not dets:
        assert cuerpo["confianza_promedio"] == 0.0
