// Comparación "antes → ahora" del botón temporal "Reintentar análisis".
// `analisis_anterior` lo guarda el backend la primera vez que se reanaliza una
// medición (el análisis ORIGINAL; reintentar de nuevo no lo reemplaza).
import { nivelLabel } from './statusUtils.js';
import { baseArea, etiquetaBase, formatoPct } from './textUtils.js';

function describir(pct, nivel, base, modelo) {
  const partes = [];
  if (nivel != null) partes.push(nivelLabel(nivel));
  partes.push(etiquetaBase({ area_base: base }));
  if (modelo) partes.push(`modelo ${modelo}`);
  return `${formatoPct(pct)} (${partes.join(', ')})`;
}

// { anterior, actual } listos para mostrar, o null si la medición nunca se
// reanalizó. El modelo solo se muestra del análisis anterior (el actual ya se
// ve en el resto de la ficha).
export function comparacionAnalisis(medicion) {
  const prev = medicion?.analisis_anterior;
  if (!prev || prev.area_corroida_pct == null) return null;
  return {
    anterior: describir(prev.area_corroida_pct, prev.nivel_corrosion, prev.area_base, prev.modelo),
    actual: describir(medicion.area_corroida_pct, medicion.nivel_corrosion, baseArea(medicion)),
  };
}
