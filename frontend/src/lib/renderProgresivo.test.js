import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASO_RENDER, siguienteLimite, recortarVisibles } from './renderProgresivo.js';

test('siguienteLimite grows by one step and caps at the total', () => {
  assert.equal(siguienteLimite(60, 500), 120);
  assert.equal(siguienteLimite(480, 500), 500);
  assert.equal(siguienteLimite(60, 10), 10);
  assert.equal(siguienteLimite(0, 0), 0);
  assert.equal(PASO_RENDER, 60);
});

test('recortarVisibles keeps order, never copies a short list', () => {
  const corta = [1, 2, 3];
  assert.equal(recortarVisibles(corta, 60), corta);
  assert.deepEqual(recortarVisibles([1, 2, 3, 4], 2), [1, 2]);
});
