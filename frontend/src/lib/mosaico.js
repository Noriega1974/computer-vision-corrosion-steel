// Helpers for the square photo tiles ("mosaico") used in the dashboard panels.
import { nivelLabel } from './statusUtils.js';
import { formatoPct } from './textUtils.js';

// Route to the photo detail, same shape the list rows used.
export function destinoMedicion(medicion, idPuntoFallback) {
  if (!medicion?.id_medicion) return null;
  const id = medicion.bloque_id || medicion.id_punto || idPuntoFallback;
  const base = `/galeria/${encodeURIComponent(medicion.id_medicion)}`;
  return id ? `${base}?punto=${encodeURIComponent(id)}` : base;
}

export function miniaturaDe(medicion) {
  return medicion?.url_thumbnail || medicion?.url_imagen || null;
}

// Accessible name of a photo tile: name, level and percentage.
export function etiquetaTestera(medicion, fechaTexto = '') {
  const nivel = medicion?.nivel_corrosion ?? 0;
  const partes = [
    medicion?.nombre || 'Foto',
    nivelLabel(nivel),
    medicion?.area_corroida_pct == null ? null : formatoPct(medicion.area_corroida_pct),
    fechaTexto || null,
  ].filter(Boolean);
  return partes.join(', ');
}

export function etiquetaTesteraLote(nombre, total, nivel) {
  const n = Number(total) || 0;
  return `Lote ${nombre || 'sin nombre'}, ${n} ${n === 1 ? 'imagen' : 'imágenes'}, peor nivel ${nivelLabel(nivel ?? 0)}`;
}

// Short name under a tile: photo name, otherwise the time of the day.
export function nombreCorto(medicion, horaTexto = '') {
  const n = typeof medicion?.nombre === 'string' ? medicion.nombre.trim() : '';
  return n || horaTexto || 'Foto';
}

// Queue tile caption for the upload grid.
export function estadoTesteraSubida(it) {
  switch (it?.estado) {
    case 'cola': return it.reintentando ? 'Reintentando' : 'En cola';
    case 'subiendo': return `Subiendo ${it.progreso ?? 0} %`;
    case 'analizando': return 'Analizando';
    case 'listo': return 'Listo';
    default: return 'Error';
  }
}
