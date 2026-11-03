import { formatFecha } from '../utils/dateFormat.js';

// The header breadcrumb lives outside the measurement page, so the page
// publishes a human title through a window event instead of showing the raw id.
export const EVENTO_TITULO_DETALLE = 'pixelrust:titulo-detalle';

// Photo name when it has one, otherwise "Medición del <fecha>".
export function tituloMedicion(medicion) {
  const nombre = typeof medicion?.nombre === 'string' ? medicion.nombre.trim() : '';
  if (nombre) return nombre;
  if (!medicion?.timestamp) return 'Medición';
  return `Medición del ${formatFecha(medicion.timestamp)}`;
}

export function publicarTituloDetalle(titulo) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO_TITULO_DETALLE, { detail: titulo }));
}
