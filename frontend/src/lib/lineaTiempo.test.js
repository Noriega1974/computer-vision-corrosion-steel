import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrarMedicionesLineaTiempo,
  agruparPorDia,
  agruparEventosPorDia,
  etiquetarDiaLineaTiempo,
  ANIO_MINIMO_LINEA_TIEMPO,
  COLOR_DIA_SIN_FOTOS,
  aniosDisponiblesLineaTiempo,
  construirBarraAnual,
  construirBarraAnualDesdeResumen,
  repartoVisible,
  COLORES_BARRA_ANUAL,
  rangoFueraDeVentana,
  urlMedicionesRango,
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

  it('repartoVisible da a cada nivel presente al menos 12 % sin perder el total', () => {
    const partes = repartoVisible([300, 0, 0, 1]);
    assert.ok(Math.abs(partes.reduce((a, c) => a + c, 0) - 1) < 1e-9);
    assert.equal(partes[1], 0);
    assert.ok(Math.abs(partes[3] - 0.12) < 1e-9);
    assert.ok(Math.abs(partes[0] - 0.88) < 1e-9);
    // repartos sin niveles pequeños no cambian
    assert.deepEqual(repartoVisible([1, 1, 0, 0]), [0.5, 0.5, 0, 0]);
    assert.deepEqual(repartoVisible([0, 0, 0, 0]), [0, 0, 0, 0]);
    // dos niveles pequeños a la vez
    const tres = repartoVisible([1000, 1, 1, 0]);
    assert.ok(tres[1] >= 0.12 - 1e-9 && tres[2] >= 0.12 - 1e-9);
  });

  it('una foto severa entre cientos sigue ocupando >= 12 % de la altura del día', () => {
    const resumen = [{ fecha: '2026-10-28', total: 301, por_nivel: [300, 0, 0, 1] }];
    const dia = construirBarraAnualDesdeResumen(resumen, 2026).dias.find((d) => d.fechaISO === '2026-10-28');
    const severa = dia.segmentos.find((s) => s.nivel === 3);
    assert.ok(severa.hastaPct - severa.desdePct >= 11.99);
    assert.equal(severa.porcentajeRedondeado, 0);  // el texto conserva la proporción real
    assert.match(dia.resumenTexto, /301 imágenes: 1 severa \(0%\), 300 sin corrosión \(100%\)/);
  });

  it('leve y moderada usan colores claramente distintos en la barra', () => {
    assert.equal(new Set(COLORES_BARRA_ANUAL).size, 4);
    assert.notEqual(COLORES_BARRA_ANUAL[1], COLORES_BARRA_ANUAL[2]);
  });

  it('construirBarraAnualDesdeResumen usa el resumen del servidor, filtra por nivel y descarta datos inválidos', () => {
    const resumen = [
      { fecha: '2026-03-05', total: 5, por_nivel: [2, 1, 1, 1] },
      { fecha: '2026-03-06', total: 2, por_nivel: [null, 'x', -1, NaN] },
      { fecha: '2025-12-31', total: 1, por_nivel: [1, 0, 0, 0] },
      { fecha: '2026-04-01', total: 1 },
    ];
    const barra = construirBarraAnualDesdeResumen(resumen, 2026);
    assert.equal(barra.totalDias, 365);
    assert.equal(barra.diasConFotos, 1);
    assert.equal(barra.totalFotosAnio, 5);
    const soloSeveras = construirBarraAnualDesdeResumen(resumen, 2026, { nivel: '3' });
    assert.equal(soloSeveras.totalFotosAnio, 1);
    assert.deepEqual(soloSeveras.dias.find((d) => d.fechaISO === '2026-03-05').conteoPorNivel, [0, 0, 0, 1]);
  });

  it('construirBarraAnual omite mediciones sin nivel válido en vez de contarlas como sin corrosión', () => {
    const barra = construirBarraAnual([
      { nivel_corrosion: null, timestamp: '2026-10-28T14:00:00Z' },
      { nivel_corrosion: 'abc', timestamp: '2026-10-28T14:00:00Z' },
      { timestamp: '2026-10-28T14:00:00Z' },
      { nivel_corrosion: 1, timestamp: '2026-10-28T14:00:00Z' },
    ], 2026);
    assert.equal(barra.totalFotosAnio, 1);
  });
});

