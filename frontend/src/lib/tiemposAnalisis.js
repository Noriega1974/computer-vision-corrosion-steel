// Registro local de tiempos de análisis (estudio de latencia YOLO vs U-Net
// medido desde el navegador). Vive en localStorage de ESTE navegador: no se
// envía a ningún servidor. Cada medición agrega una fila; se baja como CSV.
const CLAVE = 'tiemposAnalisis';

const COLUMNAS = [
  'fecha_iso', 'archivo', 'tamano_bytes', 'total_s', 'subida_s', 'analisis_s', 'modelo',
];

export function leerTiempos() {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function registrarTiempo(fila) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify([...leerTiempos(), fila]));
  } catch { /* localStorage no disponible o lleno: el tiempo igual se muestra */ }
}

export function borrarTiempos() {
  try {
    localStorage.removeItem(CLAVE);
  } catch { /* sin localStorage */ }
}

function celdaCsv(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tiemposACsv(filas = leerTiempos()) {
  const lineas = filas.map(f => COLUMNAS.map(c => celdaCsv(f[c])).join(','));
  return [COLUMNAS.join(','), ...lineas].join('\n') + '\n';
}

export function descargarTiemposCsv() {
  const blob = new Blob(['﻿' + tiemposACsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tiempos_analisis.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
