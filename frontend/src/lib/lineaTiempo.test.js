import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrarMedicionesLineaTiempo,
  agruparEventosPorDia,
  etiquetarDiaLineaTiempo,
  ANIO_MINIMO_LINEA_TIEMPO,
  COLOR_DIA_SIN_FOTOS,
  aniosDisponiblesLineaTiempo,
  construirBarraAnual,
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

  it('compara ids como texto: el cliente API convierte ids numericos a numero', () => {
    const numericas = [
      { id_medicion: 'a', bloque_id: 12, empresa_id: 7, timestamp: '2026-11-02T10:00:00Z' },
      { id_medicion: 'b', id_punto: 13, empresa_id: 8, timestamp: '2026-11-02T11:00:00Z' },
    ];
    assert.equal(filtrarMedicionesLineaTiempo(numericas, { empresaId: '7' }).length, 1);
    assert.equal(filtrarMedicionesLineaTiempo(numericas, { bloqueId: '13' }).length, 1);
    assert.equal(filtrarMedicionesLineaTiempo(numericas, { bloqueId: '12', empresaId: '8' }).length, 0);
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

  it('aniosDisponiblesLineaTiempo arranca en 2026 y nunca incluye años futuros', () => {
    assert.equal(ANIO_MINIMO_LINEA_TIEMPO, 2026);
    const en2026 = aniosDisponiblesLineaTiempo(
      [{ timestamp: '2028-05-01T12:00:00Z' }, { timestamp: '2024-01-01T12:00:00Z' }],
      new Date(2026, 10, 3),
    );
    assert.deepEqual(en2026, [2026]);

    const en2028 = aniosDisponiblesLineaTiempo([], new Date(2028, 1, 10));
    assert.deepEqual(en2028, [2026, 2027, 2028]);
  });

  it('construirBarraAnual genera 365 días en año común y 366 en bisiesto, con gris cuando hay 0 fotos', () => {
    const barra2026 = construirBarraAnual([], 2026);
    assert.equal(barra2026.anio, 2026);
    assert.equal(barra2026.totalDias, 365);
    assert.equal(barra2026.diasConFotos, 0);
    assert.equal(barra2026.totalFotosAnio, 0);
    assert.equal(barra2026.meses.length, 12);
    assert.equal(barra2026.dias[0].fechaISO, '2026-01-01');
    assert.equal(barra2026.dias[364].fechaISO, '2026-12-31');
    assert.equal(barra2026.dias[0].sinFotos, true);
    assert.equal(barra2026.dias[0].gradienteSegmentos, COLOR_DIA_SIN_FOTOS);
    assert.equal(barra2026.dias[0].gradienteSuave, COLOR_DIA_SIN_FOTOS);
    assert.equal(barra2026.dias[0].peorNivel, null);

    const barra2028 = construirBarraAnual([], 2028);
    assert.equal(barra2028.totalDias, 366);
    const feb29 = barra2028.dias.find((d) => d.fechaISO === '2028-02-29');
    assert.ok(feb29);
  });

  it('construirBarraAnual reparte exactamente las proporciones por nivel y genera ambos gradientes', () => {
    const medicionesDiaMixto = [
      { id_medicion: '1', nivel_corrosion: 0, timestamp: '2026-10-28T14:00:00Z' },
      { id_medicion: '2', nivel_corrosion: 0, timestamp: '2026-10-28T14:05:00Z' },
      { id_medicion: '3', nivel_corrosion: 2, timestamp: '2026-10-28T15:00:00Z' },
      { id_medicion: '4', nivel_corrosion: 2, timestamp: '2026-10-28T15:05:00Z' },
      { id_medicion: '5', nivel_corrosion: 3, timestamp: '2026-10-28T16:00:00Z' },
      { id_medicion: '6', nivel_corrosion: 3, timestamp: '2026-10-28T16:05:00Z' },
      { id_medicion: '7', nivel_corrosion: 1, timestamp: '2026-11-02T14:00:00Z' },
    ];
    const barra = construirBarraAnual(medicionesDiaMixto, 2026);
    assert.equal(barra.diasConFotos, 2);
    assert.equal(barra.totalFotosAnio, 7);

    const diaOct28 = barra.dias.find((d) => d.fechaISO === '2026-10-28');
    assert.ok(diaOct28);
    assert.equal(diaOct28.totalFotos, 6);
    assert.equal(diaOct28.sinFotos, false);
    assert.equal(diaOct28.peorNivel, 3);
    assert.deepEqual(diaOct28.conteoPorNivel, [2, 0, 2, 2]);
    assert.equal(diaOct28.segmentos.length, 3);
    assert.equal(diaOct28.segmentos[0].nivel, 0);
    assert.equal(diaOct28.segmentos[0].desdePct, 0);
    assert.equal(diaOct28.segmentos[0].hastaPct, 33.33);
    assert.equal(diaOct28.segmentos[1].nivel, 2);
    assert.equal(diaOct28.segmentos[1].desdePct, 33.33);
    assert.equal(diaOct28.segmentos[1].hastaPct, 66.67);
    assert.equal(diaOct28.segmentos[2].nivel, 3);
    assert.equal(diaOct28.segmentos[2].desdePct, 66.67);
    assert.equal(diaOct28.segmentos[2].hastaPct, 100);
    assert.match(diaOct28.gradienteSegmentos, /#16a34a 0% 33\.33%/);
    assert.match(diaOct28.gradienteSegmentos, /#ea580c 33\.33% 66\.67%/);
    assert.match(diaOct28.gradienteSegmentos, /#dc2626 66\.67% 100%/);
    assert.match(diaOct28.gradienteSuave, /linear-gradient\(to bottom,/);
    assert.notEqual(diaOct28.gradienteSuave, diaOct28.gradienteSegmentos);
    assert.match(diaOct28.resumenTexto, /28\/10\/2026 · 6 imágenes: 2 severa \(33%\), 2 moderada \(33%\), 2 sin corrosión \(33%\)/);
  });
});
