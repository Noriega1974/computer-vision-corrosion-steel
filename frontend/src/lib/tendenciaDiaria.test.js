import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaDia, puntosTendencia, resumenAccesible, textoPromedioDia, textoDetalleDia } from './tendenciaDiaria.js';

const dia = (fecha, extra = {}) => ({ fecha, total: 2, promedio_pct: 10, nivel_ponderado: 2, peor_nivel: 3, max_pct: 30, ...extra });

describe('tendenciaDiaria', () => {
  it('formats day labels without time zone shifts', () => {
    assert.equal(etiquetaDia('2026-11-03'), '3 nov');
    assert.equal(etiquetaDia('2026-01-31'), '31 ene');
    assert.equal(etiquetaDia('raro'), 'raro');
  });

  it('orders days oldest first and skips days without average', () => {
    const pts = puntosTendencia([
      dia('2026-11-03'), dia('2026-11-01', { promedio_pct: 0 }),
      dia('2026-11-02', { promedio_pct: null }), dia('2026-11-04', { promedio_pct: undefined }),
    ]);
    assert.deepEqual(pts.map((p) => p.fecha), ['2026-11-01', '2026-11-03']);
    assert.equal(pts[0].promedio, 0);
  });

  it('maps average, weighted level and worst values', () => {
    const [p] = puntosTendencia([dia('2026-11-03', { promedio_pct: 12.43, total: 5, nivel_ponderado: 1, peor_nivel: 3, max_pct: 40.5 })]);
    assert.deepEqual(p, { fecha: '2026-11-03', etiqueta: '3 nov', total: 5, promedio: 12.4, nivel: 1, peorNivel: 3, peorPct: 40.5 });
  });

  it('tolerates a missing level and keeps only the last N days', () => {
    const [p] = puntosTendencia([dia('2026-11-03', { nivel_ponderado: null, peor_nivel: 9, max_pct: null })]);
    assert.equal(p.nivel, null);
    assert.equal(p.peorNivel, null);
    assert.equal(p.peorPct, null);
    const muchos = Array.from({ length: 10 }, (_, i) => dia(`2026-10-${String(i + 10)}`));
    assert.deepEqual(puntosTendencia(muchos, 3).map((x) => x.fecha), ['2026-10-17', '2026-10-18', '2026-10-19']);
    assert.deepEqual(puntosTendencia(undefined), []);
  });

  it('writes the header and the hover detail', () => {
    const [p] = puntosTendencia([dia('2026-11-03', { promedio_pct: 12.43, total: 1, max_pct: 12.43, peor_nivel: 2 })]);
    assert.equal(textoPromedioDia(p), '3 nov · 12,4% promedio');
    assert.equal(textoDetalleDia(p, () => 'Moderada'), '1 medición · Peor: 12,4% (Moderada)');
    assert.equal(textoDetalleDia({ ...p, peorPct: null }, () => 'x'), '1 medición');
  });

  it('adds the year to the labels only when the days span more than one year', () => {
    assert.equal(etiquetaDia('2026-11-03', { conAnio: true }), '3 nov 2026');
    const mismo = puntosTendencia([dia('2026-10-30'), dia('2026-11-03')]);
    assert.deepEqual(mismo.map((p) => p.etiqueta), ['30 oct', '3 nov']);
    const varios = puntosTendencia([dia('2026-12-30'), dia('2027-01-02')]);
    assert.deepEqual(varios.map((p) => p.etiqueta), ['30 dic 2026', '2 ene 2027']);
  });

  it('lists the last days newest first for screen readers', () => {
    const pts = puntosTendencia(Array.from({ length: 9 }, (_, i) => dia(`2026-11-0${i + 1}`)));
    const lineas = resumenAccesible(pts, () => 'Severa');
    assert.equal(lineas.length, 7);
    assert.equal(lineas[0], '9 nov · 10,0% promedio · 2 mediciones · Peor: 30,0% (Severa)');
    assert.ok(lineas[6].startsWith('3 nov'));
    assert.deepEqual(resumenAccesible(undefined, () => ''), []);
  });
});
