import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeGestionar } from './permisosUsuarios.js';

const admin = { rol: 'admin', empresa_id: 'EMP-1' };

test('super_admin gestiona a todos', () => {
  for (const rol of ['super_admin', 'admin', 'tecnico', 'cliente']) {
    assert.equal(puedeGestionar({ rol: 'super_admin' }, { rol, empresa_id: 'EMP-9' }), true);
  }
});

test('admin gestiona técnicos y clientes de su afiliación', () => {
  assert.equal(puedeGestionar(admin, { rol: 'tecnico', empresa_id: 'EMP-1' }), true);
  assert.equal(puedeGestionar(admin, { rol: 'cliente', empresa_id: 'EMP-1' }), true);
});

test('admin no gestiona admins, super_admins ni usuarios de otra afiliación', () => {
  assert.equal(puedeGestionar(admin, { rol: 'admin', empresa_id: 'EMP-1' }), false);
  assert.equal(puedeGestionar(admin, { rol: 'super_admin', empresa_id: 'EMP-1' }), false);
  assert.equal(puedeGestionar(admin, { rol: 'tecnico', empresa_id: 'EMP-2' }), false);
  assert.equal(puedeGestionar(admin, { rol: 'tecnico' }), false);
});

test('un admin sin afiliación no gestiona a nadie, ni a usuarios sin afiliación', () => {
  assert.equal(puedeGestionar({ rol: 'admin' }, { rol: 'cliente' }), false);
  assert.equal(puedeGestionar({ rol: 'admin', empresa_id: '' }, { rol: 'cliente', empresa_id: '' }), false);
});

test('técnico y cliente no gestionan a nadie', () => {
  assert.equal(puedeGestionar({ rol: 'tecnico', empresa_id: 'EMP-1' }, { rol: 'cliente', empresa_id: 'EMP-1' }), false);
  assert.equal(puedeGestionar({ rol: 'cliente', empresa_id: 'EMP-1' }, { rol: 'cliente', empresa_id: 'EMP-1' }), false);
});

test('sin actor u objetivo no hay permiso', () => {
  assert.equal(puedeGestionar(null, { rol: 'cliente' }), false);
  assert.equal(puedeGestionar(admin, undefined), false);
});
