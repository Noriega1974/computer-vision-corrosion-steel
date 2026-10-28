import { useState, useCallback, useEffect, useRef } from 'react';
import exifr from 'exifr';
import { subirUnaMedicion, MAX_FOTO_MB } from './useUploadMedicion';
import { useRefreshKey } from './RefreshKeyContext';

export const LOTE_MAX = 20;
export const NOMBRE_MAX = 80;
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/jpg'];

// Same default-name rule as the single flow: file name without extension.
export const nombreDesdeArchivo = (file) => file.name.replace(/\.[^.]+$/, '').slice(0, NOMBRE_MAX);

// Splits a FileList/array into valid files and rejected names (wrong type).
export function clasificarArchivos(files) {
  const validos = [];
  const rechazados = [];
  Array.from(files).forEach((f) => (TIPOS_OK.includes(f.type) ? validos : rechazados).push(f));
  return { validos, rechazados: rechazados.map((f) => f.name) };
}

let contadorId = 0;

// Sequential batch upload. One photo at a time (no Lambda concurrency spikes,
// readable progress); one failure never stops the batch. Row states:
// 'cola' | 'subiendo' | 'analizando' | 'listo' | 'error'.
export function useUploadLote() {
  const { invalidate } = useRefreshKey();
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const itemsRef = useRef([]);
  itemsRef.current = items;

  const patch = useCallback((id, cambios) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambios } : it)));
  }, []);

  // Revoke every thumbnail URL on unmount.
  useEffect(() => () => {
    itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl));
  }, []);

  // Warn before closing/reloading while the batch is running (same pattern as the single flow).
  useEffect(() => {
    if (!running) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [running]);

  // Adds already-validated files, up to LOTE_MAX in total. Returns how many were dropped by the cap.
  const agregar = useCallback((files) => {
    const hueco = Math.max(0, LOTE_MAX - itemsRef.current.length);
    const tomados = files.slice(0, hueco);
    const nuevos = tomados.map((file) => ({
      id: ++contadorId,
      file,
      nombre: nombreDesdeArchivo(file),
      previewUrl: URL.createObjectURL(file),
      gps: null,
      estado: 'cola',
      progreso: 0,
      inicioAnalisis: null,
      resultado: null,
      error: null,
    }));
    setItems((prev) => [...prev, ...nuevos]);
    // Per-file EXIF GPS, same logic as the single flow.
    nuevos.forEach(async (it) => {
      try {
        const gps = await exifr.gps(it.file);
        if (gps?.latitude && gps?.longitude) patch(it.id, { gps });
      } catch { /* no EXIF */ }
    });
    return files.length - tomados.length;
  }, [patch]);

  const quitar = useCallback((id) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (it) URL.revokeObjectURL(it.previewUrl);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const renombrar = useCallback((id, nombre) => patch(id, { nombre }), [patch]);

  const limpiar = useCallback(() => {
    itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    setItems([]);
    setAnuncio('');
  }, []);

  // Processes one row through the shared upload path.
  const procesar = useCallback(async (it, construirBody) => {
    const inicio = performance.now();
    if (it.file.size > MAX_FOTO_MB * 1024 * 1024) {
      const mb = (it.file.size / (1024 * 1024)).toFixed(1).replace('.', ',');
      patch(it.id, { estado: 'error', error: `La foto pesa ${mb} MB; el máximo es ${MAX_FOTO_MB} MB.` });
      return false;
    }
    patch(it.id, { estado: 'subiendo', progreso: 0, error: null });
    try {
      const res = await subirUnaMedicion(
        it.file,
        construirBody(it),
        inicio,
        (fase) => patch(it.id, fase === 'analizando'
          ? { estado: 'analizando', progreso: 100, inicioAnalisis: Date.now() }
          : { estado: 'subiendo' }),
        (p) => patch(it.id, { progreso: p }),
      );
      patch(it.id, { estado: 'listo', resultado: res });
      return true;
    } catch (err) {
      patch(it.id, { estado: 'error', error: err.message || 'No se pudo analizar la foto.' });
      return false;
    }
  }, [patch]);

  const anunciar = useCallback((id, ok) => {
    const lista = itemsRef.current;
    const pos = lista.findIndex((x) => x.id === id) + 1;
    setAnuncio(`Imagen ${pos} de ${lista.length} ${ok ? 'lista' : 'con error'}`);
  }, []);

  // Runs the given rows one after another, then invalidates the global
  // refresh once (not per file).
  const correr = useCallback(async (ids, construirBody) => {
    setRunning(true);
    let algunExito = false;
    try {
      for (const id of ids) {
        const it = itemsRef.current.find((x) => x.id === id);
        if (!it) continue;
        const ok = await procesar(it, construirBody);
        algunExito = algunExito || ok;
        anunciar(id, ok);
      }
    } finally {
      setRunning(false);
      if (algunExito) invalidate();
    }
  }, [procesar, anunciar, invalidate]);

  // `construirBody(item)` builds the /medicion body for one row (shared fields + its own name/GPS).
  const iniciar = useCallback((construirBody) => {
    const ids = itemsRef.current.filter((x) => x.estado === 'cola').map((x) => x.id);
    return correr(ids, construirBody);
  }, [correr]);

  const reintentar = useCallback((id, construirBody) => correr([id], construirBody), [correr]);

  const iniciado = items.some((x) => x.estado !== 'cola');
  const listos = items.filter((x) => x.estado === 'listo').length;
  const errores = items.filter((x) => x.estado === 'error').length;
  const terminado = iniciado && !running && items.every((x) => x.estado === 'listo' || x.estado === 'error');

  return {
    items, running, anuncio, iniciado, terminado, listos, errores,
    agregar, quitar, renombrar, limpiar, iniciar, reintentar,
  };
}
