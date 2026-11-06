import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearLimitador, dimensionesPreview } from './previewImagen.js';

test('dimensionesPreview scales the long side down and keeps the ratio', () => {
  assert.deepEqual(dimensionesPreview(4000, 3000, 240), { ancho: 240, alto: 180 });
  assert.deepEqual(dimensionesPreview(3000, 4000, 240), { ancho: 180, alto: 240 });
});

test('dimensionesPreview never upscales and tolerates bad input', () => {
  assert.deepEqual(dimensionesPreview(100, 50, 240), { ancho: 100, alto: 50 });
  assert.deepEqual(dimensionesPreview(0, 0, 240), { ancho: 240, alto: 240 });
});

test('crearLimitador caps concurrency, keeps order and survives rejections', async () => {
  const limitar = crearLimitador(2);
  let activos = 0;
  let maximo = 0;
  const orden = [];
  const tarea = (n, falla = false) => async () => {
    activos += 1; maximo = Math.max(maximo, activos);
    await new Promise((r) => setTimeout(r, 5));
    activos -= 1; orden.push(n);
    if (falla) throw new Error('x');
    return n;
  };
  const res = await Promise.allSettled([1, 2, 3, 4, 5].map((n) => limitar(tarea(n, n === 2))));
  assert.equal(maximo, 2);
  assert.equal(res[1].status, 'rejected');
  assert.deepEqual(res.filter((r) => r.status === 'fulfilled').map((r) => r.value), [1, 3, 4, 5]);
  assert.equal(orden.length, 5);
});
