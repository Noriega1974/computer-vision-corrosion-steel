import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularIndicadores } from './indicadoresSistema.js';

const AHORA = new Date('2026-10-31T12:00:00Z').getTime();
const hace = (dias) => new Date(AHORA - dias * 86400000).toISOString();
const m = (bloque_id, dias, area_corroida_pct, extra = {}) => ({
  bloque_id, bloque_nombre: `Punto ${bloque_id}`, timestamp: hace(dias), area_corroida_pct, ...extra,
});

test('empty list gives neutral values', () => {
  const r = calcularIndicadores([], AHORA);
  assert.equal(r.totalPuntos, 0);
  assert.equal(r.mayorCorrosion, null);
  assert.equal(r.puntosEmpeoraron, 0);
  assert.equal(r.pctPuntosAlDia, null);
  assert.equal(r.mediciones30Dias, 0);
});

test('highest corrosion uses each point latest measurement, not the worst ever', () => {
  const r = calcularIndicadores([
    m('a', 40, 80), m('a', 2, 10), // old outlier, now 10 %
    m('b', 5, 35, { nivel_corrosion: 3 }),
  ], AHORA);
  assert.deepEqual(r.mayorCorrosion, { pct: 35, punto: 'Punto b', nivel: 3 });
});

test('a point got worse only with a recent rise of at least 2 pp', () => {
  const r = calcularIndicadores([
    m('a', 1, 15), m('a', 20, 10), // +5 recent: counts
    m('b', 1, 11), m('b', 20, 10), // +1: noise
    m('c', 45, 30), m('c', 60, 10), // +20 but old: not this month
    m('d', 1, 50), // single measurement: no comparison
  ], AHORA);
  assert.equal(r.puntosEmpeoraron, 1);
});

test('up-to-date percentage and 30-day count', () => {
  const r = calcularIndicadores([
    m('a', 1, 5), m('a', 10, 5), m('b', 40, 5), m('c', 29, 5), { timestamp: hace(3) },
  ], AHORA);
  assert.equal(r.totalPuntos, 3);
  assert.equal(r.pctPuntosAlDia, 67);
  assert.equal(r.mediciones30Dias, 4); // unassigned measurement still counts as work done
});
