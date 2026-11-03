import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrarMedicionesLineaTiempo,
  agruparEventosPorDia,
  etiquetarDiaLineaTiempo,
} from './lineaTiempo.js';

// Local-day grouping depends on the machine zone: pin it to the product's zone.
process.env.TZ = 'America/Bogota';

describe('lineaTiempo.js — filtrado y agrupación cronológica', () => {
  const muestra = [
    {
      id_medicion: 'm1',
      empresa_id: 'EMP-1',
      bloque_id: 'BLQ-1',
      bloque_nombre: 'Puente Norte',
      nivel_corrosion: 1,
      area_corroida_pct: '4.5',
      timestamp: '2026-11-02T14:00:00Z',
      nombre: 'Placa A1',
      creado_por_nombre: 'Ana',
    },
    {
      id_medicion: 'm2',
      empresa_id: 'EMP-1',
      bloque_id: 'BLQ-1',
      bloque_nombre: 'Puente Norte',
      nivel_corrosion: 3,
      area_corroida_pct: '32.0',
      lote_id: 'LOT-10',
      lote_nombre: 'Inspección mensual',
      timestamp: '2026-11-02T15:10:00Z',
      creado_por_nombre: 'Carlos',
    },
    {
      id_medicion: 'm3',
      empresa_id: 'EMP-1',
      bloque_id: 'BLQ-1',
      bloque_nombre: 'Puente Norte',
      nivel_corrosion: 2,
      area_corroida_pct: '12.0',
      lote_id: 'LOT-10',
      lote_nombre: 'Inspección mensual',
      timestamp: '2026-11-02T15:05:00Z',
      creado_por_nombre: 'Carlos',
    },
    {
      id_medicion: 'm4',
      empresa_id: 'EMP-2',
      bloque_id: 'BLQ-2',
      bloque_nombre: 'Torre Sur',
      nivel_corrosion: 0,
      area_corroida_pct: '0.0',
      timestamp: '2026-11-01T16:00:00Z',
      notas: 'Sin novedad',
    },
  ];

  it('filtra por empresa, punto, nivel, fechas y texto libre sin tildes', () => {
    assert.equal(filtrarMedicionesLineaTiempo(muestra, { empresaId: 'EMP-2' }).length, 1);
    assert.equal(filtrarMedicionesLineaTiempo(muestra, { bloqueId: 'BLQ-1' }).length, 3);
    assert.equal(filtrarMedicionesLineaTiempo(muestra, { nivel: '3' }).length, 1);
    assert.equal(
      filtrarMedicionesLineaTiempo(muestra, { fechaInicio: '2026-11-02', fechaFin: '2026-11-02' }).length,
      3,
    );
    assert.equal(filtrarMedicionesLineaTiempo(muestra, { busqueda: 'inspeccion mensual' }).length, 2);
  });

  it('agrupa por día local de más reciente a más antiguo y colapsa lotes del mismo día', () => {
    const ref = new Date(2026, 10, 2, 18, 0, 0); // 2026-11-02 local
    const dias = agruparEventosPorDia(muestra, { ahora: ref });
    assert.equal(dias.length, 2);

    const hoy = dias[0];
    assert.equal(hoy.fechaISO, '2026-11-02');
    assert.equal(hoy.etiquetaDia, 'Hoy · Lun 2 nov');
    assert.equal(hoy.totalEventos, 2);
    assert.equal(hoy.totalFotos, 3);

    const evLote = hoy.eventos[0];
    assert.equal(evLote.tipo, 'lote');
    assert.equal(evLote.id, 'LOT-10');
    assert.equal(evLote.loteNombre, 'Inspección mensual');
    assert.equal(evLote.totalFotos, 2);
    assert.equal(evLote.peorPct, 32);
    assert.equal(evLote.peorNivel, 3);
    assert.equal(evLote.promedioPct, 22);
    assert.equal(evLote.autor, 'Carlos');
    assert.equal(evLote.mediciones.length, 2);

    const evIndividual = hoy.eventos[1];
    assert.equal(evIndividual.tipo, 'medicion');
    assert.equal(evIndividual.id, 'm1');

    const ayer = dias[1];
    assert.equal(ayer.fechaISO, '2026-11-01');
    assert.equal(ayer.etiquetaDia, 'Ayer · Dom 1 nov');
  });

  it('etiquetarDiaLineaTiempo distingue Hoy, Ayer y fechas anteriores', () => {
    const ref = new Date(2026, 10, 2, 12, 0, 0);
    assert.equal(etiquetarDiaLineaTiempo('2026-11-02', ref), 'Hoy · Lun 2 nov');
    assert.equal(etiquetarDiaLineaTiempo('2026-11-01', ref), 'Ayer · Dom 1 nov');
    assert.equal(etiquetarDiaLineaTiempo('2026-10-30', ref), 'Vie 30 oct');
  });

  it('agrupa por día de Colombia: 21:30 locales cuenta en su día aunque en UTC ya sea el siguiente', () => {
    const ref = new Date(2026, 10, 3, 9, 0, 0);
    const dias = agruparEventosPorDia(
      [
        { id_medicion: 'noche', timestamp: '2026-11-03T02:30:00Z' }, // 2026-11-02 21:30 Bogota
        { id_medicion: 'pasada', timestamp: '2026-10-15T15:30:45.123456+00:00' }, // past-dated upload
      ],
      { ahora: ref },
    );
    assert.deepEqual(dias.map(d => d.fechaISO), ['2026-11-02', '2026-10-15']);
  });

  it('un lote subido con fecha pasada es un solo evento ese día', () => {
    const lote = ['a', 'b', 'c'].map((id, i) => ({
      id_medicion: id, lote_id: 'LOT-P', lote_nombre: 'Pasado', bloque_id: 'B', area_corroida_pct: 1,
      timestamp: `2026-10-15T15:30:45.12345${i}+00:00`,
    }));
    const dias = agruparEventosPorDia(lote, { ahora: new Date(2026, 10, 3) });
    assert.equal(dias.length, 1);
    assert.equal(dias[0].totalEventos, 1);
    assert.equal(dias[0].eventos[0].totalFotos, 3);
  });

  it('mediciones sin fecha válida quedan en "Sin fecha" y no rompen el orden', () => {
    const dias = agruparEventosPorDia(
      [{ id_medicion: 'x', timestamp: 'no-es-fecha' }, { id_medicion: 'y', timestamp: '2026-11-02T14:00:00Z' }],
      { ahora: new Date(2026, 10, 3) },
    );
    assert.equal(dias.at(-1).etiquetaDia, 'Sin fecha');
  });
});
