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
    m('e', 1, 40), m('e', 35, 10), // +30 but the baseline is outside the window
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

test('worsening boundary: exactly +2 pp counts, just below does not', () => {
  const r = calcularIndicadores([
    m('a', 1, 12), m('a', 5, 10), // exactly +2
    m('b', 1, 11.9), m('b', 5, 10), // +1.9
  ], AHORA);
  assert.equal(r.puntosEmpeoraron, 1);
});

test('worsening window edge: baseline exactly 30 days old is inside, older is outside', () => {
  const dentro = calcularIndicadores([m('a', 1, 20), m('a', 30, 10)], AHORA);
  const fuera = calcularIndicadores([m('a', 1, 20), m('a', 30.01, 10)], AHORA);
  assert.equal(dentro.puntosEmpeoraron, 1);
  assert.equal(fuera.puntosEmpeoraron, 0);
});

test('worsening skips an in-window baseline without percentage and uses the next in-window one', () => {
  const r = calcularIndicadores([
    m('a', 1, 20), m('a', 5, null), m('a', 10, 10),
  ], AHORA);
  assert.equal(r.puntosEmpeoraron, 1);
});
