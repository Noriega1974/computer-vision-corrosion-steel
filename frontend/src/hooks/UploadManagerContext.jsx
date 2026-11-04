import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import exifr from 'exifr';
import { subirUnaMedicion, MAX_FOTO_MB } from './useUploadMedicion';
import { useRefreshKey } from './RefreshKeyContext';
import { useAuth } from '../auth/AuthContext';
import { formatoMB } from '../lib/textUtils';
import {
  quitarSeleccionadas,
  FASE_MEDICION,
  FASE_PREVIA,
  LOTE_MAX,
  calcularProgresoSubida,
  debeInvalidar,
  debeActualizarProgreso,
  ejecutarColaConcurrencia,
  esReanudable,
  esAbortoPorDetener,
  errorDetenido,
  normalizarEntrada,
} from '../lib/gestorSubida';

// Background batch upload. Lives above the routes (see App.jsx), so it owns
// the File objects and keeps uploading while the user navigates the app.
// Row states: 'cola' | 'subiendo' | 'analizando' | 'listo' | 'error' | 'detenida'.
// Preview URLs are not created here: UploadCola makes them only for visible rows.

let contadorId = 0;

// `sesion` holds everything shared by the batch rows, fixed when it starts so
// a resume or a per-photo retry reuses the same lote_id, lote_nombre,
// bloque_id and timestamp_medicion:
// { loteId, loteNombre, bloqueId, bloqueNombre, empresaId, timestampMedicion, notas }
function construirBody(sesion, it, gps) {
  return {
    fuente: 'movil',
    bloque_id: sesion.bloqueId,
    ...(sesion.loteId && { lote_id: sesion.loteId }),
    ...(sesion.loteNombre && { lote_nombre: sesion.loteNombre }),
    timestamp_medicion: sesion.timestampMedicion,
    ...(it.nombre?.trim() && { nombre: it.nombre.trim() }),
    ...(sesion.notas && { notas: sesion.notas }),
    ...(gps && { latitud_real: gps.latitude, longitud_real: gps.longitude }),
  };
}

async function leerGps(file) {
  try {
    const gps = await exifr.gps(file);
    return gps?.latitude != null && gps?.longitude != null ? { latitude: gps.latitude, longitude: gps.longitude } : null;
  } catch {
    return null;  // no EXIF
  }
}

