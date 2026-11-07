import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { puntosTendencia } from './tendenciaDiaria.js';
import { construirEje, filaConDatosCercana } from './ejeFechasTendencia.js';

const dia = (fecha) => ({ fecha, total: 1, promedio_pct: 5, por_nivel: [0, 1, 0, 0] });
const puntos = puntosTendencia(['2026-09-29', '2026-09-30', '2026-10-01', '2026-11-07'].map(dia));

describe('ejeFechasTendencia', () => {
  it('compact: only days with data, month separator at the change', () => {
    const e = construirEje(puntos, { modo: 'compacto' });
    assert.deepEqual(e.filas.map((f) => f.clave), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-11-07']);
    assert.deepEqual(e.meses, [{ clave: '2026-10-01', texto: 'oct' }, { clave: '2026-11-07', texto: 'nov' }]);
    assert.deepEqual(e.saltos, []);
  });

  it('proportional: one row per calendar day, empty rows are never ticked', () => {
    const e = construirEje(puntos, { modo: 'proporcional', anchoPx: 400 });
    assert.equal(e.filas.length, 40);
    assert.equal(e.filas.filter((f) => f.vacio).length, 36);
    assert.ok(e.ticks.length >= 1 && e.ticks.every((t) => !e.filas.find((f) => f.clave === t).vacio));
    assert.equal(e.ticks.at(-1), '2026-11-07');
    assert.deepEqual(e.meses.map((m) => m.texto), ['oct', 'nov']);
    assert.equal(e.etiquetas['2026-10-15'], '15 oct');
  });

  it('gaps: a marker slot says how many days were skipped', () => {
    const e = construirEje(puntos, { modo: 'saltos' });
    assert.equal(e.filas.length, 5);
    assert.deepEqual(e.saltos, [{ clave: 'salto-2026-11-07', texto: '36 días' }]);
    assert.deepEqual(e.meses.map((m) => m.clave), ['2026-10-01']);
    assert.ok(!e.ticks.includes('salto-2026-11-07'));
  });

  it('thins the labels to fit the width and always names the newest day', () => {
    const muchos = puntosTendencia(Array.from({ length: 30 }, (_, i) => dia(`2026-10-${String(i + 1).padStart(2, '0')}`)));
    const e = construirEje(muchos, { modo: 'compacto', anchoPx: 300, minPx: 48 });
    assert.ok(e.ticks.length <= 7 && e.ticks.length >= 3);
    assert.equal(e.ticks.at(-1), '2026-10-30');
    assert.equal(construirEje(muchos, { anchoPx: 3000 }).ticks.length, 30);
  });

  it('adds the year to the month separator when the year changes; tolerates empty input', () => {
    const e = construirEje(puntosTendencia(['2026-12-30', '2027-01-02'].map(dia)), { modo: 'compacto' });
    assert.deepEqual(e.meses, [{ clave: '2027-01-02', texto: 'ene 2027' }]);
    assert.deepEqual(construirEje(undefined).filas, []);
    assert.equal(construirEje(puntos, { modo: 'raro' }).filas.length, 5);
  });

  it('snaps a hovered empty row to the nearest day with data', () => {
    const { filas } = construirEje(puntos, { modo: 'proporcional' });
    assert.equal(filaConDatosCercana(filas, 5).fecha, '2026-10-01');
    assert.equal(filaConDatosCercana(filas, 30).fecha, '2026-11-07');
    assert.equal(filaConDatosCercana([], 0), null);
  });
});
