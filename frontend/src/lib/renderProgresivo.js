// Progressive rendering of long card grids: show the first PASO items and grow
// the window as the user scrolls, so 1000 cards are never mounted at once.

export const PASO_RENDER = 60;

// Next window size: grows by `paso` but never beyond `total`.
export function siguienteLimite(actual, total, paso = PASO_RENDER) {
  return Math.min(Math.max(0, total), Math.max(0, actual) + paso);
}

// The visible slice; the full list when it already fits.
export function recortarVisibles(lista, limite) {
  return lista.length <= limite ? lista : lista.slice(0, limite);
}
