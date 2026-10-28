import { apiPost, apiPut, apiDelete, apiSubirS3 } from './apiClient';

// Logo de empresa y foto de portada de un punto: solo imágenes, máx. 5 MB
// (el mismo tope que valida el backend en la política del POST prefirmado).
export const IMAGEN_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGEN_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

// Devuelve el mensaje de error (en español) o null si el archivo es válido.
export function validarImagen(file) {
  if (!IMAGEN_TIPOS.includes(file.type)) {
    return 'Usa una imagen JPEG, PNG o WebP.';
  }
  if (file.size > IMAGEN_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1).replace('.', ',');
    return `La imagen pesa ${mb} MB y el máximo es 5 MB. Elige una más liviana.`;
  }
  return null;
}

// Aplica el cambio pedido en un formulario sobre `basePath`
// (`/empresas/{id}/logo` o `/bloques/{id}/portada`):
//   archivo -> POST {basePath}/upload-url, subida directa a S3 y PUT con la clave
//   quitar  -> DELETE {basePath}
// `campoClave` es el nombre de la clave que devuelve el backend (logo_key / portada_key).
export async function aplicarCambioImagen(basePath, campoClave, { archivo, quitar }) {
  if (archivo) {
    const post = await apiPost(`${basePath}/upload-url`, { content_type: archivo.type });
    await apiSubirS3(post, archivo);
    await apiPut(basePath, { [campoClave]: post[campoClave] });
  } else if (quitar) {
    await apiDelete(basePath);
  }
}
