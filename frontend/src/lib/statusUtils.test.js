import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COLORES_NIVEL, nivelColor, nivelColorTexto, getStatusColor, nivelToStatus } from './statusUtils.js';
import { colorNivelBarra, COLORES_BARRA_ANUAL } from './lineaTiempo.js';

describe('statusUtils — paleta única de niveles', () => {
  it('chips, mapa y barra anual comparten los mismos cuatro colores', () => {
    assert.equal(COLORES_NIVEL.length, 4);
    assert.equal(new Set(COLORES_NIVEL).size, 4);
    COLORES_NIVEL.forEach((c, n) => {
      assert.equal(nivelColor(n), c);
      assert.equal(getStatusColor(nivelToStatus(n)), c);
      assert.equal(colorNivelBarra(n), c);
    });
    assert.deepEqual(COLORES_BARRA_ANUAL, COLORES_NIVEL);
  });

  it('el leve es ámbar y se distingue del moderado', () => {
    assert.equal(nivelColor(1), '#f59e0b');
    assert.notEqual(nivelColor(1), nivelColor(2));
  });

  it('el texto de cada nivel sale de variables CSS con contraste propio', () => {
    assert.equal(nivelColorTexto(1), 'var(--nivel-1-texto)');
    assert.equal(nivelColorTexto(3), 'var(--nivel-3-texto)');
    assert.equal(nivelColorTexto(9), 'var(--text-muted)');
    assert.equal(nivelColorTexto(undefined), 'var(--text-muted)');
  });

  it('un estado desconocido usa el gris neutro', () => {
    assert.equal(getStatusColor('???'), '#64748b');
  });
});
