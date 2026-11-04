// Formato de fecha elegido en Configuración > Preferencias del sistema.
// Se guarda en localStorage porque cada página que muestra fechas se monta
// por su cuenta (rutas separadas) y solo necesita leer el valor vigente al
// renderizar -- no hace falta sincronización en vivo como con el modo oscuro.

const STORAGE_KEY = 'corria-date-format';
const DEFAULT_FORMAT = 'DD/MM/AAAA';

export function getDateFormat() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_FORMAT;
}

export function setDateFormat(formato) {
  localStorage.setItem(STORAGE_KEY, formato);
}

// Hora corta HH:mm de un timestamp ('' si no hay fecha válida). Usa formatFecha,
// que ya resuelve la zona y el formato, y valida el resultado: cortar los
// últimos 5 caracteres a ciegas devolvería basura ("fecha") con "Sin fecha".
export function horaCorta(timestamp) {
  const t = formatFecha(timestamp, { conHora: true });
  return /\d{2}:\d{2}$/.test(t) ? t.slice(-5) : '';
}

// Formatea un timestamp según la preferencia guardada.
// `conHora`: agrega HH:mm. `conSegundos`: agrega también los segundos.
export function formatFecha(timestamp, { conHora = false, conSegundos = false } = {}) {
  if (!timestamp) return 'Sin fecha';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();

  let fecha;
  switch (getDateFormat()) {
    case 'MM/DD/AAAA':
      fecha = `${mm}/${dd}/${yyyy}`;
      break;
    case 'AAAA-MM-DD':
      fecha = `${yyyy}-${mm}-${dd}`;
      break;
    default: // DD/MM/AAAA
      fecha = `${dd}/${mm}/${yyyy}`;
  }

  if (!conHora) return fecha;
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  let hora = `${hh}:${min}`;
  if (conSegundos) hora += `:${String(d.getSeconds()).padStart(2, '0')}`;
  return `${fecha} ${hora}`;
}
