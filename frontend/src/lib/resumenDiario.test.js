import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aniosDesde, urlResumenDiario, combinarResumenes, textoMedicionesConLotes, textoMedicionesDia } from './resumenDiario.js';

describe('resumenDiario', () => {
  it('lists years from 2026 up to the current one, never a future year', () => {
    assert.deepEqual(aniosDesde(2026), [2026]);
    assert.deepEqual(aniosDesde(2028), [2026, 2027, 2028]);
    assert.deepEqual(aniosDesde(2020), [2026]);
    assert.deepEqual(aniosDesde(NaN), [2026]);
  });

  it('builds the request URL with optional point and zone', () => {
    assert.equal(urlResumenDiario(2026), '/mediciones/resumen-diario?anio=2026');
    assert.equal(urlResumenDiario(2026, { idPunto: 'BLQ-1' }), '/mediciones/resumen-diario?anio=2026&id_punto=BLQ-1');
    assert.equal(urlResumenDiario(2026, { empresaId: 'all' }), '/mediciones/resumen-diario?anio=2026');
    assert.equal(urlResumenDiario(2026, { empresaId: 'EMP-1' }), '/mediciones/resumen-diario?anio=2026&empresa_id=EMP-1');
  });

  it('merges years: days newest first, totals summed, truncado propagated', () => {
    const r = combinarResumenes([
      { dias: [{ fecha: '2026-02-01' }], totales: { imagenes: 3, lotes: 1, imagenes_en_lotes: 2 }, truncado: false },
      null,
      { dias: [{ fecha: '2027-01-05' }, { fecha: '2027-01-02' }], totales: { imagenes: 4, lotes: 0, imagenes_en_lotes: 0 }, truncado: true },
    ]);
    assert.deepEqual(r.dias.map((d) => d.fecha), ['2027-01-05', '2027-01-02', '2026-02-01']);
    assert.deepEqual(r.totales, { imagenes: 7, lotes: 1, imagenes_en_lotes: 2 });
    assert.equal(r.truncado, true);
    assert.deepEqual(combinarResumenes([]).totales, { imagenes: 0, lotes: 0, imagenes_en_lotes: 0 });
  });
});

describe('resumenDiario vocabulary (mediciones y lotes)', () => {
  it('writes "X mediciones con Y lotes" with singular and plural', () => {
    assert.equal(textoMedicionesConLotes(12, 3), '12 mediciones con 3 lotes');
    assert.equal(textoMedicionesConLotes(1, 1), '1 medición con 1 lote');
    assert.equal(textoMedicionesConLotes(5, 0), '5 mediciones');
    assert.equal(textoMedicionesConLotes(1, 0), '1 medición');
    assert.equal(textoMedicionesConLotes(undefined, undefined), '0 mediciones');
  });

  it('writes the day subtitle "N mediciones · x lotes"', () => {
    assert.equal(textoMedicionesDia(10, { count: 2, imagenes: 8 }), '10 mediciones · 2 lotes');
    assert.equal(textoMedicionesDia(1, { count: 1, imagenes: 1 }), '1 medición · 1 lote');
    assert.equal(textoMedicionesDia(4, { count: 0, imagenes: 0 }), '4 mediciones');
    assert.equal(textoMedicionesDia(4), '4 mediciones');
  });
});
