import { test } from 'node:test';
import assert from 'node:assert/strict';

import { comparacionAnalisis } from './analisisAnterior.js';

test('sin analisis_anterior no hay comparacion', () => {
  assert.equal(comparacionAnalisis({ area_corroida_pct: 3 }), null);
  assert.equal(comparacionAnalisis(null), null);
  assert.equal(comparacionAnalisis({ analisis_anterior: {} }), null);
});

test('antes sobre la foto con YOLO, ahora sobre la placa', () => {
  const c = comparacionAnalisis({
    area_corroida_pct: 7.3, nivel_corrosion: 1, area_base: 'placa',
    analisis_anterior: { area_corroida_pct: 2.2, nivel_corrosion: 1, modelo: 'yolo:best.onnx', fecha: '2026-10-01T12:00:00+00:00' },
  });
  assert.equal(c.anterior, '2,2% (Leve, sobre la foto, modelo yolo:best.onnx)');
  assert.equal(c.actual, '7,3% (Leve, sobre la placa)');
});

test('el nivel cambia y el anterior ya traia area_base', () => {
  const c = comparacionAnalisis({
    area_corroida_pct: 30, nivel_corrosion: 3, area_base: 'foto',
    analisis_anterior: { area_corroida_pct: 12.5, nivel_corrosion: 2, area_base: 'placa' },
  });
  assert.equal(c.anterior, '12,5% (Moderada, sobre la placa)');
  assert.equal(c.actual, '30,0% (Severa, sobre la foto)');
});
