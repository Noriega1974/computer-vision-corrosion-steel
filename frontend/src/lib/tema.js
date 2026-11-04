// Dark-mode preference shared by the login page, the app layout and Configuración.
// Only an explicit choice ('true' / 'false' in localStorage 'corria-darkmode') turns
// dark on; with nothing saved the theme is light (the OS preference is not followed and
// nothing is saved automatically). index.html applies the same rule before first paint.
export const CLAVE_MODO_OSCURO = 'corria-darkmode';

export function modoOscuroInicial(valorGuardado) {
  return valorGuardado === 'true';
}

// Reads the preference from the browser. Safe when storage is missing or blocked.
export function leerModoOscuro() {
  let guardado = null;
  try { guardado = localStorage.getItem(CLAVE_MODO_OSCURO); } catch { /* storage blocked */ }
  return modoOscuroInicial(guardado);
}
