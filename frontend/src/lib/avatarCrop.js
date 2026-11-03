// Matemática del recortador de foto de perfil (AvatarCropper).
//
// El visor tiene tamaño CONTENEDOR (256 px) y en el centro hay un marco guía
// cuadrado con esquinas redondeadas de tamaño MARCO_RECORTE (224 px) y radio
// RADIO_RECORTE (56 px = 25 %). Esa misma proporción (RATIO_RADIO_AVATAR) se usa
// en todos los sitios donde se dibuja el avatar: Configuración (56 px -> 14),
// barra lateral (35 px -> 9), visor ampliado ('25%') y la guía del recortador.
//
// Tanto `calcularEscalaBase` como `limitarOffsetRecorte` y `parametrosExportacion`
// operan respecto a MARCO_RECORTE para que lo encuadrado dentro de la guía sea
// 100 % idéntico a la imagen exportada de 320x320 px.

export const CONTENEDOR_VISOR = 256;
export const MARCO_RECORTE = 224;

// Única fuente de verdad de la forma del avatar: radio = 25 % del lado.
export const RATIO_RADIO_AVATAR = 0.25;
export const RADIO_AVATAR_PORCENTAJE = `${RATIO_RADIO_AVATAR * 100}%`;
// Radio en px para un avatar de lado fijo (56 -> 14, 35 -> 9).
export const radioAvatarPx = (lado) => Math.round(lado * RATIO_RADIO_AVATAR);

export const RADIO_RECORTE = MARCO_RECORTE * RATIO_RADIO_AVATAR; // 56 px
export const SALIDA_AVATAR = 320;
export const ZOOM_MIN_AVATAR = 1;
export const ZOOM_MAX_AVATAR = 4;

const acotar = (val, min, max) => {
  const res = Math.min(max, Math.max(min, val));
  return Object.is(res, -0) ? 0 : res;
};

// Escala base para que el lado más corto de la imagen cubra exactamente MARCO_RECORTE.
export function calcularEscalaBase(naturalWidth, naturalHeight, marco = MARCO_RECORTE) {
  if (!naturalWidth || !naturalHeight || naturalWidth <= 0 || naturalHeight <= 0) return 1;
  return Math.max(marco / naturalWidth, marco / naturalHeight);
}

// Acota el zoom al rango permitido [1, 4].
export function acotarZoomAvatar(z) {
  const num = Number.isFinite(z) ? z : ZOOM_MIN_AVATAR;
  return acotar(num, ZOOM_MIN_AVATAR, ZOOM_MAX_AVATAR);
}

// Limita el desplazamiento (offset respecto al centro del visor) para que la
// imagen nunca deje huecos vacíos dentro del marco de recorte.
export function limitarOffsetRecorte(offset, escala, naturalWidth, naturalHeight, marco = MARCO_RECORTE) {
  if (!naturalWidth || !naturalHeight) return { x: 0, y: 0 };
  const w = naturalWidth * escala;
  const h = naturalHeight * escala;
  const maxX = Math.max(0, (w - marco) / 2);
  const maxY = Math.max(0, (h - marco) / 2);
  return {
    x: acotar(Number.isFinite(offset?.x) ? offset.x : 0, -maxX, maxX),
    y: acotar(Number.isFinite(offset?.y) ? offset.y : 0, -maxY, maxY),
  };
}

// Aplica un factor de zoom manteniendo fijo el punto (cursorX, cursorY)
// medido desde el centro del visor.
export function zoomAvatarEnPunto(
  { zoom, offset },
  factor,
  cursorXDesdeCentro,
  cursorYDesdeCentro,
  baseScale,
  naturalWidth,
  naturalHeight,
  marco = MARCO_RECORTE,
) {
  const nuevoZoom = acotarZoomAvatar(zoom * factor);
  const k = nuevoZoom / zoom;
  const nuevoOffset = {
    x: cursorXDesdeCentro - (cursorXDesdeCentro - offset.x) * k,
    y: cursorYDesdeCentro - (cursorYDesdeCentro - offset.y) * k,
  };
  return {
    zoom: nuevoZoom,
    offset: limitarOffsetRecorte(nuevoOffset, baseScale * nuevoZoom, naturalWidth, naturalHeight, marco),
  };
}

// Calcula la escala de exportación para mapear exactamente el contenido dentro
// de MARCO_RECORTE al lienzo de SALIDA_AVATAR (320x320).
export function escalaExportacionRecorte(marco = MARCO_RECORTE, salida = SALIDA_AVATAR) {
  return salida / marco;
}
