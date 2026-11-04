import { test } from 'node:test';
import assert from 'node:assert/strict';

import { baseArea, etiquetaBase, formatoPct, formatoMB, plural } from './textUtils.js';

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

test('plural escribe singular solo con 1', () => {
  assert.equal(plural(1, 'medición', 'mediciones'), '1 medición');
  assert.equal(plural(0, 'lote', 'lotes'), '0 lotes');
  assert.equal(plural(12, 'lote', 'lotes'), '12 lotes');
});

test('formatoMB usa coma decimal y tolera nulos', () => {
  assert.equal(formatoMB(1536 * 1024), '1,5 MB');
  assert.equal(formatoMB(60 * 1024 * 1024), '60,0 MB');
  assert.equal(formatoMB(null), '0,0 MB');
});
