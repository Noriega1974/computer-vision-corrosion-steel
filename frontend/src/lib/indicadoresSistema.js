// System-wide KPIs for the dashboard, computed from a list of mediciones.
// Counted per point (latest measurement) so a large batch of photos does not
// distort them: one bad photo only matters while it is a point's latest.

const DIA_MS = 24 * 60 * 60 * 1000;
export const VENTANA_DIAS = 30;
// Model noise between two photos of the same plate is a few points; below this
// rise a point is not reported as worse.
export const UMBRAL_EMPEORO_PP = 2;

const tiempo = (m) => new Date(m?.timestamp).getTime() || 0;
const pct = (m) => (Number.isFinite(m?.area_corroida_pct) ? m.area_corroida_pct : null);

// Map<bloque_id, mediciones sorted newest first>; mediciones without a point are ignored.
function historialPorPunto(mediciones) {
  const porPunto = new Map();
  for (const m of mediciones) {
    if (!m?.bloque_id) continue;
    if (!porPunto.has(m.bloque_id)) porPunto.set(m.bloque_id, []);
    porPunto.get(m.bloque_id).push(m);
  }
  for (const lista of porPunto.values()) lista.sort((a, b) => tiempo(b) - tiempo(a));
  return porPunto;
}

export function calcularIndicadores(mediciones = [], ahora = Date.now()) {
  const desde = ahora - VENTANA_DIAS * DIA_MS;
  const porPunto = historialPorPunto(mediciones);

  let mayor = null;
  let puntosEmpeoraron = 0;
  let puntosAlDia = 0;

  for (const [, lista] of porPunto) {
    const [ultima, anterior] = lista;
    const pctUltima = pct(ultima);
    const reciente = tiempo(ultima) >= desde;

    if (reciente) puntosAlDia++;
    if (pctUltima !== null && (!mayor || pctUltima > mayor.pct)) {
      mayor = { pct: pctUltima, punto: ultima.bloque_nombre ?? null, nivel: ultima.nivel_corrosion ?? null };
    }
    const pctAnterior = pct(anterior);
    if (reciente && pctUltima !== null && pctAnterior !== null
        && pctUltima - pctAnterior >= UMBRAL_EMPEORO_PP) {
      puntosEmpeoraron++;
    }
  }

  const totalPuntos = porPunto.size;
  return {
    totalPuntos,
    mayorCorrosion: mayor,
    puntosEmpeoraron,
    pctPuntosAlDia: totalPuntos ? Math.round((puntosAlDia / totalPuntos) * 100) : null,
    mediciones30Dias: mediciones.filter(m => tiempo(m) >= desde).length,
  };
}
