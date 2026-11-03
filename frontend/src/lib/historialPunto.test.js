import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparHistorialPuntoPorDia,
  formatearFechaDiaPunto,
} from './historialPunto.js';

process.env.TZ = 'America/Bogota';

describe('historialPunto.js — agrupación por día del detalle de ubicación', () => {
  it('formatearFechaDiaPunto convierte YYYY-MM-DD a DD/MM/YYYY', () => {
    assert.equal(formatearFechaDiaPunto('2026-10-28'), '28/10/2026');
    assert.equal(formatearFechaDiaPunto('sin-fecha'), 'Sin fecha');
    assert.equal(formatearFechaDiaPunto(''), 'Sin fecha');
  });

  it('agrupa mediciones por día local descendente con conteos de imágenes y lotes', () => {
    const mediciones = [
      {
        id_medicion: 'm1',
        lote_id: 'LOT-A',
        lote_nombre: 'Inspección mañana',
        nivel_corrosion: 2,
        area_corroida_pct: 14.2,
        timestamp: '2026-10-28T14:00:00Z',
      },
      {
        id_medicion: 'm2',
        lote_id: 'LOT-A',
        lote_nombre: 'Inspección mañana',
        nivel_corrosion: 3,
        area_corroida_pct: 29.8,
        timestamp: '2026-10-28T14:05:00Z',
      },
      {
        id_medicion: 'm3',
        nivel_corrosion: 0,
        area_corroida_pct: 0,
        timestamp: '2026-10-28T18:00:00Z',
      },
      {
        id_medicion: 'm4',
        nivel_corrosion: 1,
        area_corroida_pct: 3.4,
        timestamp: '2026-11-02T15:00:00Z',
      },
    ];

    const dias = agruparHistorialPuntoPorDia(mediciones);
    assert.equal(dias.length, 2);

    assert.equal(dias[0].fechaISO, '2026-11-02');
    assert.equal(dias[0].fechaEtiqueta, '02/11/2026');
    assert.equal(dias[0].etiquetaDia, '1 imagen · 02/11/2026');
    assert.equal(dias[0].etiquetaConteo, '1 imagen · 0 lotes con 0 imágenes');
    assert.equal(dias[0].peorNivel, 1);
    assert.equal(dias[0].peorPct, 3.4);

    assert.equal(dias[1].fechaISO, '2026-10-28');
    assert.equal(dias[1].etiquetaDia, '3 imágenes · 28/10/2026');
    assert.equal(dias[1].etiquetaConteo, '3 imágenes · 1 lote con 2 imágenes');
    assert.equal(dias[1].peorNivel, 3);
    assert.equal(dias[1].peorPct, 29.8);
    assert.equal(dias[1].lotes.length, 1);
    assert.equal(dias[1].lotes[0].nombre, 'Inspección mañana');
    assert.equal(dias[1].sueltas.length, 1);
  });
});
