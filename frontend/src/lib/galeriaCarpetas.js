// Agrupación de la galería en carpetas (empresa -> punto) a partir de la lista
// de mediciones que ya trae el backend. No hay endpoint de resumen, así que
// los conteos salen de las mediciones cargadas (el backend entrega como
// máximo las 1000 más recientes).

// Clave de carpeta para mediciones sin punto o sin empresa asignada.
export const SIN_ASIGNAR = '_sin';

export const claveEmpresa = (m) => m.empresa_id || SIN_ASIGNAR;
export const clavePunto = (m) => m.bloque_id || SIN_ASIGNAR;

// Iniciales para el círculo de respaldo de una carpeta sin imagen ("Universidad del Norte" -> "UN", "Bloque K" -> "BK").
export function iniciales(nombre) {
  const palabras = (nombre ?? '').split(/\s+/).filter(p => /^[\p{L}\p{N}]/u.test(p));
  const letras = palabras.length > 1 ? [palabras[0], palabras[1]] : palabras.slice(0, 1);
  return letras.map(p => Array.from(p)[0]).join('').toUpperCase() || '?';
}

const tiempo = (m) => new Date(m.timestamp).getTime() || 0;

// Agrupa por la clave dada y devuelve, por grupo, sus mediciones y la más reciente.
function agrupar(mediciones, claveDe) {
  const grupos = new Map();
  for (const m of mediciones) {
    const clave = claveDe(m);
    const g = grupos.get(clave) ?? { id: clave, mediciones: [], ultima: null };
    g.mediciones.push(m);
    if (!g.ultima || tiempo(m) > tiempo(g.ultima)) g.ultima = m;
    grupos.set(clave, g);
  }
  return Array.from(grupos.values()).sort((a, b) => tiempo(b.ultima) - tiempo(a.ultima));
}

// Una carpeta por empresa: cuántos puntos y fotos tiene y su última medición.
export function carpetasDeEmpresas(mediciones) {
  return agrupar(mediciones, claveEmpresa).map(g => ({
    ...g,
    puntos: new Set(g.mediciones.map(clavePunto)).size,
    fotos: g.mediciones.length,
  }));
}

// Una carpeta por punto dentro de las mediciones (ya filtradas por empresa).
export function carpetasDePuntos(mediciones) {
  return agrupar(mediciones, clavePunto).map(g => ({ ...g, fotos: g.mediciones.length }));
}
