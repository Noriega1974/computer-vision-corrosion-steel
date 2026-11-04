// Pure logic of the background batch upload: limits, failure classification,
// progress summary and a bounded-concurrency worker pool. No React, no fetch:
// the caller injects the per-item task, so everything here runs under node:test.

// Single source of truth for the batch size cap.
export const LOTE_MAX = 1000;

// Two photos in flight at most: the AWS account allows only 10 concurrent
// Lambdas in total, shared with the rest of the app.
export const CONCURRENCIA_LOTE = 2;

// Automatic retries per photo, only for failures that are certainly safe to repeat.
export const MAX_REINTENTOS = 3;
export const DEMORA_BASE_MS = 1500;

// Phase where an error happened. Everything before POST /medicion (upload-url
// and the S3 presigned POST) is safe to repeat. POST /medicion runs the
// analysis and stores a new measurement on every call.
export const FASE_PREVIA = 'previa';
export const FASE_MEDICION = 'medicion';

export const MENSAJE_NO_CONFIRMADO = 'No se confirmó el análisis; revisa la galería antes de reintentar.';

const RE_RED = /conectar|failed to fetch|networkerror|network|load failed|timeout|timed out/i;
const RE_LIMITE = /throttl|too many|rate exceeded|slow ?down|demasiadas solicitudes/i;

// Classifies an upload failure:
// - 'reintentar': safe to repeat automatically. Before POST /medicion every step is idempotent.
//                 POST /medicion is idempotent on the server for a given `imagen_key` (a marker
//                 item returns the original measurement), so a lost response (network, 502/503/504)
//                 or a 409 "still analyzing" can be repeated as long as the SAME key is reused.
// - 'incierto':   POST /medicion failed with a plain 500 / other 5xx: the outcome is unknown and
//                 the user should check the gallery before a manual retry.
// - 'detener':    the session expired; stop dispatching the rest of the batch.
// - 'definitivo': a client error (400, 403, 413...) that a retry would not fix.
export function clasificarFallo(err) {
  const status = Number(err?.status) || 0;
  const mensaje = String(err?.message || '');
  if (status === 401) return 'detener';
  const limitado = status === 429 || (status === 503 && RE_LIMITE.test(mensaje));
  const red = !status && RE_RED.test(mensaje);

  if (err?.fase === FASE_MEDICION) {
    if (limitado || status === 409 || red || [502, 503, 504].includes(status)) return 'reintentar';
    // Any other server error or unreadable response leaves the outcome unknown.
    if (status >= 500 || !status) return 'incierto';
    return 'definitivo';
  }
  if (limitado || red || status === 408 || status >= 500) return 'reintentar';
  return 'definitivo';
}

const ESTADOS_PENDIENTES = new Set(['cola', 'subiendo', 'analizando']);

// Items the "resume" action may run again: never uploaded, or failed with a
// failure that certainly did not store anything. Unconfirmed items are left
// for a manual, per-photo retry after checking the gallery.
export function esReanudable(it) {
  return it.estado === 'cola' || it.estado === 'detenida' || (it.estado === 'error' && !it.incierto);
}

// Error thrown by a task that gave up because the user pressed "Detener": the pool
// marks the row 'detenida' (not an error) and never retries it.
export function errorDetenido() {
  const e = new Error('Subida detenida.');
  e.detenida = true;
  return e;
}

// True when `err` is the abort of an S3 transfer caused by the stop request, and
// it happened before the analysis started (nothing was stored, safe to resume).
export function esAbortoPorDetener(err, { detenerPedido, fase }) {
  return Boolean(detenerPedido) && fase === FASE_PREVIA
    && (err?.detenida === true || err?.name === 'AbortError' || /cancelad/i.test(String(err?.message || '')));
}

// Summary for the progress bar and the batch queue.
export function calcularProgresoSubida(items, { running = false } = {}) {
  const lista = items ?? [];
  const total = lista.length;
  let completadas = 0;
  let fallidas = 0;
  let inciertas = 0;
  let pendientes = 0;
  let detenidas = 0;
  let reanudables = 0;
  for (const it of lista) {
    if (it.estado === 'listo') completadas += 1;
    else if (it.estado === 'error') {
      fallidas += 1;
      if (it.incierto) inciertas += 1;
    } else if (it.estado === 'detenida') detenidas += 1;
    else if (ESTADOS_PENDIENTES.has(it.estado)) pendientes += 1;
    if (esReanudable(it)) reanudables += 1;
  }
  // Floor, so 999 of 1000 never reads as 100 %.
  const porcentaje = total ? Math.floor((completadas / total) * 100) : 0;
  let estadoGlobal = 'vacio';
  if (total > 0) {
    if (running) estadoGlobal = 'en_curso';
    else if (detenidas > 0) estadoGlobal = 'detenida';
    else if (fallidas > 0 || pendientes > 0) estadoGlobal = 'con_errores';
    else estadoGlobal = 'completado';
  }
  return { total, completadas, fallidas, inciertas, pendientes, detenidas, reanudables, porcentaje, estadoGlobal };
}

