// Points of the "Tendencia del área corroída" chart: one per local day, built from
// GET /mediciones/resumen-diario (promedio_pct, nivel_ponderado, peor_nivel,
// min_pct, max_pct, por_nivel).

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

// Whole days since 1970-01-01 for "YYYY-MM-DD" (UTC math, so no DST/time-zone drift).
// Lets the chart place days proportionally on a time axis.
export function diaEpoch(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha ?? ''));
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) : null;
}

// Photos per level [sin, leve, moderada, severa]; always 4 non-negative integers.
function conteoNiveles(v) {
  const base = Array.isArray(v) ? v : [];
  return [0, 1, 2, 3].map((i) => (Number.isInteger(base[i]) && base[i] > 0 ? base[i] : 0));
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
      dia: diaEpoch(d.fecha),
      total: Number(d.total) || 0,
      promedio: Number(d.promedio_pct.toFixed(1)),
      nivel: nivelValido(d.nivel_ponderado),
      peorNivel: nivelValido(d.peor_nivel),
      porNivel: conteoNiveles(d.por_nivel),
      // min_pct is missing until the backend that adds it is deployed: no band then.
      minPct: esNumero(d.min_pct) ? d.min_pct : null,
      maxPct: esNumero(d.max_pct) ? d.max_pct : null,
    }));
}

// Plain-text reading of the last `n` days (newest first) for screen readers and
// keyboard users, who cannot hover the chart.
export function resumenAccesible(puntos, labelNivel, n = 7) {
  return [...(puntos ?? [])].slice(-n).reverse().map((p) => {
    const niveles = textoNivelesDia(p, labelNivel);
    return `${textoPromedioDia(p)} · ${textoDetalleDia(p, labelNivel)}${niveles ? ` · ${niveles}` : ''}`;
  });
}

// "3 nov · 12,4% promedio"
export function textoPromedioDia(p) {
  return `${p.etiqueta} · ${formatoPct(p.promedio)} promedio`;
}

// "3 mediciones · Mín. 0,2% · Máx. 40,5% (Severa)"; label is injected to keep this file pure.
// The "Mín." part is left out while the backend does not send min_pct.
export function textoDetalleDia(p, labelNivel) {
  const partes = [plural(p.total, 'medición', 'mediciones')];
  if (p.minPct != null) partes.push(`Mín. ${formatoPct(p.minPct)}`);
  if (p.maxPct != null) {
    const nivel = p.peorNivel != null ? ` (${labelNivel(p.peorNivel)})` : '';
    partes.push(`Máx. ${formatoPct(p.maxPct)}${nivel}`);
  }
  return partes.join(' · ');
}

// "Sin corrosión 2 · Leve 1 · Severa 1" (levels with no photos are omitted).
export function textoNivelesDia(p, labelNivel) {
  return p.porNivel.map((n, i) => (n > 0 ? `${labelNivel(i)} ${n}` : null)).filter(Boolean).join(' · ');
}

const PASOS_EJE_PCT = [5, 10, 20, 25, 50];

// Y axis of the average plot: starts at 0, ends at a multiple of a round step (5, 10,
// 20, 25 or 50) that contains `tope` (max 100), with at most four evenly spaced intervals.
export function ejePorcentaje(tope) {
  const t = Math.min(Math.max(Number(tope) || 0, 0), 100);
  const paso = PASOS_EJE_PCT.find((p) => Math.ceil(t / p) <= 4) ?? 25;
  const max = Math.min(Math.max(Math.ceil(t / paso), 1) * paso, 100);
  const ticks = [];
  for (let v = 0; v <= max; v += paso) ticks.push(v);
  return { dominio: [0, max], ticks };
}
