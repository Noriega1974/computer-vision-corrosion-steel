import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIN_ASIGNAR,
  iniciales,
  carpetasDeEmpresas,
  carpetasDePuntos,
  bloquesDeEmpresa,
  agruparPorLote,
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
});
