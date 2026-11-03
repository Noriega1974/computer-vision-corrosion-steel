import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumericStrings } from './numericStrings.js';

test('converts numeric strings but keeps dates and ids with letters', () => {
  const r = parseNumericStrings({ area_corroida_pct: '12.5', nivel: '3', timestamp: '2026-11-01T10:00:00Z', id: 'MED-1' });
  assert.deepEqual(r, { area_corroida_pct: 12.5, nivel: 3, timestamp: '2026-11-01T10:00:00Z', id: 'MED-1' });
});

test('name-like fields stay strings even when they look numeric', () => {
  const r = parseNumericStrings({
    nombre: '2026', lote_nombre: '15', notas: '100', bloque_nombre: '7', empresa_nombre: '42', area_corroida_pct: '2026',
  });
  assert.equal(r.nombre, '2026');
  assert.equal(r.lote_nombre, '15');
  assert.equal(r.notas, '100');
  assert.equal(r.bloque_nombre, '7');
  assert.equal(r.empresa_nombre, '42');
  assert.equal(r.area_corroida_pct, 2026);
});

test('name-like fields stay strings inside nested arrays and objects', () => {
  const r = parseNumericStrings({ items: [{ nombre: '2026', pct: '1' }], lotes: { a: { lote_nombre: '9' } } });
  assert.deepEqual(r, { items: [{ nombre: '2026', pct: 1 }], lotes: { a: { lote_nombre: '9' } } });
});
