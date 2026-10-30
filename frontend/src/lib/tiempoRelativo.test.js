import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tiempoRelativo } from './tiempoRelativo.js';

const AHORA = Date.parse('2026-10-30T12:00:00Z');
const antes = (ms) => new Date(AHORA - ms).toISOString();
const MIN = 60000, H = 60 * MIN, D = 24 * H;
const t = (ms, o) => tiempoRelativo(antes(ms), { ahora: AHORA, ...o });

test('sin fecha devuelve el texto vacio indicado', () => {
  assert.equal(tiempoRelativo(null, { ahora: AHORA }), '');
  assert.equal(tiempoRelativo(undefined, { vacio: '—', ahora: AHORA }), '—');
});

test('minutos y horas', () => {
  assert.equal(t(10 * 1000), 'hace un momento');
  assert.equal(t(5 * MIN), 'hace 5 min');
  assert.equal(t(3 * H), 'hace 3 h');
});

test('dias en singular y plural', () => {
  assert.equal(t(1 * D + H), 'hace 1 día');
  assert.equal(t(2 * D), 'hace 2 días');
});

test('meses y años en singular y plural', () => {
  assert.equal(t(30 * D), 'hace 1 mes');
  assert.equal(t(75 * D), 'hace 2 meses');
  assert.equal(t(366 * D), 'hace 1 año');
  assert.equal(t(800 * D), 'hace 2 años');
});

test('con formatFecha, desde 30 dias muestra la fecha', () => {
  assert.equal(t(40 * D, { formatFecha: () => '20/09/2026' }), '20/09/2026');
  assert.equal(t(29 * D, { formatFecha: () => 'x' }), 'hace 29 días');
});
