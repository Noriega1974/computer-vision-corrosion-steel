import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIN_ASIGNAR,
  iniciales,
  resumenConteoMediciones,
  formatearConteoMediciones,
  carpetasDeEmpresas,
  carpetasDePuntos,
  bloquesDeEmpresa,
  agruparPorLote,
  medicionesDeLote,
  contarOcultasPorFiltro,
  etiquetaConteoBloque,
  normalizarNombreLote,
} from './galeriaCarpetas.js';

describe('galeriaCarpetas', () => {
  it('calcula iniciales a partir de una o dos palabras', () => {
    assert.equal(iniciales('Universidad del Norte'), 'UD');
    assert.equal(iniciales('Bloque K'), 'BK');
    assert.equal(iniciales('Torre'), 'T');
    assert.equal(iniciales(''), '?');
  });

  it('agrupa mediciones por empresa ordenadas por la más reciente', () => {
    const mediciones = [
      { id_medicion: 'm1', empresa_id: 'EMP-1', bloque_id: 'B1', timestamp: '2026-10-01T10:00:00Z' },
      { id_medicion: 'm2', empresa_id: 'EMP-2', bloque_id: 'B2', timestamp: '2026-10-05T10:00:00Z' },
      { id_medicion: 'm3', empresa_id: 'EMP-1', bloque_id: 'B3', timestamp: '2026-10-02T10:00:00Z' },
    ];
    const carpetas = carpetasDeEmpresas(mediciones);
    assert.equal(carpetas.length, 2);
    assert.equal(carpetas[0].id, 'EMP-2');
    assert.equal(carpetas[0].puntos, 1);
    assert.equal(carpetas[0].fotos, 1);
    assert.equal(carpetas[1].id, 'EMP-1');
    assert.equal(carpetas[1].puntos, 2);
    assert.equal(carpetas[1].fotos, 2);
  });

  it('carpetasDePuntos funciona sin pasar bloques (retrocompatible)', () => {
    const mediciones = [
      { id_medicion: 'm1', bloque_id: 'B1', bloque_nombre: 'Puente Sur', timestamp: '2026-10-01T10:00:00Z', url_thumbnail: 'https://img/1.jpg' },
      { id_medicion: 'm2', bloque_id: 'B1', bloque_nombre: 'Puente Sur', timestamp: '2026-10-03T10:00:00Z', url_thumbnail: 'https://img/2.jpg' },
    ];
    const puntos = carpetasDePuntos(mediciones);
    assert.equal(puntos.length, 1);
    assert.equal(puntos[0].id, 'B1');
    assert.equal(puntos[0].fotos, 2);
    assert.equal(puntos[0].total, 2);
    assert.equal(puntos[0].preview, 'https://img/2.jpg');
    assert.equal(puntos[0].ultimaFecha, '2026-10-03T10:00:00Z');
  });

  it('carpetasDePuntos incluye bloques activos sin mediciones con total: 0 y excluye inactivos', () => {
    const mediciones = [
      { id_medicion: 'm1', bloque_id: 'B1', bloque_nombre: 'Torre A', timestamp: '2026-10-03T10:00:00Z' },
    ];
    const bloques = [
      { id_bloque: 'B1', nombre: 'Torre A', ciudad: 'Barranquilla', activo: true },
      { id_bloque: 'B2', nombre: 'Torre B Nueva', ciudad: 'Cartagena', activo: true },
      { id_bloque: 'B3', nombre: 'Torre Sin Ciudad', activo: true },
      { id_bloque: 'B4', nombre: 'Torre Inactiva', activo: false },
    ];
    const puntos = carpetasDePuntos(mediciones, bloques);
    assert.deepEqual(puntos.map(p => p.id), ['B1', 'B2', 'B3']);

    const vacioConCiudad = puntos.find(p => p.id === 'B2');
    assert.equal(vacioConCiudad.id, 'B2');
    assert.equal(vacioConCiudad.nombre, 'Torre B Nueva');
    assert.equal(vacioConCiudad.subtitulo, 'Cartagena');
    assert.equal(vacioConCiudad.total, 0);
    assert.equal(vacioConCiudad.fotos, 0);
    assert.equal(vacioConCiudad.preview, null);
    assert.equal(vacioConCiudad.ultimaFecha, null);

    const vacioSinCiudad = puntos.find(p => p.id === 'B3');
    assert.equal(vacioSinCiudad.subtitulo, 'Sin fotos todavía');
  });

  it('agruparPorLote separa lotes ordenados por fecha descendente y fotos sueltas', () => {
    const mediciones = [
      { id_medicion: 'm1', lote_id: 'LOT-1', lote_nombre: 'Tanda mañana', timestamp: '2026-10-01T08:00:00Z', url_thumbnail: 'u1' },
      { id_medicion: 'm2', lote_id: 'LOT-1', lote_nombre: 'Tanda mañana', timestamp: '2026-10-01T09:00:00Z', url_thumbnail: 'u2' },
      { id_medicion: 'm3', timestamp: '2026-10-02T10:00:00Z' },
      { id_medicion: 'm4', lote_id: 'LOT-2', timestamp: '2026-10-03T12:00:00Z', url_imagen: 'u4' },
      { id_medicion: 'm5', lote_id: '   ', timestamp: '2026-10-04T12:00:00Z' },
    ];
    const { lotes, sueltas } = agruparPorLote(mediciones);
    assert.equal(lotes.length, 2);
    assert.equal(lotes[0].id, 'LOT-2');
    assert.equal(lotes[0].nombre, 'Lote sin nombre');
    assert.equal(lotes[0].total, 1);
    assert.equal(lotes[0].preview, 'u4');
    assert.equal(lotes[0].ultimaFecha, '2026-10-03T12:00:00Z');

    assert.equal(lotes[1].id, 'LOT-1');
    assert.equal(lotes[1].nombre, 'Tanda mañana');
    assert.equal(lotes[1].total, 2);
    assert.equal(lotes[1].preview, 'u2');
    assert.equal(lotes[1].ultimaFecha, '2026-10-01T09:00:00Z');

    assert.deepEqual(sueltas.map(m => m.id_medicion), ['m3', 'm5']);
  });

  it('agruparPorLote toma el primer nombre de lote no vacío y cuenta fotos de varios días', () => {
    const { lotes } = agruparPorLote([
      { id_medicion: 'a', lote_id: 'LOT-9', timestamp: '2026-10-01T12:00:00Z' },
      { id_medicion: 'b', lote_id: 'LOT-9', lote_nombre: ' Revisión  ', timestamp: '2026-10-01T12:00:01Z' },
    ]);
    assert.equal(lotes[0].nombre, 'Revisión');
    assert.equal(lotes[0].total, 2);
  });

  it('medicionesDeLote devuelve el lote entero de la lista sin filtrar', () => {
    const todas = [
      { id_medicion: 'a', lote_id: 'LOT-1', nivel_corrosion: 1, timestamp: '2026-10-01T12:00:00Z' },
      { id_medicion: 'b', lote_id: 'LOT-1', nivel_corrosion: 3, timestamp: '2026-10-01T12:00:01Z' },
      { id_medicion: 'c', lote_id: 'LOT-2', timestamp: '2026-10-01T12:00:02Z' },
      { id_medicion: 'd', timestamp: '2026-10-01T12:00:03Z' },
    ];
    // A level filter would leave only 'b' visible, but the lote still has both photos.
    assert.deepEqual(medicionesDeLote(todas, 'LOT-1').map(m => m.id_medicion).sort(), ['a', 'b']);
    assert.deepEqual(medicionesDeLote(todas, 'NO-EXISTE'), []);
    assert.deepEqual(medicionesDeLote(todas, null), []);
  });

  it('bloquesDeEmpresa filtra por empresa y trata "sin zona" como bloques sin empresa', () => {
    const bloques = [
      { id_bloque: 'B1', empresa_id: 'EMP-1' },
      { id_bloque: 'B2', empresa_id: 'EMP-2' },
      { id_bloque: 'B3' },
    ];
    assert.deepEqual(bloquesDeEmpresa(bloques, 'EMP-1').map(b => b.id_bloque), ['B1']);
    assert.deepEqual(bloquesDeEmpresa(bloques, SIN_ASIGNAR).map(b => b.id_bloque), ['B3']);
    assert.equal(bloquesDeEmpresa(bloques, undefined).length, 3);
  });

  it('un punto sin fotos de otra empresa no aparece como carpeta vacía', () => {
    const bloques = [{ id_bloque: 'B1', empresa_id: 'EMP-1', activo: true }, { id_bloque: 'B2', empresa_id: 'EMP-2', activo: true }];
    const puntos = carpetasDePuntos([], bloquesDeEmpresa(bloques, 'EMP-1'));
    assert.deepEqual(puntos.map(p => p.id), ['B1']);
  });

  it('resumenConteoMediciones y formatearConteoMediciones producen "x mediciones · x lotes"', () => {
    assert.equal(formatearConteoMediciones([]), '0 mediciones · 0 lotes');
    assert.equal(
      formatearConteoMediciones([{ id_medicion: 'm1' }]),
      '1 medición · 0 lotes',
    );
    const mixtas = [
      { id_medicion: '1', lote_id: 'L1' },
      { id_medicion: '2', lote_id: 'L1' },
      { id_medicion: '3', lote_id: 'L1' },
      { id_medicion: '4', lote_id: 'L2' },
      { id_medicion: '5' },
    ];
    assert.deepEqual(resumenConteoMediciones(mixtas), {
      totalImagenes: 5,
      imagenesIndividuales: 1,
      totalLotes: 2,
      imagenesEnLotes: 4,
    });
    assert.equal(formatearConteoMediciones(mixtas), '5 mediciones · 2 lotes');
    assert.equal(
      formatearConteoMediciones([{ id_medicion: '1', lote_id: 'L1' }]),
      '1 medición · 1 lote',
    );
  });

  it('agruparPorLote calcula peorNivel, peorPct, promedioPct y estado de cada lote', () => {
    const { lotes } = agruparPorLote([
      { id_medicion: '1', lote_id: 'L1', lote_nombre: 202611, nivel_corrosion: 1, area_corroida_pct: 5, timestamp: '2026-10-28T10:00:00Z' },
      { id_medicion: '2', lote_id: 'L1', nivel_corrosion: 3, area_corroida_pct: 25, timestamp: '2026-10-28T10:05:00Z' },
      { id_medicion: '3', lote_id: 'L2', lote_nombre: 'En curso', nivel_corrosion: 0, area_corroida_pct: null, timestamp: '2026-10-29T10:00:00Z' },
    ]);
    const l1 = lotes.find((l) => l.id === 'L1');
    assert.equal(l1.nombre, '202611');
    assert.equal(l1.peorNivel, 3);
    assert.equal(l1.peorPct, 25);
    assert.equal(l1.promedioPct, 15);
    assert.equal(l1.estado, 'analizado');

    const l2 = lotes.find((l) => l.id === 'L2');
    assert.equal(l2.estado, 'en_proceso');
  });

  it('el promedio del lote ignora las fotos que aún no tienen % (en proceso)', () => {
    const { lotes } = agruparPorLote([
      { id_medicion: '1', lote_id: 'L', area_corroida_pct: 10, timestamp: '2026-10-28T10:00:00Z' },
      { id_medicion: '2', lote_id: 'L', area_corroida_pct: null, timestamp: '2026-10-28T10:01:00Z' },
      { id_medicion: '3', lote_id: 'L', timestamp: '2026-10-28T10:02:00Z' },
    ]);
    assert.equal(lotes[0].promedioPct, 10);
    assert.equal(lotes[0].estado, 'en_proceso');
    const vacio = agruparPorLote([{ id_medicion: '9', lote_id: 'V', area_corroida_pct: null, timestamp: '2026-10-28T10:00:00Z' }]);
    assert.equal(vacio.lotes[0].promedioPct, 0);
  });

  it('contarOcultasPorFiltro compara conjuntos del mismo tipo (solo fotos con punto)', () => {
    const idPunto = (m) => m.id_punto;
    const a = { id_medicion: 'a', id_punto: 'P' };
    const b = { id_medicion: 'b', id_punto: 'P' };
    const sinPunto = { id_medicion: 'c' };
    const marcadas = new Set(['a', 'b', 'c']);
    // b queda oculta por el filtro; la que no tiene punto nunca fue elegible y no cuenta.
    assert.equal(contarOcultasPorFiltro([a, b], [a, sinPunto], marcadas, idPunto), 1);
    assert.equal(contarOcultasPorFiltro([a, b], [a, b, sinPunto], marcadas, idPunto), 0);
    assert.equal(contarOcultasPorFiltro([], [], marcadas, idPunto), 0);
  });

  it('etiquetaConteoBloque usa el total del servidor y solo cuenta lotes si la ventana está completa', () => {
    const meds = [{ lote_id: 'L1' }, { lote_id: 'L1' }, {}];
    assert.equal(etiquetaConteoBloque(3, meds, true), '3 mediciones · 1 lote');
    // ventana recortada: el total del servidor manda y no se inventan lotes
    assert.equal(etiquetaConteoBloque(2500, meds, false), '2500 mediciones');
    assert.equal(etiquetaConteoBloque(1, [], false), '1 medición');
    assert.equal(etiquetaConteoBloque(0, [], true), '0 mediciones · 0 lotes');
    assert.equal(etiquetaConteoBloque(undefined, meds, false), '3 mediciones');
  });
});

describe('normalizarNombreLote', () => {
  it('colapsa espacios y quita caracteres de control', () => {
    assert.equal(normalizarNombreLote('  Lote \t  norte\u0001 sur '), 'Lote norte sur');
  });
  it('trunca a 80 caracteres', () => {
    assert.equal(normalizarNombreLote('a'.repeat(200)), 'a'.repeat(80));
  });
  it('devuelve vacío para vacío, solo espacios o valores no texto', () => {
    assert.equal(normalizarNombreLote('   '), '');
    assert.equal(normalizarNombreLote(null), '');
    assert.equal(normalizarNombreLote(undefined), '');
  });
});
