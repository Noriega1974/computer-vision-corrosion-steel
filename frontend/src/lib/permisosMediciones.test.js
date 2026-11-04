import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esMedicionPropia, puedeGestionarMedicion, puedeGestionarLote } from './permisosMediciones.js';

const mia = { id_medicion: 'M1', tomado_por_id: 'tec-1', usuario_id: 'tec-1' };
const soloUsuario = { id_medicion: 'M2', usuario_id: 'tec-1' };
const ajena = { id_medicion: 'M3', tomado_por_id: 'otro', usuario_id: 'otro' };
const sinAutor = { id_medicion: 'M4' };

test('una medición es propia si el sub coincide con tomado_por_id o usuario_id', () => {
  assert.equal(esMedicionPropia(mia, 'tec-1'), true);
  assert.equal(esMedicionPropia(soloUsuario, 'tec-1'), true);
  assert.equal(esMedicionPropia(ajena, 'tec-1'), false);
  assert.equal(esMedicionPropia(sinAutor, 'tec-1'), false);
  assert.equal(esMedicionPropia(sinAutor, undefined), false);
});

test('el técnico solo gestiona las suyas', () => {
  assert.equal(puedeGestionarMedicion(['tecnico'], 'tec-1', mia), true);
  assert.equal(puedeGestionarMedicion(['tecnico'], 'tec-1', ajena), false);
  assert.equal(puedeGestionarMedicion(['tecnico'], 'tec-1', sinAutor), false);
});

test('admin y super_admin gestionan cualquiera, el cliente ninguna', () => {
  assert.equal(puedeGestionarMedicion(['admin'], 'a', ajena), true);
  assert.equal(puedeGestionarMedicion(['super_admin'], 'a', sinAutor), true);
  assert.equal(puedeGestionarMedicion(['cliente'], 'c', mia), false);
  assert.equal(puedeGestionarMedicion(undefined, 'c', mia), false);
});

test('un lote lo gestiona el técnico solo si todas sus fotos son suyas', () => {
  assert.equal(puedeGestionarLote(['tecnico'], 'tec-1', [mia, soloUsuario]), true);
  assert.equal(puedeGestionarLote(['tecnico'], 'tec-1', [mia, ajena]), false);
  assert.equal(puedeGestionarLote(['tecnico'], 'tec-1', []), false);
  assert.equal(puedeGestionarLote(['admin'], 'a', [mia, ajena]), true);
});
