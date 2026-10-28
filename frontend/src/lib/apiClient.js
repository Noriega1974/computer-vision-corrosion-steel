import { fetchAuthSession } from 'aws-amplify/auth';

const BASE_URL = import.meta.env.VITE_API_URL || '';

// Convierte recursivamente strings numéricos puros a Number.
// Necesario porque DynamoDB serializa Decimal como string ("0.0", "3", etc.).
// La regex es estricta: solo matchea números limpios, nunca fechas ISO ni UUIDs.
function parseNumericStrings(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(parseNumericStrings);
  if (typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = parseNumericStrings(v);
    }
    return result;
  }
  if (typeof obj === 'string' && /^-?\d+(\.\d+)?$/.test(obj)) {
    return Number(obj);
  }
  return obj;
}

// Obtiene el idToken actual de Cognito para inyectarlo en cada request
async function getIdToken() {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString();
}

// fetch lanza TypeError ("Failed to fetch") cuando no hay respuesta legible:
// sin red, servidor caído o CORS bloqueado. Se traduce a un mensaje que el
// usuario pueda entender; los errores HTTP siguen su camino normal.
async function fetchConRedLegible(url, options) {
  try {
    return await fetch(url, options);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error('No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.');
    }
    throw e;
  }
}

// Mensaje para el usuario cuando el backend no envía `error`/`message`.
function mensajeAmigable(status) {
  if (status === 403) return 'No tienes permiso para hacer esto. Si crees que es un error, contacta a un administrador.';
  if (status === 404) return 'No encontramos lo que buscas. Puede que se haya eliminado.';
  if (status === 413) return 'La foto es demasiado grande. Prueba con una de menor tamaño.';
  if (status === 429) return 'Hay demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.';
  if (status >= 500 && status <= 503) return 'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.';
  if (status === 504) return 'El servidor tardó demasiado en responder. Inténtalo de nuevo.';
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

// En el backend "bloque" siempre significa Punto en la interfaz. Solo se
// reemplaza la palabra completa, conservando mayúsculas.
function bloqueAPunto(texto) {
  return texto.replace(/\bbloque(s?)(?![\p{L}\d_])/giu, (m, plural) => {
    const base = m.slice(0, 6);
    const punto = base === base.toUpperCase() ? 'PUNTO' : base[0] === base[0].toUpperCase() ? 'Punto' : 'punto';
    return plural ? (punto === 'PUNTO' ? 'PUNTOS' : punto + 's') : punto;
  });
}

async function request(method, path, body) {
  const token = await getIdToken();

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const res = await fetchConRedLegible(`${BASE_URL}${path}`, options);

  // 401 → emitir evento global para que AuthContext fuerce el logout
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    const err = new Error('Sesión expirada. Por favor vuelve a iniciar sesión.');
    err.status = 401;
    throw err;
  }

  if (!res.ok) {
    // Friendly fallback by status, used only when the backend sends no message.
    let message = mensajeAmigable(res.status);
    try {
      const errBody = await res.json();
      // El backend devuelve {"error": "..."} en todos los endpoints; se
      // deja el chequeo de "message" como respaldo por si algún handler
      // difiere.
      if (errBody.error) message = bloqueAPunto(String(errBody.error));
      else if (errBody.message) message = bloqueAPunto(String(errBody.message));
    } catch { /* sin cuerpo JSON */ }
    // `status` viaja en el error para que quien llama pueda distinguir un
    // 403 (sin permiso / sin registro) de un 500 o un fallo de red, sin
    // tener que parsear el texto del mensaje.
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  // 204 No Content no tiene cuerpo
  if (res.status === 204) return null;

  return res.json().then(parseNumericStrings);
}

// Dedup de GETs concurrentes: si dos o más llamadas piden la misma URL casi
// al mismo tiempo (p. ej. varios componentes del dashboard montando juntos
// y pegándole cada uno a /mediciones/recientes), la segunda y siguientes
// reciben la MISMA promesa en vez de disparar un fetch nuevo. Sin TTL ni
// cache persistente: la entrada se borra apenas la promesa resuelve (éxito
// o error), así que solo colapsa llamadas simultáneas idénticas -- nunca
// sirve datos viejos a una llamada posterior. Nunca se aplica a
// POST/PUT/PATCH/DELETE (esas son mutaciones y jamás deben deduplicarse).
const getsEnVuelo = new Map();

export const apiGet = (path) => {
  if (getsEnVuelo.has(path)) {
    return getsEnVuelo.get(path);
  }
  const promesa = request('GET', path).finally(() => {
    getsEnVuelo.delete(path);
  });
  getsEnVuelo.set(path, promesa);
  return promesa;
};
export const apiPost = (path, body) => request('POST', path, body);
export const apiPut = (path, body) => request('PUT', path, body);
export const apiPatch = (path, body) => request('PATCH', path, body);
export const apiDelete = (path) => request('DELETE', path);

// Sube un archivo a S3 con un POST prefirmado ({url, fields} de
// POST /medicion/upload-url). S3 exige los campos primero y el archivo AL
// FINAL; no se fija Content-Type a mano (el navegador arma el multipart).
// `onProgress(fraction)` es opcional (0..1). fetch no expone el progreso de
// subida, así que con callback se usa XMLHttpRequest; sin él, el camino
// original con fetch queda intacto.
export async function apiSubirS3({ url, fields }, file, onProgress) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  form.append('file', file);

  const errorHttp = (status) => {
    const err = new Error(`No se pudo subir la foto (error ${status}). Inténtalo de nuevo.`);
    err.status = status;
    return err;
  };

  if (typeof onProgress !== 'function') {
    const res = await fetchConRedLegible(url, { method: 'POST', body: form });
    if (!res.ok) throw errorHttp(res.status);
    return;
  }

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      // Same success criterion as fetch's `res.ok` (2xx).
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(errorHttp(xhr.status));
    };
    // Same message fetch produces for unreadable responses (network, CORS).
    xhr.onerror = () => reject(new Error('No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.'));
    xhr.send(form);
  });
}
