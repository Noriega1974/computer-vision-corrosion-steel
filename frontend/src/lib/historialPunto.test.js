import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatearFechaDiaPunto } from './historialPunto.js';

// formatFecha reads the saved date format from localStorage.
const guardado = new Map();
globalThis.localStorage ??= {
  getItem: (k) => guardado.get(k) ?? null,
  setItem: (k, v) => guardado.set(k, v),
};

describe('historialPunto.js — etiqueta del día de un punto', () => {
  it('convierte YYYY-MM-DD al formato de fecha por defecto', () => {
    assert.equal(formatearFechaDiaPunto('2026-10-28'), '28/10/2026');
  });

  it('respeta el formato elegido por el usuario', () => {
    localStorage.setItem('corria-date-format', 'AAAA-MM-DD');
    assert.equal(formatearFechaDiaPunto('2026-10-28'), '2026-10-28');
    localStorage.setItem('corria-date-format', 'MM/DD/AAAA');
    assert.equal(formatearFechaDiaPunto('2026-10-28'), '10/28/2026');
    localStorage.setItem('corria-date-format', 'DD/MM/AAAA');
  });

  it('entradas inválidas o sin fecha dan "Sin fecha"', () => {
    assert.equal(formatearFechaDiaPunto('sin-fecha'), 'Sin fecha');
    assert.equal(formatearFechaDiaPunto(''), 'Sin fecha');
    assert.equal(formatearFechaDiaPunto('28/10/2026'), 'Sin fecha');
  });
});
