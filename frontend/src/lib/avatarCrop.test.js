import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENEDOR_VISOR,
  MARCO_RECORTE,
  RADIO_RECORTE,
  SALIDA_AVATAR,
  ZOOM_MIN_AVATAR,
  ZOOM_MAX_AVATAR,
  calcularEscalaBase,
  acotarZoomAvatar,
  limitarOffsetRecorte,
  zoomAvatarEnPunto,
  escalaExportacionRecorte,
  RATIO_RADIO_AVATAR,
  RADIO_AVATAR_PORCENTAJE,
  radioAvatarPx,
} from './avatarCrop.js';

describe('avatarCrop.js — coherencia geométrica del recorte y zoom', () => {
  it('mantiene la misma proporción de esquinas redondeadas (25 %) que el avatar de 56px con radio 14px', () => {
    assert.equal(RADIO_RECORTE / MARCO_RECORTE, 14 / 56);
    assert.ok(CONTENEDOR_VISOR > MARCO_RECORTE);
  });

  it('calcularEscalaBase cubre exactamente el marco de recorte por el lado más corto', () => {
    // Imagen 448x896 sobre marco 224 -> escala base 0.5 (448 * 0.5 = 224)
    const base = calcularEscalaBase(448, 896, MARCO_RECORTE);
    assert.equal(base, 0.5);
  });

  it('limitarOffsetRecorte impide que queden bordes vacíos dentro del marco de recorte', () => {
    // Imagen 448x896 con base 0.5 -> ancho 224 (maxX = 0), alto 448 (maxY = 112)
    const lim = limitarOffsetRecorte({ x: 50, y: -300 }, 0.5, 448, 896, MARCO_RECORTE);
    assert.deepEqual(lim, { x: 0, y: -112 });
  });

  it('zoomAvatarEnPunto acota el zoom a [1, 4] y conserva el punto bajo el cursor', () => {
    const base = calcularEscalaBase(448, 448, MARCO_RECORTE); // 0.5
    const r1 = zoomAvatarEnPunto({ zoom: 1, offset: { x: 0, y: 0 } }, 2, 20, -10, base, 448, 448);
    assert.equal(r1.zoom, 2);
    assert.deepEqual(r1.offset, { x: -20, y: 10 });

    const rMax = zoomAvatarEnPunto(r1, 10, 0, 0, base, 448, 448);
    assert.equal(rMax.zoom, ZOOM_MAX_AVATAR);

    const rMin = zoomAvatarEnPunto(r1, 0.05, 0, 0, base, 448, 448);
    assert.equal(rMin.zoom, ZOOM_MIN_AVATAR);
    assert.deepEqual(rMin.offset, { x: 0, y: 0 });
  });

  it('escalaExportacionRecorte mapea el marco guía de 224px exactamente al lienzo de 320px', () => {
    const outScale = escalaExportacionRecorte(MARCO_RECORTE, SALIDA_AVATAR);
    assert.equal(MARCO_RECORTE * outScale, SALIDA_AVATAR);
  });

  it('radioAvatarPx aplica la misma proporción de esquinas en todos los tamaños de avatar', () => {
    assert.equal(RATIO_RADIO_AVATAR, 0.25);
    assert.equal(RADIO_AVATAR_PORCENTAJE, '25%');
    assert.equal(radioAvatarPx(56), 14); // Configuración
    assert.equal(radioAvatarPx(35), 9); // barra lateral
    assert.equal(radioAvatarPx(MARCO_RECORTE), RADIO_RECORTE); // guía del recortador
  });
});
