// Etiqueta de los días del historial de un punto (detalle de ubicación).

import { formatFecha } from '../utils/dateFormat.js';

// 'YYYY-MM-DD' (día colombiano del servidor) en el formato de fecha que el
// usuario eligió en Configuración. Se parsea a mano: new Date('YYYY-MM-DD')
// la tomaría como UTC y movería el día.
export function formatearFechaDiaPunto(fechaISO) {
  if (!fechaISO || fechaISO === 'sin-fecha' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) {
    return 'Sin fecha';
  }
  const [y, m, d] = fechaISO.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return 'Sin fecha';
  const fecha = new Date(y, m - 1, d);
  // Rechaza días inexistentes (31 de febrero se desbordaría a marzo).
  if (fecha.getFullYear() !== y || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) {
    return 'Sin fecha';
  }
  return formatFecha(fecha);
}
