// Helpers for GET /mediciones/resumen-diario (per local-day aggregates, UTC-5).
// The server answers one year per call; consumers that need several years
// (a location's history) call it once per year and merge here.

import { plural } from './textUtils.js';

export const ANIO_INICIO_DATOS = 2026;

// [2026 .. anioActual]; never a future year.
export function aniosDesde(anioActual, inicio = ANIO_INICIO_DATOS) {
  const fin = Math.max(inicio, Math.trunc(Number(anioActual)) || inicio);
  return Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i);
}

export function urlResumenDiario(anio, { idPunto, empresaId } = {}) {
  const qs = new URLSearchParams({ anio: String(anio) });
  if (idPunto) qs.set('id_punto', String(idPunto));
  if (empresaId && empresaId !== 'all') qs.set('empresa_id', String(empresaId));
  return `/mediciones/resumen-diario?${qs}`;
}

// Merges per-year responses into one: days sorted newest first (the history
// order), totals summed, `truncado` if any year was cut by the server.
export function combinarResumenes(respuestas = []) {
  const dias = [];
  const totales = { imagenes: 0, lotes: 0, imagenes_en_lotes: 0 };
  let truncado = false;
  for (const r of respuestas) {
    if (!r) continue;
    for (const d of r.dias ?? []) dias.push(d);
    totales.imagenes += Number(r.totales?.imagenes) || 0;
    totales.lotes += Number(r.totales?.lotes) || 0;
    totales.imagenes_en_lotes += Number(r.totales?.imagenes_en_lotes) || 0;
    if (r.truncado) truncado = true;
  }
  dias.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return { dias, totales, truncado };
}

// "X mediciones con Y lotes" (header of a location). Without batches: "X mediciones".
export function textoMedicionesConLotes(mediciones, lotes) {
  const n = Number(mediciones) || 0;
  const l = Number(lotes) || 0;
  const base = plural(n, 'medición', 'mediciones');
  return l > 0 ? `${base} con ${plural(l, 'lote', 'lotes')}` : base;
}

// "N mediciones · x lotes" (box of one day). Without batches: "N mediciones".
export function textoMedicionesDia(total, lotes) {
  const n = Number(total) || 0;
  const l = Number(lotes?.count) || 0;
  const base = plural(n, 'medición', 'mediciones');
  return l > 0 ? `${base} · ${plural(l, 'lote', 'lotes')}` : base;
}
