// "atlantico" debe encontrar "Atlántico" sin que el usuario tenga que
// escribir la tilde -- se compara sin mayúsculas ni diacríticos de los dos
// lados. NFD separa cada letra acentuada en base + marca combinante
// (á -> a + ´), y el regex saca esas marcas (rango Unicode de acentos).
export function normalizar(s) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

// Porcentaje con coma decimal sin espacio antes del signo: 1.5 -> "1,5%".
export function formatoPct(n) {
  return `${Number(n ?? 0).toFixed(1).replace('.', ',')}%`;
}

// Sobre qué se calculó el % de corrosión de una medición. Las mediciones
// anteriores al separador de placa no traen `area_base` y se calcularon sobre
// la foto completa.
export function baseArea(m) {
  return m?.area_base === 'placa' ? 'placa' : 'foto';
}

export function etiquetaBase(m) {
  return baseArea(m) === 'placa' ? 'sobre la placa' : 'sobre la foto';
}