const SONDEO_DETENER_MS = 50;
const esperarPorDefecto = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs `tarea(item)` over `items` with at most `concurrencia` in flight.
// One failure never stops the batch, except a 'detener' failure (expired
// session), which stops dispatching new items and leaves them in 'cola'.
// `onItemUpdate(id, cambios)` receives row patches ('listo' / 'error' / retry flag).
// `cancelado()` is polled between steps: once true no new item starts, no retry
// is scheduled and no further patch is emitted (logout aborts the pool this way).
// `detenerPedido()` is the user-requested stop ("Detener"): no new item starts, and
// an item that had not reached the analysis yet is marked 'detenida' instead of
// retried. Items already analyzing finish normally, so no half-stored state remains.
// The rows never dispatched stay in 'cola'; the caller marks them 'detenida'.
export async function ejecutarColaConcurrencia({
  items,
  tarea,
  concurrencia = CONCURRENCIA_LOTE,
  maxReintentos = MAX_REINTENTOS,
  demoraBaseMs = DEMORA_BASE_MS,
  esperar = esperarPorDefecto,
  onItemUpdate,
  cancelado = () => false,
  detenerPedido = () => false,
}) {
  const cola = Array.from(items ?? []);
  const total = cola.length;
  const resultados = new Array(total);
  let siguiente = 0;
  let completadas = 0;
  let fallidas = 0;
  let detenidas = 0;
  let detenido = false;

  function marcarDetenida(item, idx, intento) {
    detenidas += 1;
    resultados[idx] = { id: item.id, ok: false, detenida: true, intentos: intento };
    onItemUpdate?.(item.id, {
      estado: 'detenida', error: null, incierto: false, reintentando: false, progreso: 0, intentos: intento,
    });
  }

  async function procesarUno(item, idx) {
    for (let intento = 1; ; intento += 1) {
      if (cancelado()) return;
      try {
        const resultado = await tarea(item, { intento });
        if (cancelado()) return;
        completadas += 1;
        resultados[idx] = { id: item.id, ok: true, resultado, intentos: intento };
        onItemUpdate?.(item.id, {
          estado: 'listo', resultado, error: null, incierto: false, reintentando: false, intentos: intento,
        });
        return;
      } catch (err) {
        if (cancelado()) return;
        if (err?.detenida === true) { marcarDetenida(item, idx, intento); return; }
        const tipo = clasificarFallo(err);
        if (tipo === 'reintentar' && intento <= maxReintentos) {
          // Stop requested and the analysis never started: do not retry, resume later.
          if (detenerPedido() && err?.fase !== FASE_MEDICION) { marcarDetenida(item, idx, intento); return; }
          onItemUpdate?.(item.id, { reintentando: true, intentos: intento });
          const ms = demoraBaseMs * 2 ** (intento - 1);
          if (ms > 0) await esperarSalvoDetener(ms);
          if (cancelado()) return;
          if (detenerPedido() && err?.fase !== FASE_MEDICION) { marcarDetenida(item, idx, intento); return; }
          continue;
        }
        if (tipo === 'detener') detenido = true;
        // Retries of POST /medicion ran out: the analysis may have finished server-side
        // (only a 429 proves it did not run), so ask the user to check the gallery.
        const incierto = tipo === 'incierto'
          || (tipo === 'reintentar' && err?.fase === FASE_MEDICION && Number(err?.status) !== 429);
        const error = incierto ? MENSAJE_NO_CONFIRMADO : (err?.message || 'No se pudo analizar la foto.');
        fallidas += 1;
        resultados[idx] = { id: item.id, ok: false, error, incierto, tipo, intentos: intento };
        onItemUpdate?.(item.id, {
          estado: 'error', error, incierto, reintentando: false, intentos: intento,
        });
        return;
      }
    }
  }

  // Backoff wait that ends early when the user asks to stop, so "Deteniendo…" resolves
  // at once instead of after the longest retry delay.
  function esperarSalvoDetener(ms) {
    if (detenerPedido()) return Promise.resolve();
    return new Promise((resolver) => {
      const sondeo = setInterval(() => { if (detenerPedido()) fin(); }, SONDEO_DETENER_MS);
      function fin() { clearInterval(sondeo); resolver(); }
      esperar(ms).then(fin, fin);
    });
  }

  async function trabajador() {
    while (!detenido && !cancelado() && !detenerPedido() && siguiente < total) {
      const idx = siguiente;
      siguiente += 1;
      await procesarUno(cola[idx], idx);
    }
  }

  const n = Math.max(1, Math.min(concurrencia, total));
  await Promise.all(Array.from({ length: total ? n : 0 }, trabajador));
  return { total, completadas, fallidas, detenidas, detenido, detenidoPorUsuario: detenerPedido(), resultados };
}

