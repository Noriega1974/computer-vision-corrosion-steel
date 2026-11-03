import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aniosDesde, urlResumenDiario, combinarResumenes, textoImagenesYLotes } from './resumenDiario.js';

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

  it('writes the image and batch summary', () => {
    assert.equal(textoImagenesYLotes(1, { count: 0, imagenes: 0 }), '1 imagen');
    assert.equal(textoImagenesYLotes(30, { count: 1, imagenes: 12 }), '30 imágenes · 1 lote con 12 imágenes');
    assert.equal(textoImagenesYLotes(30, { count: 2, imagenes: 1 }), '30 imágenes · 2 lotes con 1 imagen');
    assert.equal(textoImagenesYLotes(2, undefined), '2 imágenes');
  });
});
