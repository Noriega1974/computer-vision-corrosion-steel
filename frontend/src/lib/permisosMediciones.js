// Quién puede mover, eliminar o renombrar una medición. Refleja la regla del backend
// (api_mediciones): super_admin y admin gestionan cualquiera de su alcance; el
// técnico solo las que él mismo tomó (inference guarda su `sub` de Cognito en
// `tomado_por_id` y `usuario_id`); el cliente ninguna.

const tiene = (grupos, rol) => Array.isArray(grupos) && grupos.includes(rol);

export function esMedicionPropia(medicion, sub) {
  return Boolean(sub) && (medicion?.tomado_por_id === sub || medicion?.usuario_id === sub);
}

// ¿Puede el usuario (grupos de Cognito + sub) mover, eliminar o renombrar esta medición?
export function puedeGestionarMedicion(grupos, sub, medicion) {
  if (tiene(grupos, 'super_admin') || tiene(grupos, 'admin')) return true;
  if (tiene(grupos, 'tecnico')) return esMedicionPropia(medicion, sub);
  return false;
}

// Un lote solo se mueve o elimina completo si el usuario puede con TODAS sus fotos.
export function puedeGestionarLote(grupos, sub, medicionesDelLote = []) {
  return medicionesDelLote.length > 0 && medicionesDelLote.every((m) => puedeGestionarMedicion(grupos, sub, m));
}