function useGestorSubida() {
  const { invalidate } = useRefreshKey();
  const { user } = useAuth();
  const sub = user?.sub ?? null;
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);
  const [sesion, setSesion] = useState(null);
  const [anuncio, setAnuncio] = useState('');
  const [avisoCerrado, setAvisoCerrado] = useState(false);
  const [deteniendo, setDeteniendo] = useState(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const sesionRef = useRef(sesion);
  sesionRef.current = sesion;
  const runningRef = useRef(false);
  const ultimoInvalidarRef = useRef(null);
  // Cancellation: every run captures `genRef`; logout bumps it, so in-flight workers
  // see `cancelado()` and stop. `abortRef` aborts the S3 transfers in flight.
  const genRef = useRef(0);
  const abortRef = useRef(null);
  // User-requested stop of the current run ("Detener"): reset when a run starts.
  const paradaRef = useRef(false);
  const ultimoProgresoRef = useRef(new Map());  // item id -> last published tick (ms)

  const patch = useCallback((id, cambios) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambios } : it)));
  }, []);

  // Warn before closing/reloading the tab while photos are still uploading.
  useEffect(() => {
    if (!running) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [running]);

  // Adds already-validated files (or { file, nombre } to keep a typed name), up to
  // LOTE_MAX in total. Returns how many were dropped by the cap.
  const agregar = useCallback((files) => {
    const lista = Array.from(files ?? []);
    const hueco = Math.max(0, LOTE_MAX - itemsRef.current.length);
    const tomados = lista.slice(0, hueco);
    const nuevos = tomados.map(normalizarEntrada).map(({ file, nombre }) => ({
      id: ++contadorId,
      file,
      nombre,
      gps: undefined,  // read from EXIF right before uploading the photo
      estado: 'cola',
      progreso: 0,
      inicioAnalisis: null,
      resultado: null,
      error: null,
      incierto: false,
      reintentando: false,
    }));
    if (nuevos.length) setItems((prev) => [...prev, ...nuevos]);
    return lista.length - tomados.length;
  }, []);

  const quitar = useCallback((id) => {
    if (sesionRef.current) return;  // rows are fixed once the batch starts
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Bulk removal of the selected rows (same rule: only before the batch starts).
  const quitarVarias = useCallback((ids) => {
    if (sesionRef.current) return;
    const quitar = new Set(ids);
    setItems((prev) => quitarSeleccionadas(prev, quitar));
  }, []);

  // Logout (or switching account): abort the pool, drop the queue and the session so the
  // next user never sees or continues someone else's batch. Clearing the rows unmounts
  // the thumbnails, which revoke their object URLs.
  const cancelarTodo = useCallback(() => {
    genRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
    paradaRef.current = false;
    sesionRef.current = null;
    ultimoProgresoRef.current.clear();
    setItems([]);
    setSesion(null);
    setRunning(false);
    setDeteniendo(false);
    setAnuncio('');
    setAvisoCerrado(false);
  }, []);

  useEffect(() => cancelarTodo, [sub, cancelarTodo]);

  const limpiar = useCallback(() => {
    if (runningRef.current) return;
    setItems([]);
    setSesion(null);
    setAnuncio('');
    setAvisoCerrado(false);
  }, []);

  const anunciar = useCallback((id, ok) => {
    const lista = itemsRef.current;
    const pos = lista.findIndex((x) => x.id === id) + 1;
    if (pos > 0) setAnuncio(`Imagen ${pos} de ${lista.length} ${ok ? 'lista' : 'con error'}`);
  }, []);

  // One photo through the shared upload path. The error carries the phase it
  // happened in, so the pool knows whether repeating it could duplicate a measurement.
  const tarea = useCallback(async (it) => {
    const gen = genRef.current;
    const cancelado = () => genRef.current !== gen;
    const parchar = (id, cambios) => { if (!cancelado()) patch(id, cambios); };
    let fase = FASE_PREVIA;
    try {
      if (it.file.size > MAX_FOTO_MB * 1024 * 1024) {
        throw new Error(`La foto pesa ${formatoMB(it.file.size)}; el máximo es ${MAX_FOTO_MB} MB.`);
      }
      // `reintentando` is reset here: it is set by the pool between attempts.
      parchar(it.id, { estado: 'subiendo', progreso: 0, error: null, incierto: false, reintentando: false });
      const actual = itemsRef.current.find((x) => x.id === it.id) ?? it;
      let gps = actual.gps;
      if (gps === undefined) {
        gps = await leerGps(it.file);
        parchar(it.id, { gps });
      }
      if (cancelado()) throw new Error('Subida cancelada.');
      if (paradaRef.current) throw errorDetenido();
      const body = construirBody(sesionRef.current, actual, gps);
      return await subirUnaMedicion(
        it.file,
        body,
        performance.now(),
        (f) => {
          if (f === 'analizando') {
            fase = FASE_MEDICION;
            parchar(it.id, { estado: 'analizando', progreso: 100, inicioAnalisis: Date.now() });
          }
        },
        (p) => {
          const ahora = performance.now();
          if (!debeActualizarProgreso(ultimoProgresoRef.current.get(it.id), ahora, p)) return;
          ultimoProgresoRef.current.set(it.id, ahora);
          parchar(it.id, { progreso: p });
        },
        {
          // A retry of the analysis reuses the object already in S3 (no orphans).
          imagenKey: actual.imagenKey ?? undefined,
          onClave: (imagenKey) => parchar(it.id, { imagenKey }),
          signal: abortRef.current?.signal,
        },
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err ?? ''));
      e.fase = fase;
      // "Detener" aborted the S3 transfer before the analysis: nothing was stored.
      if (esAbortoPorDetener(e, { detenerPedido: paradaRef.current, fase })) throw errorDetenido();
      // The server rejected the stored key (expired/consumed): the next attempt uploads again.
      if (e.status === 400) parchar(it.id, { imagenKey: null });
      throw e;
    }
  }, [patch]);

  // Runs the given rows with bounded concurrency. The global refresh is
  // throttled: at most every ~10 s while running, plus once at the end.
  const correr = useCallback(async (ids) => {
    if (runningRef.current || !sesionRef.current) return;
    const filas = ids.map((id) => itemsRef.current.find((x) => x.id === id)).filter(Boolean);
    if (filas.length === 0) return;
    runningRef.current = true;
    paradaRef.current = false;
    setDeteniendo(false);
    setRunning(true);
    setAvisoCerrado(false);
    const gen = genRef.current;
    const cancelado = () => genRef.current !== gen;
    abortRef.current = new AbortController();
    filas.forEach((f) => patch(f.id, { estado: 'cola', error: null, incierto: false, reintentando: false }));
    let pendienteInvalidar = false;
    try {
      await ejecutarColaConcurrencia({
        items: filas,
        tarea,
        cancelado,
        detenerPedido: () => paradaRef.current,
        onItemUpdate: (id, cambios) => {
          patch(id, cambios);
          if (cambios.estado === 'listo' || cambios.estado === 'error') anunciar(id, cambios.estado === 'listo');
          if (cambios.estado === 'listo') {
            const ahora = Date.now();
            if (debeInvalidar(ahora, ultimoInvalidarRef.current)) {
              ultimoInvalidarRef.current = ahora;
              pendienteInvalidar = false;
              invalidate();
            } else {
              pendienteInvalidar = true;
            }
          }
        },
      });
    } finally {
      // After a logout the state was already reset (and may belong to a new run).
      if (!cancelado()) {
        // Rows never dispatched because of the stop are 'detenida', not waiting.
        if (paradaRef.current) {
          const idsFilas = new Set(filas.map((f) => f.id));
          setItems((prev) => prev.map((it) => (idsFilas.has(it.id) && it.estado === 'cola'
            ? { ...it, estado: 'detenida', reintentando: false } : it)));
        }
        paradaRef.current = false;
        runningRef.current = false;
        setDeteniendo(false);
        setRunning(false);
        ultimoProgresoRef.current.clear();
      }
      if (pendienteInvalidar && !cancelado()) {
        ultimoInvalidarRef.current = Date.now();
        invalidate();
      }
    }
  }, [patch, tarea, anunciar, invalidate]);

  // Starts the batch with its fixed shared fields.
  const iniciar = useCallback((nuevaSesion) => {
    if (runningRef.current || sesionRef.current) return undefined;
    sesionRef.current = nuevaSesion;
    setSesion(nuevaSesion);
    return correr(itemsRef.current.filter((x) => x.estado === 'cola').map((x) => x.id));
  }, [correr]);

  // Manual retry of one row (also allowed for unconfirmed rows, after the user checked the gallery).
  const reintentar = useCallback((id) => correr([id]), [correr]);

  // "Resume the N missing": queued rows and failures that certainly stored nothing.
  const reanudar = useCallback(
    () => correr(itemsRef.current.filter(esReanudable).map((x) => x.id)),
    [correr],
  );

  // "Detener": no new photo starts; S3 transfers in flight are aborted (nothing is stored
  // yet); photos already in the analysis step finish normally. The run ends by itself and
  // leaves the unprocessed rows as 'detenida', resumable with `reanudar` (same lote session).
  const detener = useCallback(() => {
    if (!runningRef.current || paradaRef.current) return;
    paradaRef.current = true;
    setDeteniendo(true);
    abortRef.current?.abort();
  }, []);

  const cerrarAviso = useCallback(() => setAvisoCerrado(true), []);

  const progreso = useMemo(() => calcularProgresoSubida(items, { running }), [items, running]);
  const iniciado = sesion != null;
  const terminado = iniciado && !running;

  return {
    items, running, deteniendo, sesion, anuncio, avisoCerrado, progreso, iniciado, terminado,
    listos: progreso.completadas,
    errores: progreso.fallidas,
    agregar, quitar, quitarVarias, limpiar, iniciar, reintentar, reanudar, detener, cerrarAviso,
  };
}

const UploadManagerContext = createContext(null);

export function UploadManagerProvider({ children }) {
  const valor = useGestorSubida();
  return <UploadManagerContext.Provider value={valor}>{children}</UploadManagerContext.Provider>;
}

export function useUploadManager() {
  const ctx = useContext(UploadManagerContext);
  if (!ctx) throw new Error('useUploadManager must be used inside <UploadManagerProvider>.');
  return ctx;
}
