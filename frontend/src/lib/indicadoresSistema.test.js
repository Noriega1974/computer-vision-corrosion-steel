import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  leyendaNiveles, segmentosBarra, resumenNiveles, textoSinMediciones, textoPromedio,
  textoCobertura, textoAtrasado, textoMediciones30d, textoSubio, fechaCorta, sinPuntos,
} from './indicadoresSistema.js';

const AHORA = { ahora: new Date(2026, 10, 4) };

test('la leyenda va de severo a sin corrosión, con singular y plural, y omite los niveles vacíos', () => {
  assert.equal(resumenNiveles([2, 3, 1, 2]), '2 severos · 1 moderado · 3 leves · 2 sin corrosión');
  assert.equal(resumenNiveles([0, 1, 0, 1]), '1 severo · 1 leve');
  assert.deepEqual(leyendaNiveles([0, 0, 0, 0]), []);
  assert.deepEqual(leyendaNiveles(undefined), []);
});

test('los segmentos de la barra suman 100 y respetan la proporción', () => {
  const s = segmentosBarra([2, 3, 1, 2]);
  assert.deepEqual(s.map((x) => x.nivel), [3, 2, 1, 0]);
  assert.equal(Math.round(s.reduce((t, x) => t + x.ancho, 0)), 100);
  assert.equal(s.find((x) => x.nivel === 1).ancho, 37.5);
  assert.deepEqual(segmentosBarra([0, 0, 0, 0]), []);
});

test('puntos sin mediciones: vacío si no hay ninguno y singular/plural', () => {
  assert.equal(textoSinMediciones(0), '');
  assert.equal(textoSinMediciones(1), '1 sin medición');
  assert.equal(textoSinMediciones(3), '3 sin mediciones');
});

test('el promedio usa coma decimal y un espacio antes del %', () => {
  assert.equal(textoPromedio(36.56), '36,6 % promedio');
  assert.equal(textoPromedio(0), '0,0 % promedio');
  assert.equal(textoPromedio(null), '');
  assert.equal(textoPromedio('x'), '');
});

test('cobertura y mediciones en 30 días', () => {
  assert.equal(textoCobertura({ con_medicion_30d: 5, total_puntos: 8 }), '5 de 8 puntos');
  assert.equal(textoCobertura({ con_medicion_30d: 1, total_puntos: 1 }), '1 de 1 punto');
  assert.equal(textoMediciones30d(1), '1 medición en 30 días');
  assert.equal(textoMediciones30d(12), '12 mediciones en 30 días');
});

test('el punto más atrasado distingue días, hoy y nunca medido', () => {
  assert.equal(textoAtrasado({ nombre: 'Bloque A', dias: 45 }), 'Más atrasado: Bloque A, hace 45 días');
  assert.equal(textoAtrasado({ nombre: 'Bloque A', dias: 1 }), 'Más atrasado: Bloque A, hace 1 día');
  assert.equal(textoAtrasado({ nombre: 'Bloque A', dias: 0 }), 'Más atrasado: Bloque A, medido hoy');
  assert.equal(textoAtrasado({ nombre: 'Bloque B', dias: null, fecha: null }), 'Más atrasado: Bloque B, sin mediciones');
  assert.equal(textoAtrasado(null), '');
});

test('un punto que subió se describe con los niveles y la fecha', () => {
  assert.equal(textoSubio({ nombre: 'Bloque A', de: 1, a: 3, fecha: '2026-11-03' }, AHORA), 'Bloque A: Leve → Severa (3 nov)');
  assert.equal(fechaCorta('2026-11-03', AHORA), '3 nov');
  assert.equal(fechaCorta(null), '');
});

test('sin puntos en el alcance no hay resumen', () => {
  assert.equal(sinPuntos(null), true);
  assert.equal(sinPuntos({ total_puntos: 0 }), true);
  assert.equal(sinPuntos({ total_puntos: 2 }), false);
});
