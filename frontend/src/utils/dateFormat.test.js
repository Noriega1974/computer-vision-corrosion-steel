import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { horaCorta, formatFecha } from './dateFormat.js';

// formatFecha reads the saved date format from localStorage.
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };

describe('dateFormat.js — horaCorta', () => {
  it('devuelve HH:mm de un timestamp con hora', () => {
    assert.equal(horaCorta('2026-10-30T14:05:00'), '14:05');
    assert.equal(horaCorta(new Date(2026, 9, 30, 9, 7)), '09:07');
  });

  it('un timestamp solo con fecha da una hora HH:mm válida, no texto cortado', () => {
    assert.match(horaCorta('2026-10-30'), /^\d{2}:\d{2}$/);
  });

  it('sin fecha o inválido da vacío (nunca "fecha" de "Sin fecha")', () => {
    assert.equal(formatFecha(null, { conHora: true }), 'Sin fecha');
    assert.equal(horaCorta(null), '');
    assert.equal(horaCorta(undefined), '');
    assert.equal(horaCorta('no es fecha'), '');
  });
});
