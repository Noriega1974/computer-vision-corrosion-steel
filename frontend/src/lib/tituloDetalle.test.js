import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tituloMedicion } from './tituloDetalle.js';

// formatFecha reads the saved date format from localStorage.
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };

describe('tituloMedicion', () => {
  it('usa el nombre de la foto cuando existe', () => {
    assert.equal(tituloMedicion({ nombre: ' Foto 07 ', timestamp: '2026-10-30T12:00:00Z' }), 'Foto 07');
  });
  it('cae a "Medición del <fecha>" sin nombre', () => {
    assert.match(tituloMedicion({ timestamp: '2026-10-30T12:00:00' }), /^Medición del \d/);
  });
  it('sin datos devuelve "Medición"', () => {
    assert.equal(tituloMedicion(null), 'Medición');
  });
});
