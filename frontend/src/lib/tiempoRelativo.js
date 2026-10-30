// Tiempo relativo en español con singular/plural correcto: "hace 1 día",
// "hace 2 días", "hace 1 mes", "hace 3 meses", "hace 1 año".
// `vacio`: texto si no hay fecha. `formatFecha`: si se da, a partir de 30 días
// se muestra la fecha absoluta en lugar de meses/años. `ahora`: para pruebas.
export function tiempoRelativo(timestamp, { vacio = '', formatFecha, ahora = Date.now() } = {}) {
  if (!timestamp) return vacio;
  const diff = Math.max(0, ahora - new Date(timestamp).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  if (formatFecha) return formatFecha(timestamp);
  if (days < 365) {
    const meses = Math.floor(days / 30);
    return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  }
  const anios = Math.floor(days / 365);
  return `hace ${anios} ${anios === 1 ? 'año' : 'años'}`;
}
