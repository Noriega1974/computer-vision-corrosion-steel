// Small tile previews for the upload queue. Decoding a full-resolution photo per
// tile is what made a 100-photo queue lag, so we downscale once per File and keep
// only the tiny Blob (cached in a WeakMap, released with the File).

export const PREVIEW_MAX_LADO = 240;
export const PREVIEW_CONCURRENCIA = 2;

// Runs async tasks with at most `max` in flight, FIFO.
export function crearLimitador(max = PREVIEW_CONCURRENCIA) {
  let activos = 0;
  const cola = [];
  const siguiente = () => {
    if (activos >= max || cola.length === 0) return;
    const { tarea, resolve, reject } = cola.shift();
    activos += 1;
    Promise.resolve()
      .then(tarea)
      .then(resolve, reject)
      .finally(() => { activos -= 1; siguiente(); });
  };
  return (tarea) => new Promise((resolve, reject) => {
    cola.push({ tarea, resolve, reject });
    siguiente();
  });
}

// Target size keeping the aspect ratio; never upscales.
export function dimensionesPreview(ancho, alto, maxLado = PREVIEW_MAX_LADO) {
  if (!(ancho > 0) || !(alto > 0)) return { ancho: maxLado, alto: maxLado };
  const escala = Math.min(1, maxLado / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

const limitador = crearLimitador();
const cache = new WeakMap();  // File -> Promise<Blob | null>

async function generarBlob(file) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap;
  try {
    // Decode straight to a reduced size when the browser supports resize options.
    bitmap = await createImageBitmap(file, { resizeWidth: PREVIEW_MAX_LADO, resizeQuality: 'medium' });
  } catch {
    try { bitmap = await createImageBitmap(file); } catch { return null; }
  }
  try {
    const { ancho, alto } = dimensionesPreview(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7));
  } catch {
    return null;
  } finally {
    bitmap.close?.();
  }
}

// Resolves with a small Blob, or null when unsupported/failed (callers fall back
// to the original file's object URL).
export function obtenerBlobPreview(file) {
  let p = cache.get(file);
  if (!p) {
    p = limitador(() => generarBlob(file)).catch(() => null);
    cache.set(file, p);
  }
  return p;
}