// Paging helpers for the batch queue (only visible rows get a preview URL).
export const FILAS_POR_PAGINA = 25;

export function paginar(lista, pagina, porPagina = FILAS_POR_PAGINA) {
  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const actual = Math.min(Math.max(0, pagina), paginas - 1);
  const desde = actual * porPagina;
  return { filas: lista.slice(desde, desde + porPagina), pagina: actual, paginas, desde };
}

// Multi-select helpers for the pre-upload queue. Selections are Sets of row ids and
// every helper returns a new Set, so React state is never mutated.
export function alternarSeleccion(seleccion, id) {
  const nueva = new Set(seleccion);
  if (nueva.has(id)) nueva.delete(id); else nueva.add(id);
  return nueva;
}

// Adds every id to the selection (e.g. "Seleccionar todas" on the current page).
export function seleccionarIds(seleccion, ids) {
  const nueva = new Set(seleccion);
  ids.forEach((id) => nueva.add(id));
  return nueva;
}

// Drops ids that no longer exist in the queue (rows removed or cleared).
export function podarSeleccion(seleccion, items) {
  const vivos = new Set(items.map((it) => it.id));
  return new Set([...seleccion].filter((id) => vivos.has(id)));
}

// Rows left after removing the selected ones; same array when nothing is selected.
export function quitarSeleccionadas(items, seleccion) {
  if (!seleccion || seleccion.size === 0) return items;
  return items.filter((it) => !seleccion.has(it.id));
}

// File helpers shared by the single and batch flows.
export const NOMBRE_MAX = 80;
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/jpg'];

// Default photo name: file name without extension.
export const nombreDesdeArchivo = (file) => (file?.name || '').replace(/\.[^.]+$/, '').slice(0, NOMBRE_MAX);

// A queue entry is a File or { file, nombre }: the second form carries the name the
// user already typed (switching between single and batch mode must not lose it).
export function normalizarEntrada(entrada) {
  const file = entrada?.file ?? entrada;
  const escrito = typeof entrada?.nombre === 'string' ? entrada.nombre : null;
  return { file, nombre: escrito === null ? nombreDesdeArchivo(file) : escrito.slice(0, NOMBRE_MAX) };
}

// Batch id: "LOT-" + UUID (40 chars, within the server's 64-char/[A-Za-z0-9_-] rule).
// Two users batching into the same point at the same millisecond must not share a folder.
export const generarLoteId = () => {
  const aleatorio = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `LOT-${aleatorio}`;
};

// Splits a FileList/array into valid files and rejected names (wrong type).
export function clasificarArchivos(files) {
  const validos = [];
  const rechazados = [];
  Array.from(files ?? []).forEach((f) => (TIPOS_OK.includes(f.type) ? validos : rechazados).push(f));
  return { validos, rechazados: rechazados.map((f) => f.name) };
}

// Suggested batch name for a 'YYYY-MM-DD' date: "Lote DD/MM/AAAA".
export function sugerirNombreLote(fechaISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaISO || '');
  return m ? `Lote ${m[3]}/${m[2]}/${m[1]}` : 'Lote';
}

// Progress ticks fire many times per second per upload; publishing each one
// re-renders the whole queue. True when a tick for this row should be published:
// first tick, last tick (100), or at least `intervalo` ms since the last one.
export const INTERVALO_PROGRESO_MS = 200;

export function debeActualizarProgreso(ultimoMs, ahoraMs, progreso, intervalo = INTERVALO_PROGRESO_MS) {
  if (ultimoMs == null || progreso <= 0 || progreso >= 100) return true;
  return ahoraMs - ultimoMs >= intervalo;
}

// Throttle for the global data refresh: true when enough time has passed.
export const INTERVALO_INVALIDAR_MS = 10000;

export function debeInvalidar(ahora, ultimo, intervalo = INTERVALO_INVALIDAR_MS) {
  return ultimo == null || ahora - ultimo >= intervalo;
}
