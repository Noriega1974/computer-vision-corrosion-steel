import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EJEMPLO_PCT_PLACA,
  EJEMPLO_PCT_FOTO,
  EJEMPLO_PCT_PLACA_EN_CUADRO,
  EJEMPLO_PCT_FONDO,
} from './ejemploGuia.js';
import { formatoPct } from './textUtils.js';

describe('ejemploGuia.js — cifras del ejemplo de la guía', () => {
  it('el % sobre la foto es menor que sobre la placa (el fondo diluye)', () => {
    assert.ok(EJEMPLO_PCT_FOTO < EJEMPLO_PCT_PLACA);
  });

  it('la parte del cuadro que ocupa la placa se deriva de las dos cifras y suma 100 con el fondo', () => {
    assert.equal(EJEMPLO_PCT_PLACA_EN_CUADRO, 27.6);
    assert.equal(EJEMPLO_PCT_FONDO, 72.4);
    assert.equal(Math.round((EJEMPLO_PCT_PLACA_EN_CUADRO + EJEMPLO_PCT_FONDO) * 10) / 10, 100);
  });

  it('la guía se escribe con el formato de la app (coma decimal, sin espacio)', () => {
    assert.equal(formatoPct(EJEMPLO_PCT_PLACA), '36,6%');
    assert.equal(formatoPct(EJEMPLO_PCT_FOTO), '10,1%');
  });
});
