// Points of the "Tendencia del área corroída" chart: one per local day, built from
// GET /mediciones/resumen-diario (promedio_pct, nivel_ponderado, peor_nivel, max_pct).

export const DIAS_TENDENCIA_MAX = 60;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const nivelValido = (v) => (Number.isInteger(v) && v >= 0 && v <= 3 ? v : null);

// "2026-11-03" -> "3 nov" (parsed by hand: new Date() would shift the day by time zone).
export function etiquetaDia(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha ?? ''));
  if (!m) return String(fecha ?? '');
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1] ?? ''}`.trim();
}

// 12.43 -> "12,4%" (one decimal, comma, same format as formatoPct).
export function pctTexto(n) {
  return `${Number(n ?? 0).toFixed(1).replace('.', ',')}%`;
}

// Oldest to newest, last `max` days that have an average. Days without a numeric
// average (no valid percentage that day) are skipped.
export function puntosTendencia(dias, max = DIAS_TENDENCIA_MAX) {
  return [...(dias ?? [])]
    .filter((d) => d && d.fecha && esNumero(d.promedio_pct))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    .slice(-max)
    .map((d) => ({
      fecha: d.fecha,
      etiqueta: etiquetaDia(d.fecha),
      total: Number(d.total) || 0,
      promedio: Number(d.promedio_pct.toFixed(1)),
      nivel: nivelValido(d.nivel_ponderado),
      peorNivel: nivelValido(d.peor_nivel),
      peorPct: esNumero(d.max_pct) ? d.max_pct : null,
    }));
}

// "3 nov · 12,4% promedio"
export function textoPromedioDia(p) {
  return `${p.etiqueta} · ${pctTexto(p.promedio)} promedio`;
}

// "3 imágenes · Peor: 40,5% (Severa)"; label is injected to keep this file pure.
export function textoDetalleDia(p, labelNivel) {
  const imagenes = `${p.total} ${p.total === 1 ? 'imagen' : 'imágenes'}`;
  if (p.peorPct == null) return imagenes;
  const nivel = p.peorNivel != null ? ` (${labelNivel(p.peorNivel)})` : '';
  return `${imagenes} · Peor: ${pctTexto(p.peorPct)}${nivel}`;
}
