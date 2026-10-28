// Latest medicion per punto, chosen by `timestamp` (independent of API order).
// Mediciones without `bloque_id` are ignored. Returns Map<bloque_id, medicion>.
// A missing/invalid timestamp counts as the oldest; ties keep the first seen.
export function ultimaMedicionPorPunto(mediciones = []) {
  const ultima = new Map();
  for (const m of mediciones) {
    if (!m?.bloque_id) continue;
    const t = new Date(m.timestamp).getTime() || 0;
    const previa = ultima.get(m.bloque_id);
    if (!previa || t > previa.t) ultima.set(m.bloque_id, { t, medicion: m });
  }
  return new Map([...ultima].map(([id, { medicion }]) => [id, medicion]));
}
