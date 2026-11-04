// Points of the "Tendencia del área corroída" chart: one per local day, built from
// GET /mediciones/resumen-diario (promedio_pct, nivel_ponderado, peor_nivel, max_pct).

export const DIAS_TENDENCIA_MAX = 60;

import { formatoPct, plural } from './textUtils.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const nivelValido = (v) => (Number.isInteger(v) && v >= 0 && v <= 3 ? v : null);

// "2026-11-03" -> "3 nov" (parsed by hand: new Date() would shift the day by time zone).
// With `conAnio`: "3 nov 2026" (used when the plotted days span more than one year).
export function etiquetaDia(fecha, { conAnio = false } = {}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha ?? ''));
  if (!m) return String(fecha ?? '');
  const base = `${Number(m[3])} ${MESES[Number(m[2]) - 1] ?? ''}`.trim();
  return conAnio ? `${base} ${m[1]}` : base;
}

// Oldest to newest, last `max` days that have an average. Days without a numeric
// average (no valid percentage that day) are skipped.
export function puntosTendencia(dias, max = DIAS_TENDENCIA_MAX) {
  const elegidos = [...(dias ?? [])]
    .filter((d) => d && d.fecha && esNumero(d.promedio_pct))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    .slice(-max);
  // Two "3 nov" from different years would look identical on the axis.
  const conAnio = new Set(elegidos.map((d) => String(d.fecha).slice(0, 4))).size > 1;
  return elegidos
    .map((d) => ({
      fecha: d.fecha,
      etiqueta: etiquetaDia(d.fecha, { conAnio }),
      total: Number(d.total) || 0,
      promedio: Number(d.promedio_pct.toFixed(1)),
      nivel: nivelValido(d.nivel_ponderado),
      peorNivel: nivelValido(d.peor_nivel),
      peorPct: esNumero(d.max_pct) ? d.max_pct : null,
    }));
}

// Plain-text reading of the last `n` days (newest first) for screen readers and
// keyboard users, who cannot hover the chart.
export function resumenAccesible(puntos, labelNivel, n = 7) {
  return [...(puntos ?? [])].slice(-n).reverse().map((p) => `${textoPromedioDia(p)} · ${textoDetalleDia(p, labelNivel)}`);
}

// "3 nov · 12,4% promedio"
export function textoPromedioDia(p) {
  return `${p.etiqueta} · ${formatoPct(p.promedio)} promedio`;
}

// "3 mediciones · Peor: 40,5% (Severa)"; label is injected to keep this file pure.
export function textoDetalleDia(p, labelNivel) {
  const imagenes = plural(p.total, 'medición', 'mediciones');
  if (p.peorPct == null) return imagenes;
  const nivel = p.peorNivel != null ? ` (${labelNivel(p.peorNivel)})` : '';
  return `${imagenes} · Peor: ${formatoPct(p.peorPct)}${nivel}`;
}
