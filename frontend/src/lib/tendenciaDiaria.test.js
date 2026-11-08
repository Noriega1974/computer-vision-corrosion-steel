import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diaEpoch, ejePorcentaje, etiquetaDia, puntosTendencia, resumenAccesible, textoPromedioDia, textoDetalleDia, textoNivelesDia } from './tendenciaDiaria.js';

const dia = (fecha, extra = {}) => ({ fecha, total: 2, promedio_pct: 10, nivel_ponderado: 2, peor_nivel: 3, max_pct: 30, min_pct: 2, por_nivel: [0, 1, 1, 0], ...extra });

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
    assert.deepEqual(p, {
      fecha: '2026-11-03', etiqueta: '3 nov', dia: diaEpoch('2026-11-03'), total: 5, promedio: 12.4, nivel: 1, peorNivel: 3,
      porNivel: [0, 1, 1, 0], minPct: 2, maxPct: 40.5,
    });
  });

  it('tolerates a missing level and keeps only the last N days', () => {
    const [p] = puntosTendencia([dia('2026-11-03', { nivel_ponderado: null, peor_nivel: 9, max_pct: null })]);
    assert.equal(p.nivel, null);
    assert.equal(p.peorNivel, null);
    assert.equal(p.maxPct, null);
    const muchos = Array.from({ length: 10 }, (_, i) => dia(`2026-10-${String(i + 10)}`));
    assert.deepEqual(puntosTendencia(muchos, 3).map((x) => x.fecha), ['2026-10-17', '2026-10-18', '2026-10-19']);
    assert.deepEqual(puntosTendencia(undefined), []);
  });

  it('writes the header and the hover detail', () => {
    const [p] = puntosTendencia([dia('2026-11-03', { promedio_pct: 12.43, total: 1, max_pct: 12.43, peor_nivel: 2 })]);
    assert.equal(textoPromedioDia(p), '3 nov · 12,4% promedio');
    assert.equal(textoDetalleDia(p, () => 'Moderada'), '1 medición · Mín. 2,0% · Máx. 12,4% (Moderada)');
    assert.equal(textoDetalleDia({ ...p, minPct: null, maxPct: null }, () => 'x'), '1 medición');
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
    assert.equal(lineas[0], '9 nov · 10,0% promedio · 2 mediciones · Mín. 2,0% · Máx. 30,0% (Severa) · Severa 1 · Severa 1');
    assert.ok(lineas[6].startsWith('3 nov'));
    assert.deepEqual(resumenAccesible(undefined, () => ''), []);
  });

  it('carries per-level counts and the min-max range, tolerating a backend without min_pct', () => {
    const [p] = puntosTendencia([dia('2026-11-03', { por_nivel: [2, 0, 1, 3], min_pct: 0.2 })]);
    assert.deepEqual(p.porNivel, [2, 0, 1, 3]);
    assert.equal(p.minPct, 0.2);
    assert.equal(textoNivelesDia(p, (n) => `N${n}`), 'N0 2 · N2 1 · N3 3');
    const [viejo] = puntosTendencia([dia('2026-11-03', { min_pct: undefined, por_nivel: undefined })]);
    assert.equal(viejo.minPct, null);
    assert.deepEqual(viejo.porNivel, [0, 0, 0, 0]);
    assert.equal(textoNivelesDia(viejo, () => 'x'), '');
    assert.deepEqual(puntosTendencia([dia('2026-11-03', { por_nivel: [-1, 'x', 2.5, 4] })])[0].porNivel, [0, 0, 0, 4]);
  });

  it('turns dates into whole days for a proportional axis', () => {
    assert.equal(diaEpoch('2026-11-04') - diaEpoch('2026-11-03'), 1);
    assert.equal(diaEpoch('2026-11-07') - diaEpoch('2026-10-01'), 37);
    assert.equal(diaEpoch('raro'), null);
  });

  it('builds a round percentage axis that always contains the maximum', () => {
    assert.deepEqual(ejePorcentaje(71.5), { dominio: [0, 80], ticks: [0, 20, 40, 60, 80] });
    assert.deepEqual(ejePorcentaje(44.7), { dominio: [0, 60], ticks: [0, 20, 40, 60] });
    assert.deepEqual(ejePorcentaje(8), { dominio: [0, 10], ticks: [0, 5, 10] });
    assert.deepEqual(ejePorcentaje(0), { dominio: [0, 5], ticks: [0, 5] });
    assert.deepEqual(ejePorcentaje(97), { dominio: [0, 100], ticks: [0, 25, 50, 75, 100] });
    assert.deepEqual(ejePorcentaje(undefined).dominio, [0, 5]);
  });
});
