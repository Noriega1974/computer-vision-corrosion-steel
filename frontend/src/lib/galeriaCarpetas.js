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
const pctNum = (m) => {
  const n = Number(m?.area_corroida_pct ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const nivelNum = (m) => {
  const n = Number(m?.nivel_corrosion ?? 0);
  return Number.isFinite(n) ? Math.min(3, Math.max(0, Math.trunc(n))) : 0;
};
const nombreLoteLimpio = (m) => {
  if (m?.lote_nombre === undefined || m?.lote_nombre === null) return '';
  return String(m.lote_nombre).trim();
};

// Calcula el desglose unificado de imágenes y lotes sobre una lista de mediciones.
export function resumenConteoMediciones(mediciones = []) {
  const lista = Array.isArray(mediciones) ? mediciones : [];
  const lotesIds = new Set();
  let imagenesEnLotes = 0;
  let imagenesIndividuales = 0;

  for (const m of lista) {
    const idLote = m?.lote_id != null ? String(m.lote_id).trim() : '';
    if (idLote) {
      lotesIds.add(idLote);
      imagenesEnLotes += 1;
    } else {
      imagenesIndividuales += 1;
    }
  }

  return {
    totalImagenes: lista.length,
    imagenesIndividuales,
    totalLotes: lotesIds.size,
    imagenesEnLotes,
  };
}

// Formatea el conteo unificado: "x imágenes · x lotes con x imágenes".
export function formatearConteoMediciones(mediciones = []) {
  const { totalImagenes, totalLotes, imagenesEnLotes } = resumenConteoMediciones(mediciones);
  const txtTotal = `${totalImagenes} ${totalImagenes === 1 ? 'imagen' : 'imágenes'}`;
  const txtLotes = `${totalLotes} ${totalLotes === 1 ? 'lote' : 'lotes'}`;
  const txtEnLotes = `${imagenesEnLotes} ${imagenesEnLotes === 1 ? 'imagen' : 'imágenes'}`;
  return `${txtTotal} · ${txtLotes} con ${txtEnLotes}`;
}

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
    resumenConteo: resumenConteoMediciones(g.mediciones),
    etiquetaConteo: formatearConteoMediciones(g.mediciones),
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
      resumenConteo: resumenConteoMediciones(g.mediciones),
      etiquetaConteo: formatearConteoMediciones(g.mediciones),
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
        resumenConteo: resumenConteoMediciones([]),
        etiquetaConteo: formatearConteoMediciones([]),
      });
    }
  }

  return Array.from(porId.values());
}

// Separa las mediciones de un punto en carpetas de lote (`lotes`) y mediciones individuales (`sueltas`).
export function agruparPorLote(mediciones = []) {
  const mapaLotes = new Map();
  const sueltas = [];

  for (const m of mediciones ?? []) {
    const idLote = m?.lote_id != null ? String(m.lote_id).trim() : '';
    if (!idLote) {
      sueltas.push(m);
      continue;
    }
    const candidatoNombre = nombreLoteLimpio(m);
    let grupo = mapaLotes.get(idLote);
    if (!grupo) {
      grupo = {
        id: idLote,
        nombre: candidatoNombre || 'Lote sin nombre',
        mediciones: [],
        ultima: null,
      };
      mapaLotes.set(idLote, grupo);
    } else if (grupo.nombre === 'Lote sin nombre' && candidatoNombre) {
      grupo.nombre = candidatoNombre;
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
      let peorNivel = 0;
      let peorPct = 0;
      let sumaPct = 0;
      let conPct = 0;   // photos with a measured %: the ones still processing (null) are not averaged as 0
      let todasAnalizadas = ordenadas.length > 0;

      for (let i = 0; i < ordenadas.length; i += 1) {
        const item = ordenadas[i];
        const niv = nivelNum(item);
        const p = pctNum(item);
        if (i === 0 || niv > peorNivel) peorNivel = niv;
        if (i === 0 || p > peorPct) peorPct = p;
        if (item?.area_corroida_pct !== undefined && item?.area_corroida_pct !== null && Number.isFinite(Number(item.area_corroida_pct))) {
          sumaPct += p;
          conPct += 1;
        }
        if (
          item?.area_corroida_pct === undefined ||
          item?.area_corroida_pct === null ||
          item?.estado === 'en_proceso' ||
          item?.estado === 'pendiente'
        ) {
          todasAnalizadas = false;
        }
      }

      const promedioPct = conPct > 0 ? Math.round((sumaPct / conPct) * 10) / 10 : 0;

      return {
        id: g.id,
        nombre: g.nombre,
        total: ordenadas.length,
        preview: ultima?.url_thumbnail || ultima?.url_imagen || null,
        ultimaFecha: ultima?.timestamp || null,
        ultima,
        peorNivel,
        peorPct: Math.round(peorPct * 10) / 10,
        promedioPct,
        estado: todasAnalizadas ? 'analizado' : 'en_proceso',
        mediciones: ordenadas,
      };
    })
    .sort((a, b) => (new Date(b.ultimaFecha || 0).getTime() || 0) - (new Date(a.ultimaFecha || 0).getTime() || 0));

  return { lotes, sueltas };
}

// Todas las mediciones de un lote tomadas de la lista SIN filtrar (los filtros de
// nivel o fechas de la galería solo ocultan, no cambian qué contiene el lote).
export function medicionesDeLote(mediciones = [], loteId) {
  if (!loteId) return [];
  return agruparPorLote(mediciones).lotes.find(l => l.id === loteId)?.mediciones ?? [];
}

// Marked photos of a whole batch that the current filters hide. Both sides count
// only photos that can be acted on (`elegible`), so a photo without a point never
// shows up as "hidden" just because it was never selectable.
export function contarOcultasPorFiltro(elegidas = [], visibles = [], marcadas = new Set(), elegible = () => true) {
  const visiblesMarcadas = visibles.filter(m => elegible(m) && marcadas.has(m.id_medicion)).length;
  return Math.max(0, elegidas.filter(m => elegible(m)).length - visiblesMarcadas);
}
