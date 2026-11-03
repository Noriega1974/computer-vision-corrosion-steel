// Filtrado y agrupación cronológica de mediciones para la línea de tiempo del panel.

import { inicioDiaLocal, finDiaLocal, hoyLocalISO, desplazarDiasISO, formatearFechaAmigable } from './fechas.js';
import { normalizar } from './textUtils.js';

const tiempoMs = (m) => {
  const t = new Date(m?.timestamp).getTime();
  return Number.isFinite(t) ? t : 0;
};

const pctNum = (m) => {
  const n = Number(m?.area_corroida_pct ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const nivelNum = (m) => {
  const n = Number(m?.nivel_corrosion ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function autorDeMedicion(m) {
  return (
    m?.creado_por_nombre ||
    m?.tomado_por_nombre ||
    m?.usuario_email ||
    m?.usuario_id ||
    ''
  );
}

// Filtra la lista de mediciones por empresa, punto (bloque), nivel ISO, rango
// de fechas locales (inicioDiaLocal / finDiaLocal) y texto libre.
export function filtrarMedicionesLineaTiempo(
  mediciones = [],
  {
    empresaId = 'all',
    bloqueId = 'all',
    nivel = 'all',
    fechaInicio = '',
    fechaFin = '',
    busqueda = '',
  } = {},
) {
  const limIni = fechaInicio ? inicioDiaLocal(fechaInicio) : null;
  const limFin = fechaFin ? finDiaLocal(fechaFin) : null;
  const q = normalizar(busqueda || '');

  return mediciones.filter((m) => {
    if (!m) return false;
    if (empresaId && empresaId !== 'all' && m.empresa_id !== empresaId) return false;
    const idBloque = m.bloque_id || m.id_punto;
    if (bloqueId && bloqueId !== 'all' && idBloque !== bloqueId) return false;
    if (nivel !== undefined && nivel !== null && nivel !== '' && nivel !== 'all') {
      if (nivelNum(m) !== Number(nivel)) return false;
    }
    if (limIni || limFin) {
      const ts = new Date(m.timestamp);
      if (Number.isNaN(ts.getTime())) return false;
      if (limIni && ts < limIni) return false;
      if (limFin && ts > limFin) return false;
    }
    if (q) {
      const texto = normalizar(
        `${m.nombre ?? ''} ${m.lote_nombre ?? ''} ${m.bloque_nombre ?? ''} ${m.notas ?? ''} ${autorDeMedicion(m)}`,
      );
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

// Ordena las mediciones de más reciente a más antigua, las agrupa por día
// calendario local ('YYYY-MM-DD') y dentro de cada día colapsa las que
// comparten `lote_id` en un único evento de lote.
export function agruparEventosPorDia(mediciones = [], { ahora = new Date() } = {}) {
  const ordenadas = [...mediciones].sort((a, b) => tiempoMs(b) - tiempoMs(a));
  const diasMap = new Map();

  for (const m of ordenadas) {
    const dt = new Date(m?.timestamp);
    const fechaISO = Number.isNaN(dt.getTime()) ? 'sin-fecha' : hoyLocalISO(dt);
    let grupoDia = diasMap.get(fechaISO);
    if (!grupoDia) {
      grupoDia = {
        fechaISO,
        etiquetaDia: etiquetarDiaLineaTiempo(fechaISO, ahora),
        eventos: [],
        lotesVistos: new Map(),
        totalFotos: 0,
      };
      diasMap.set(fechaISO, grupoDia);
    }

    grupoDia.totalFotos += 1;
    const idLote = typeof m?.lote_id === 'string' ? m.lote_id.trim() : '';

    if (idLote) {
      let evLote = grupoDia.lotesVistos.get(idLote);
      if (!evLote) {
        evLote = {
          tipo: 'lote',
          id: idLote,
          loteNombre: (typeof m.lote_nombre === 'string' && m.lote_nombre.trim()) || 'Lote sin nombre',
          puntoNombre: m.bloque_nombre || 'Sin punto asignado',
          bloqueId: m.bloque_id || m.id_punto || null,
          empresaId: m.empresa_id || null,
          totalFotos: 0,
          peorPct: 0,
          peorNivel: 0,
          promedioPct: 0,
          _sumaPct: 0,
          timestamp: m.timestamp || null,
          autor: autorDeMedicion(m),
          mediciones: [],
        };
        grupoDia.lotesVistos.set(idLote, evLote);
        grupoDia.eventos.push(evLote);
      }
      evLote.mediciones.push(m);
      evLote.totalFotos = evLote.mediciones.length;
      const p = pctNum(m);
      const niv = nivelNum(m);
      if (evLote.totalFotos === 1 || p > evLote.peorPct) evLote.peorPct = p;
      if (evLote.totalFotos === 1 || niv > evLote.peorNivel) evLote.peorNivel = niv;
      evLote._sumaPct += p;
      evLote.promedioPct = Math.round((evLote._sumaPct / evLote.totalFotos) * 10) / 10;
      if (!evLote.autor) evLote.autor = autorDeMedicion(m);
      if (evLote.loteNombre === 'Lote sin nombre' && typeof m.lote_nombre === 'string' && m.lote_nombre.trim()) {
        evLote.loteNombre = m.lote_nombre.trim();
      }
    } else {
      grupoDia.eventos.push({
        tipo: 'medicion',
        id: m.id_medicion || `${fechaISO}-${grupoDia.eventos.length}`,
        timestamp: m.timestamp || null,
        medicion: m,
      });
    }
  }

  return Array.from(diasMap.values()).map(({ fechaISO, etiquetaDia, eventos, totalFotos }) => ({
    fechaISO,
    etiquetaDia,
    totalEventos: eventos.length,
    totalFotos,
    eventos: eventos.map((ev) => {
      if (ev.tipo === 'lote') {
        const { _sumaPct, ...resto } = ev;
        return resto;
      }
      return ev;
    }),
  }));
}

export function etiquetarDiaLineaTiempo(fechaISO, ahora = new Date()) {
  if (!fechaISO || fechaISO === 'sin-fecha') return 'Sin fecha';
  const hoy = hoyLocalISO(ahora);
  const ayer = desplazarDiasISO(hoy, -1);
  const amigable = formatearFechaAmigable(fechaISO, { ahora });
  if (fechaISO === hoy) return `Hoy · ${amigable}`;
  if (fechaISO === ayer) return `Ayer · ${amigable}`;
  return amigable;
}
