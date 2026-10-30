import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ZOOM_MAX, VISTA_INICIAL, limitarVista, zoomEnPunto, desplazar, factorRueda } from './zoomPan.js';

const W = 800, H = 600;

test('zoom 1 no admite desplazamiento', () => {
  assert.deepEqual(limitarVista({ z: 1, x: -50, y: 30 }, W, H), VISTA_INICIAL);
});

test('el zoom se limita a 1x..8x', () => {
  assert.equal(limitarVista({ z: 20, x: 0, y: 0 }, W, H).z, ZOOM_MAX);
  assert.equal(limitarVista({ z: 0.2, x: 0, y: 0 }, W, H).z, 1);
});

test('el desplazamiento no deja salir la foto del marco', () => {
  const v = limitarVista({ z: 2, x: 100, y: -9999 }, W, H);
  assert.deepEqual(v, { z: 2, x: 0, y: -600 });
  assert.deepEqual(limitarVista({ z: 2, x: -9999, y: 0 }, W, H), { z: 2, x: -800, y: 0 });
});

test('zoom en un punto mantiene fijo el pixel bajo el cursor', () => {
  const cx = 600, cy = 200;
  const v = zoomEnPunto({ z: 2, x: -300, y: -100 }, 1.5, cx, cy, W, H);
  assert.equal(v.z, 3);
  // coordenada de la foto bajo el cursor antes y despues
  assert.ok(Math.abs((cx - -300) / 2 - (cx - v.x) / v.z) < 1e-9);
  assert.ok(Math.abs((cy - -100) / 2 - (cy - v.y) / v.z) < 1e-9);
});

test('alejar hasta 1x vuelve a la vista inicial', () => {
  let v = zoomEnPunto(VISTA_INICIAL, 4, 700, 500, W, H);
  assert.equal(v.z, 4);
  v = zoomEnPunto(v, 0.1, 700, 500, W, H);
  assert.deepEqual(v, VISTA_INICIAL);
});

test('acercar en la esquina no se sale del marco', () => {
  const v = zoomEnPunto(VISTA_INICIAL, 8, W, H, W, H);
  assert.deepEqual(v, { z: 8, x: W - W * 8, y: H - H * 8 });
});

test('desplazar arrastra y se limita', () => {
  const v = desplazar({ z: 2, x: -10, y: -10 }, -5000, 5000, W, H);
  assert.deepEqual(v, { z: 2, x: -800, y: 0 });
});

test('rueda hacia arriba acerca, hacia abajo aleja', () => {
  assert.ok(factorRueda(-100) > 1);
  assert.ok(factorRueda(100) < 1);
  assert.ok(Math.abs(factorRueda(-100) * factorRueda(100) - 1) < 1e-9);
});
