import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_SEMANA_CORTOS,
  hoyLocalISO,
  esFechaISOValida,
  esFechaFutura,
  inicioDiaLocal,
  finDiaLocal,
  desplazarDiasISO,
  inicioMesISO,
  formatearFechaAmigable,
  contarDiasRango,
  resumenRangoContextual,
  construirGrillaMes,
  sumarMesesISO,
  moverFocoGrilla,
  aplicarClickRango,
  rangoAConfirmar,
  etiquetaFiltroFechas,
} from './fechas.js';

// Pin the zone BEFORE any Date is built: the "after 19:00 in Colombia" case only
// proves anything when the process really runs at UTC-5. The first test asserts
// the pin took effect so a runtime that ignores it fails loudly instead of
// passing vacuously.
process.env.TZ = 'America/Bogota';

describe('fechas.js — utilidades de calendario y validación local', () => {
  it('usa encabezados de 2 letras en español sin ambigüedad entre martes y miércoles', () => {
    assert.deepEqual(DIAS_SEMANA_CORTOS, ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']);
    assert.notEqual(DIAS_SEMANA_CORTOS[1], DIAS_SEMANA_CORTOS[2]);
  });

  it('la zona horaria fijada (America/Bogota, UTC-5) está activa', () => {
    assert.equal(new Date(2026, 10, 2, 12, 0, 0).getTimezoneOffset(), 300);
  });

  it('hoyLocalISO usa componentes locales y evita el salto de día UTC tras las 19:00 en Colombia', () => {
    // 2 de noviembre de 2026 a las 21:30 hora local (en UTC-5 ya es 3 de noviembre 02:30Z)
    const nocheLocal = new Date(2026, 10, 2, 21, 30, 0);
    assert.equal(nocheLocal.toISOString().slice(0, 10), '2026-11-03'); // la implementación vieja fallaba aquí
    assert.equal(hoyLocalISO(nocheLocal), '2026-11-02');
    // Mismo instante expresado en UTC
    assert.equal(hoyLocalISO(new Date('2026-11-03T02:30:00Z')), '2026-11-02');
  });

  it('esFechaISOValida acepta fechas reales y rechaza fechas inexistentes o mal formadas', () => {
    assert.equal(esFechaISOValida('2026-10-15'), true);
    assert.equal(esFechaISOValida('2024-02-29'), true); // bisiesto
    assert.equal(esFechaISOValida('2026-02-29'), false); // no bisiesto
    assert.equal(esFechaISOValida('2026-02-30'), false);
    assert.equal(esFechaISOValida('2026-13-01'), false);
    assert.equal(esFechaISOValida('2026-1-5'), false);
    assert.equal(esFechaISOValida('no-es-fecha'), false);
    assert.equal(esFechaISOValida(null), false);
    assert.equal(esFechaISOValida(20261015), false);
  });

  it('esFechaFutura detecta días posteriores al día local actual', () => {
    const ref = new Date(2026, 10, 2, 14, 0, 0); // 2026-11-02
    assert.equal(esFechaFutura('2026-11-01', ref), false);
    assert.equal(esFechaFutura('2026-11-02', ref), false);
    assert.equal(esFechaFutura('2026-11-03', ref), true);
    assert.equal(esFechaFutura('fecha-invalida', ref), false);
  });

  it('esFechaFutura respeta los límites del día local (medianoche) y las noches tras las 19:00', () => {
    const ultimoInstante = new Date(2026, 10, 2, 23, 59, 59, 999);
    assert.equal(esFechaFutura('2026-11-02', ultimoInstante), false);
    assert.equal(esFechaFutura('2026-11-03', ultimoInstante), true);
    const primerInstante = new Date(2026, 10, 3, 0, 0, 0, 0);
    assert.equal(esFechaFutura('2026-11-02', primerInstante), false);
    assert.equal(esFechaFutura('2026-11-03', primerInstante), false);
    assert.equal(esFechaFutura('2026-11-04', primerInstante), true);
    // 21:30 en Colombia = 02:30Z del día siguiente: "mañana" sigue siendo futuro
    const noche = new Date('2026-11-03T02:30:00Z');
    assert.equal(esFechaFutura('2026-11-02', noche), false);
    assert.equal(esFechaFutura('2026-11-03', noche), true);
  });

  it('inicioDiaLocal y finDiaLocal fijan los extremos exactos del día en hora local', () => {
    const ini = inicioDiaLocal('2026-11-02');
    const fin = finDiaLocal('2026-11-02');
    assert.equal(ini.getFullYear(), 2026);
    assert.equal(ini.getMonth(), 10);
    assert.equal(ini.getDate(), 2);
    assert.equal(ini.getHours(), 0);
    assert.equal(ini.getMinutes(), 0);
    assert.equal(ini.getSeconds(), 0);
    assert.equal(fin.getHours(), 23);
    assert.equal(fin.getMinutes(), 59);
    assert.equal(fin.getSeconds(), 59);
    assert.equal(fin.getMilliseconds(), 999);
    assert.equal(inicioDiaLocal('invalida'), null);
    assert.equal(finDiaLocal('invalida'), null);
  });

  it('desplazarDiasISO e inicioMesISO calculan atajos de rango correctamente', () => {
    assert.equal(desplazarDiasISO('2026-11-02', -6), '2026-10-27');
    assert.equal(inicioMesISO('2026-11-15'), '2026-11-01');
  });

  it('formatearFechaAmigable genera etiquetas legibles con día de semana y mes abreviado', () => {
    const ref = new Date(2026, 10, 2);
    // 2026-11-13 es viernes
    assert.equal(formatearFechaAmigable('2026-11-13', { ahora: ref }), 'Vie 13 nov');
    // Otro año incluye el año al final
    assert.equal(formatearFechaAmigable('2025-11-13', { ahora: ref }), 'Jue 13 nov 2025');
  });

  it('contarDiasRango devuelve el conteo inclusivo de días', () => {
    assert.equal(contarDiasRango('2026-11-13', '2026-11-13'), 1);
    assert.equal(contarDiasRango('2026-11-13', '2026-11-15'), 3);
    assert.equal(contarDiasRango('2026-11-15', '2026-11-13'), 0);
    assert.equal(contarDiasRango('', ''), 0);
  });

  it('resumenRangoContextual construye título y subtítulo con días y fotos', () => {
    const ref = new Date(2026, 10, 2);
    const r = resumenRangoContextual('2026-11-13', '2026-11-15', {
      conteoInspecciones: 12,
      ahora: ref,
    });
    assert.equal(r.titulo, 'Vie 13 nov → Dom 15 nov');
    assert.equal(r.subtitulo, '3 días seleccionados · 12 fotos');

    const rHoy = resumenRangoContextual('2026-11-02', '', {
      modo: 'single',
      ahora: ref,
    });
    assert.equal(rHoy.titulo, 'Hoy · Lun 2 nov');
    assert.equal(rHoy.subtitulo, '1 día seleccionado');
  });

  it('construirGrillaMes arma 42 celdas lunes-primero con estados de rango, hoy y futuras', () => {
    // Noviembre 2026: el 1 de noviembre es domingo -> 6 días previos de octubre (26..31)
    const celdas = construirGrillaMes(2026, 10, {
      hoyISO: '2026-11-15',
      maxISO: '2026-11-15',
      modo: 'range',
      desde: '2026-11-10',
      hasta: '2026-11-12',
    });
    assert.equal(celdas.length, 42);
    assert.equal(celdas[0].iso, '2026-10-26');
    assert.equal(celdas[0].esMesActual, false);
    assert.equal(celdas[6].iso, '2026-11-01');
    assert.equal(celdas[6].esMesActual, true);

    const d10 = celdas.find(c => c.iso === '2026-11-10');
    const d11 = celdas.find(c => c.iso === '2026-11-11');
    const d12 = celdas.find(c => c.iso === '2026-11-12');
    const d15 = celdas.find(c => c.iso === '2026-11-15');
    const d16 = celdas.find(c => c.iso === '2026-11-16');

    assert.equal(d10.esInicioRango, true);
    assert.equal(d10.posicionBanda, 'inicio');
    assert.equal(d11.enRango, true);
    assert.equal(d11.posicionBanda, 'medio');
    assert.equal(d12.esFinRango, true);
    assert.equal(d12.posicionBanda, 'fin');
    assert.equal(d15.esHoy, true);
    assert.equal(d15.deshabilitada, false);
    assert.equal(d16.deshabilitada, true);
    assert.equal('esFutura' in d16, false);
  });

  it('resumenRangoContextual distingue el rango abierto "desde X" del día único', () => {
    const ref = new Date(2026, 10, 2);
    const abierto = resumenRangoContextual('2026-11-13', '', { ahora: ref });
    assert.equal(abierto.titulo, 'Desde Vie 13 nov');
    assert.match(abierto.subtitulo, /Elige el día final o aplica/);
    const soloFin = resumenRangoContextual('', '2026-11-13', { ahora: ref });
    assert.equal(soloFin.titulo, 'Hasta Vie 13 nov');
  });

  it('sumarMesesISO ajusta el día al último del mes destino', () => {
    assert.equal(sumarMesesISO('2026-01-31', 1), '2026-02-28');
    assert.equal(sumarMesesISO('2024-01-31', 1), '2024-02-29');
    assert.equal(sumarMesesISO('2026-03-15', -3), '2025-12-15');
    assert.equal(sumarMesesISO('basura', 1), '');
  });

  it('moverFocoGrilla navega con flechas, Inicio/Fin y RePág/AvPág sin pasar de maxISO', () => {
    const max = '2026-11-15';
    // 2026-11-11 es miércoles
    assert.equal(moverFocoGrilla('2026-11-11', 'ArrowLeft', { maxISO: max }), '2026-11-10');
    assert.equal(moverFocoGrilla('2026-11-11', 'ArrowRight', { maxISO: max }), '2026-11-12');
    assert.equal(moverFocoGrilla('2026-11-11', 'ArrowUp', { maxISO: max }), '2026-11-04');
    assert.equal(moverFocoGrilla('2026-11-11', 'ArrowDown', { maxISO: max }), '2026-11-15'); // tope
    assert.equal(moverFocoGrilla('2026-11-11', 'Home', { maxISO: max }), '2026-11-09'); // lunes
    assert.equal(moverFocoGrilla('2026-11-11', 'End', { maxISO: max }), '2026-11-15'); // domingo (= tope)
    assert.equal(moverFocoGrilla('2026-11-11', 'PageUp', { maxISO: max }), '2026-10-11');
    assert.equal(moverFocoGrilla('2026-11-11', 'PageDown', { maxISO: max }), '2026-11-15');
    assert.equal(moverFocoGrilla('2026-11-11', 'ArrowRight'), '2026-11-12'); // sin tope
    assert.equal(moverFocoGrilla('2026-11-11', 'Enter', { maxISO: max }), null);
    assert.equal(moverFocoGrilla('no-fecha', 'ArrowLeft'), null);
    // Cruza de mes y de año
    assert.equal(moverFocoGrilla('2026-01-01', 'ArrowLeft', { maxISO: max }), '2025-12-31');
    assert.equal(moverFocoGrilla('2026-03-31', 'PageUp', { maxISO: max }), '2026-02-28');
  });

  it('aplicarClickRango: primer clic fija inicio, segundo fin (reordenando) y tercero reinicia', () => {
    assert.deepEqual(aplicarClickRango({ desde: '', hasta: '' }, '2026-11-10'), { desde: '2026-11-10', hasta: '' });
    assert.deepEqual(aplicarClickRango({ desde: '2026-11-10', hasta: '' }, '2026-11-12'), { desde: '2026-11-10', hasta: '2026-11-12' });
    assert.deepEqual(aplicarClickRango({ desde: '2026-11-10', hasta: '' }, '2026-11-08'), { desde: '2026-11-08', hasta: '2026-11-10' });
    assert.deepEqual(aplicarClickRango({ desde: '2026-11-10', hasta: '' }, '2026-11-10'), { desde: '2026-11-10', hasta: '2026-11-10' });
    assert.deepEqual(aplicarClickRango({ desde: '2026-11-08', hasta: '2026-11-10' }, '2026-11-12'), { desde: '2026-11-12', hasta: '' });
  });

  it('rangoAConfirmar conserva los rangos abiertos y confirma el día único en ambos extremos', () => {
    assert.deepEqual(rangoAConfirmar({ modo: 'range', desde: '2026-11-10', hasta: '' }), { desde: '2026-11-10', hasta: '' });
    assert.deepEqual(rangoAConfirmar({ modo: 'range', desde: '', hasta: '2026-11-12' }), { desde: '', hasta: '2026-11-12' });
    assert.deepEqual(rangoAConfirmar({ modo: 'range', desde: '2026-11-10', hasta: '2026-11-12' }), { desde: '2026-11-10', hasta: '2026-11-12' });
    assert.deepEqual(rangoAConfirmar({ modo: 'range', desde: 'x', hasta: '' }), { desde: '', hasta: '' });
    assert.deepEqual(rangoAConfirmar({ modo: 'single', unica: '2026-11-10' }), { desde: '2026-11-10', hasta: '2026-11-10' });
    assert.deepEqual(rangoAConfirmar({ modo: 'single', unica: '' }), { desde: '', hasta: '' });
  });

  it('etiquetaFiltroFechas nombra rangos abiertos, día único y rango cerrado', () => {
    const ref = new Date(2026, 10, 2);
    assert.equal(etiquetaFiltroFechas('', '', { ahora: ref }), 'Filtrar por fecha');
    assert.equal(etiquetaFiltroFechas('2026-11-13', '', { ahora: ref }), 'Desde Vie 13 nov');
    assert.equal(etiquetaFiltroFechas('', '2026-11-13', { ahora: ref }), 'Hasta Vie 13 nov');
    assert.equal(etiquetaFiltroFechas('2026-11-02', '2026-11-02', { ahora: ref }), 'Hoy · Lun 2 nov');
    assert.equal(etiquetaFiltroFechas('2026-11-13', '2026-11-15', { ahora: ref }), 'Vie 13 nov → Dom 15 nov');
  });
});
