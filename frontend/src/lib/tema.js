// Dark-mode preference shared by the login page, the app layout and Configuración.
// The saved choice ('true' / 'false' in localStorage 'corria-darkmode') wins; with no
// saved choice the system preference (prefers-color-scheme) decides.
export const CLAVE_MODO_OSCURO = 'corria-darkmode';

export function modoOscuroInicial(valorGuardado, prefiereOscuro = false) {
  if (valorGuardado === 'true') return true;
  if (valorGuardado === 'false') return false;
  return Boolean(prefiereOscuro);
}

// Reads the preference from the browser. Safe when storage or matchMedia are missing.
export function leerModoOscuro() {
  let guardado = null;
  try { guardado = localStorage.getItem(CLAVE_MODO_OSCURO); } catch { /* storage blocked */ }
  const prefiere = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return modoOscuroInicial(guardado, prefiere);
}
