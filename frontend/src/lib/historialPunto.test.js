import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatearFechaDiaPunto } from './historialPunto.js';

// formatFecha reads the saved date format from localStorage.
const guardado = new Map();
globalThis.localStorage ??= {
  getItem: (k) => guardado.get(k) ?? null,
  setItem: (k, v) => guardado.set(k, v),
  removeItem: (k) => guardado.delete(k),
};

const CLAVE_FORMATO = 'corria-date-format';
const formatoOriginal = localStorage.getItem(CLAVE_FORMATO);

describe('historialPunto.js — etiqueta del día de un punto', () => {
  afterEach(() => {
    if (formatoOriginal === null) localStorage.removeItem(CLAVE_FORMATO);
    else localStorage.setItem(CLAVE_FORMATO, formatoOriginal);
  });

  it('convierte YYYY-MM-DD al formato de fecha por defecto', () => {
    assert.equal(formatearFechaDiaPunto('2026-10-28'), '28/10/2026');
  });

  it('respeta el formato elegido por el usuario', () => {
    localStorage.setItem('corria-date-format', 'AAAA-MM-DD');
    assert.equal(formatearFechaDiaPunto('2026-10-28'), '2026-10-28');
    localStorage.setItem('corria-date-format', 'MM/DD/AAAA');
    assert.equal(formatearFechaDiaPunto('2026-10-28'), '10/28/2026');
  });

  it('entradas inválidas o sin fecha dan "Sin fecha"', () => {
    assert.equal(formatearFechaDiaPunto('sin-fecha'), 'Sin fecha');
    assert.equal(formatearFechaDiaPunto(''), 'Sin fecha');
    assert.equal(formatearFechaDiaPunto('28/10/2026'), 'Sin fecha');
  });

  it('mes o día fuera de rango, o fecha inexistente, dan "Sin fecha"', () => {
    for (const f of ['2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32', '2026-02-31', '2025-02-29']) {
      assert.equal(formatearFechaDiaPunto(f), 'Sin fecha', f);
    }
    assert.equal(formatearFechaDiaPunto('2028-02-29'), '29/02/2028');
  });
});
