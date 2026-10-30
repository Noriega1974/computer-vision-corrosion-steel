// Matemática del zoom/desplazamiento de la foto de la medición.
// `vista` = { z, x, y }: la capa de contenido (foto + máscaras) se dibuja con
// `translate(x, y) scale(z)` y origen en su esquina superior izquierda, dentro
// de un marco de ancho W x alto H. Con z = 1, x = y = 0 se ve la foto entera.

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
export const VISTA_INICIAL = { z: 1, x: 0, y: 0 };

const acotar = (v, min, max) => Math.min(max, Math.max(min, v));

// Limita el zoom a [ZOOM_MIN, ZOOM_MAX] y el desplazamiento para que la capa
// siempre cubra el marco (la foto nunca se sale de él).
export function limitarVista({ z, x, y }, W, H) {
  const zz = acotar(Number.isFinite(z) ? z : 1, ZOOM_MIN, ZOOM_MAX);
  return {
    z: zz,
    x: acotar(Number.isFinite(x) ? x : 0, W - W * zz, 0),
    y: acotar(Number.isFinite(y) ? y : 0, H - H * zz, 0),
  };
}

// Cambia el zoom por `factor` dejando fijo el punto (cx, cy) del marco: el
// pixel de la foto que está bajo el cursor sigue bajo el cursor.
export function zoomEnPunto(vista, factor, cx, cy, W, H) {
  const z = acotar(vista.z * factor, ZOOM_MIN, ZOOM_MAX);
  const k = z / vista.z;
  return limitarVista({ z, x: cx - (cx - vista.x) * k, y: cy - (cy - vista.y) * k }, W, H);
}

export function desplazar(vista, dx, dy, W, H) {
  return limitarVista({ ...vista, x: vista.x + dx, y: vista.y + dy }, W, H);
}

// Factor de zoom de un giro de rueda (Ctrl + rueda o pellizco del trackpad).
export function factorRueda(deltaY, deltaMode = 0) {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-acotar(px, -120, 120) * 0.0022);
}
