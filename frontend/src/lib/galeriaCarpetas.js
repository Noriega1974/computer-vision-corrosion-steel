// Agrupación de la galería en carpetas (empresa -> punto -> lote) a partir de
// la lista de mediciones y de los bloques activos. No hay endpoint de resumen,
// así que los conteos salen de las mediciones cargadas (el backend entrega como
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
export function carpetasDeEmpresas(mediciones = []) {
  return agrupar(mediciones, claveEmpresa).map(g => ({
    ...g,
    puntos: new Set(g.mediciones.map(clavePunto)).size,
    fotos: g.mediciones.length,
  }));
}

// Bloques que pertenecen a una empresa. Para "sin zona" (SIN_ASIGNAR) solo los
// bloques que no tienen empresa; sin empresa conocida, todos.
export function bloquesDeEmpresa(bloques = [], empresaId) {
  if (!Array.isArray(bloques)) return [];
  if (!empresaId) return bloques;
  return bloques.filter(b => (empresaId === SIN_ASIGNAR ? !b.empresa_id : b.empresa_id === empresaId));
}

// Una carpeta por punto dentro de las mediciones (ya filtradas por empresa).
// Si se pasa `bloques`, también incluye los puntos activos que tienen 0 fotos
// para que aparezcan en la galería con `total: 0`, `preview: null` y `ultimaFecha: null`.
export function carpetasDePuntos(mediciones = [], bloques = []) {
  const porId = new Map();
  for (const g of agrupar(mediciones, clavePunto)) {
    const b = Array.isArray(bloques) ? bloques.find(x => x.id_bloque === g.id) : null;
    const total = g.mediciones.length;
    const preview = g.ultima?.url_thumbnail || g.ultima?.url_imagen || b?.portada_url || null;
    const ultimaFecha = g.ultima?.timestamp || null;
    porId.set(g.id, {
      ...g,
      nombre: b?.nombre || g.ultima?.bloque_nombre || 'Sin punto asignado',
      subtitulo: b?.ciudad || 'Sin ciudad',
      fotos: total,
      total,
      preview,
      ultimaFecha,
    });
  }

  if (Array.isArray(bloques)) {
    for (const b of bloques) {
      if (!b || !b.id_bloque || b.activo === false) continue;
      if (porId.has(b.id_bloque)) continue;
      porId.set(b.id_bloque, {
        id: b.id_bloque,
        nombre: b.nombre || 'Punto sin nombre',
        subtitulo: b.ciudad || 'Sin fotos todavía',
        mediciones: [],
        ultima: null,
        fotos: 0,
        total: 0,
        preview: null,
        ultimaFecha: null,
      });
    }
  }

  return Array.from(porId.values());
}

// Separa las mediciones de un punto en carpetas de lote (`lotes`) y mediciones individuales (`sueltas`).
export function agruparPorLote(mediciones = []) {
  const mapaLotes = new Map();
  const sueltas = [];

  for (const m of mediciones) {
    const idLote = typeof m?.lote_id === 'string' ? m.lote_id.trim() : '';
    if (!idLote) {
      sueltas.push(m);
      continue;
    }
    let grupo = mapaLotes.get(idLote);
    if (!grupo) {
      grupo = {
        id: idLote,
        nombre: (typeof m.lote_nombre === 'string' && m.lote_nombre.trim()) || 'Lote sin nombre',
        mediciones: [],
        ultima: null,
      };
      mapaLotes.set(idLote, grupo);
    } else if (grupo.nombre === 'Lote sin nombre' && typeof m.lote_nombre === 'string' && m.lote_nombre.trim()) {
      grupo.nombre = m.lote_nombre.trim();
    }
    grupo.mediciones.push(m);
    if (!grupo.ultima || tiempo(m) > tiempo(grupo.ultima)) {
      grupo.ultima = m;
    }
  }

  const lotes = Array.from(mapaLotes.values())
    .map(g => {
      const ordenadas = [...g.mediciones].sort((a, b) => tiempo(b) - tiempo(a));
      const ultima = ordenadas[0] ?? null;
      return {
        id: g.id,
        nombre: g.nombre,
        total: ordenadas.length,
        preview: ultima?.url_thumbnail || ultima?.url_imagen || null,
        ultimaFecha: ultima?.timestamp || null,
        ultima,
        mediciones: ordenadas,
      };
    })
    .sort((a, b) => (new Date(b.ultimaFecha || 0).getTime() || 0) - (new Date(a.ultimaFecha || 0).getTime() || 0));

  return { lotes, sueltas };
}