describe('rangoFueraDeVentana', () => {
  // Ventana de 3 con límite 3: la más antigua es del 2026-10-20 (mediodía UTC, día local igual).
  const ventana = [
    { timestamp: '2026-10-28T17:00:00Z' },
    { timestamp: '2026-10-25T17:00:00Z' },
    { timestamp: '2026-10-20T17:00:00Z' },
  ];

  it('es false sin rango o con una ventana incompleta (ya es todo el historial)', () => {
    assert.equal(rangoFueraDeVentana(ventana, '', '', 3), false);
    assert.equal(rangoFueraDeVentana(ventana.slice(0, 2), '2026-01-01', '2026-01-01', 3), false);
    assert.equal(rangoFueraDeVentana([], '2026-01-01', '2026-01-01', 1000), false);
  });

  it('es true cuando el rango llega al día más antiguo cargado o más atrás', () => {
    assert.equal(rangoFueraDeVentana(ventana, '2026-03-05', '2026-03-05', 3), true);
    assert.equal(rangoFueraDeVentana(ventana, '2026-10-20', '2026-10-20', 3), true);
    assert.equal(rangoFueraDeVentana(ventana, '2026-10-01', '2026-10-27', 3), true);
    assert.equal(rangoFueraDeVentana(ventana, '', '2026-10-10', 3), true);
  });

  it('es false cuando el rango cae dentro de la ventana', () => {
    assert.equal(rangoFueraDeVentana(ventana, '2026-10-25', '2026-10-25', 3), false);
    assert.equal(rangoFueraDeVentana(ventana, '2026-10-21', '', 3), false);
    assert.equal(rangoFueraDeVentana(ventana, '', '2026-10-27', 3), false);
  });

  it('ignora fechas inválidas o timestamps ilegibles', () => {
    assert.equal(rangoFueraDeVentana(ventana, '2026-13-40', '', 3), false);
    assert.equal(rangoFueraDeVentana([{ timestamp: 'x' }, { }, { timestamp: null }], '2026-01-01', '', 3), false);
  });
});

describe('urlMedicionesRango', () => {
  it('arma la consulta con límite, resumen y solo los extremos presentes', () => {
    assert.equal(urlMedicionesRango('2026-03-05', '2026-03-06'), '/mediciones/recientes?limit=1000&resumen=1&desde=2026-03-05&hasta=2026-03-06');
    assert.equal(urlMedicionesRango('', '2026-03-06', 50), '/mediciones/recientes?limit=50&resumen=1&hasta=2026-03-06');
  });
});

describe('lineaTiempo.js — día colombiano (UTC-5) alineado con el servidor', () => {
  it('agruparPorDia corta el día a las 05:00Z y ordena de más reciente a más antiguo', () => {
    const meds = [
      { id: 'a', timestamp: '2026-10-27T04:59:59Z' },
      { id: 'b', timestamp: '2026-10-27T05:00:00Z' },
      { id: 'c', timestamp: '2026-10-27T20:00:00Z' },
      { id: 'd' },
    ];
    const dias = agruparPorDia(meds);
    assert.deepEqual(dias.map(([dia]) => dia), ['2026-10-27', '2026-10-26', 'sin-fecha']);
    assert.deepEqual(dias[0][1].map((m) => m.id), ['c', 'b']);
    assert.deepEqual(dias[1][1].map((m) => m.id), ['a']);
  });

  it('agruparPorDia acepta otra clave de día', () => {
    const dias = agruparPorDia([{ timestamp: '2026-10-27T10:00:00Z', k: 'x' }], (m) => m.k);
    assert.equal(dias[0][0], 'x');
  });

  it('el filtro por rango compara días colombianos, no la zona del dispositivo', () => {
    const meds = [
      { id: 'a', timestamp: '2026-10-27T04:59:59Z' },
      { id: 'b', timestamp: '2026-10-27T05:00:00Z' },
    ];
    const r = filtrarMedicionesLineaTiempo(meds, { fechaInicio: '2026-10-27', fechaFin: '2026-10-27' });
    assert.deepEqual(r.map((m) => m.id), ['b']);
  });

  it('la barra anual asigna cada foto al día colombiano', () => {
    const barra = construirBarraAnual([
      { timestamp: '2026-10-27T04:59:59Z', nivel_corrosion: 1 },
      { timestamp: '2027-01-01T04:00:00Z', nivel_corrosion: 1 },
    ], 2026);
    const dia = (iso) => barra.dias.find((d) => d.fechaISO === iso);
    assert.equal(dia('2026-10-26').totalFotos, 1);
    assert.equal(dia('2026-10-27').totalFotos, 0);
    assert.equal(dia('2026-12-31').totalFotos, 1);
  });
});
