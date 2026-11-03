// Convierte recursivamente strings numéricos puros a Number.
// Necesario porque DynamoDB serializa Decimal como string ("0.0", "3", etc.).
// La regex es estricta: solo matchea números limpios, nunca fechas ISO ni UUIDs.
// Los campos de texto libre (nombres, notas) se conservan como string: un lote
// llamado "2026" no debe convertirse en el número 2026.
const CAMPOS_TEXTO = new Set(['nombre', 'notas', 'lote_nombre']);

export const esCampoTexto = (clave) =>
  typeof clave === 'string' && (CAMPOS_TEXTO.has(clave) || clave.endsWith('_nombre'));

export function parseNumericStrings(obj, clave = null) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((v) => parseNumericStrings(v, clave));
  if (typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = parseNumericStrings(v, k);
    }
    return result;
  }
  if (typeof obj === 'string' && !esCampoTexto(clave) && /^-?\d+(\.\d+)?$/.test(obj)) {
    return Number(obj);
  }
  return obj;
}
