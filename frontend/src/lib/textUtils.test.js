import { test } from 'node:test';
import assert from 'node:assert/strict';

import { baseArea, etiquetaBase, formatoPct } from './textUtils.js';

test('medicion antigua sin area_base se lee como foto', () => {
  const m = { area_corroida_pct: 3.2 };
  assert.equal(baseArea(m), 'foto');
  assert.equal(etiquetaBase(m), 'sobre la foto');
});

test('area_base placa se lee como placa', () => {
  const m = { area_base: 'placa' };
  assert.equal(baseArea(m), 'placa');
  assert.equal(etiquetaBase(m), 'sobre la placa');
});

test('area_base foto se lee como foto', () => {
  const m = { area_base: 'foto' };
  assert.equal(baseArea(m), 'foto');
  assert.equal(etiquetaBase(m), 'sobre la foto');
});

test('medicion nula o indefinida se lee como foto', () => {
  for (const m of [null, undefined]) {
    assert.equal(baseArea(m), 'foto');
    assert.equal(etiquetaBase(m), 'sobre la foto');
  }
});

test('valor desconocido de area_base cae a foto', () => {
  assert.equal(baseArea({ area_base: 'otra' }), 'foto');
});

// UploadPage muestra "ÁREA CORROÍDA " + etiquetaBase(result).toUpperCase().
test('la variante en mayusculas de UploadPage conserva la base', () => {
  assert.equal(etiquetaBase({ area_base: 'placa' }).toUpperCase(), 'SOBRE LA PLACA');
  assert.equal(etiquetaBase({}).toUpperCase(), 'SOBRE LA FOTO');
});

test('formatoPct usa coma decimal y tolera nulos', () => {
  assert.equal(formatoPct(1.5), '1,5%');
  assert.equal(formatoPct(null), '0,0%');
});
