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

  const res = await fetch(`${BASE_URL}${path}`, options);

  // 401 → emitir evento global para que AuthContext fuerce el logout
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('Sesión expirada. Por favor vuelve a iniciar sesión.');
  }

  if (!res.ok) {
    let message = `Error ${res.status}: ${res.statusText}`;
    try {
      const errBody = await res.json();
      // El backend devuelve {"error": "..."} en todos los endpoints; se
      // deja el chequeo de "message" como respaldo por si algún handler
      // difiere.
      if (errBody.error) message = errBody.error;
      else if (errBody.message) message = errBody.message;
    } catch { /* sin cuerpo JSON */ }
    throw new Error(message);
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
// POST/PUT/DELETE (esas son mutaciones y jamás deben deduplicarse).
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
export const apiDelete = (path) => request('DELETE', path);
