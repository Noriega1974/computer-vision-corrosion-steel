import { useState, useCallback, useEffect } from 'react';
import { apiPost, apiSubirS3 } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

// Max photo size: also enforced by the S3 presigned policy and the backend;
// checking it here only avoids uploading 50+ MB to receive a rejection.
export const MAX_FOTO_MB = 50;

// Shared upload path for the single and batch flows:
// upload-url -> S3 (with progress) -> POST /medicion. `inicio` is the
// performance.now() taken when the user started this photo, so the stored
// `tiempo_subida_s` covers everything before the analysis request.
// `onFase('subiendo' | 'analizando')` and `onProgreso(0-100)` are optional.
export async function subirUnaMedicion(file, body, inicio = performance.now(), onFase, onProgreso) {
  onFase?.('subiendo');
  onProgreso?.(0);
  const post = await apiPost('/medicion/upload-url', { content_type: file.type || 'image/jpeg' });
  await apiSubirS3(post, file, (f) => onProgreso?.(Math.round(f * 100)));
  onProgreso?.(100);
  const finSubida = performance.now();

  onFase?.('analizando');
  return apiPost('/medicion', {
    ...body,
    imagen_key: post.imagen_key,
    tiempo_subida_s: Number(((finSubida - inicio) / 1000).toFixed(2)),
  });
}

export function useUploadMedicion() {
  const { invalidate } = useRefreshKey();
  const [loading, setLoading] = useState(false);
  const [fase, setFase] = useState(null);     // 'subiendo' | 'analizando' | null
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [progreso, setProgreso] = useState(0);  // upload progress, 0-100

  // Ask the browser to confirm before closing/reloading while a request is in
  // flight. The handler lives only while `loading` is true; the effect cleanup
  // removes it on completion, error and unmount.
  useEffect(() => {
    if (!loading) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [loading]);

  // `inicio` = performance.now() tomado en el clic de "Analizar imagen".
  // La foto va directo a S3 (POST prefirmado) y el body de /medicion solo
  // lleva su clave: así no hay tope de ~4.5 MB por el límite de 6 MB de Lambda.
  const upload = useCallback(async (file, body, inicio = performance.now()) => {
    setLoading(true);
    setError(null);
    try {
      const res = await subirUnaMedicion(file, body, inicio, setFase, setProgreso);
      setResult(res);
      // Invalidar cache global para que todos los hooks refresquen
      invalidate();
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
      setFase(null);
    }
  }, [invalidate]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { upload, loading, fase, progreso, error, result, reset };
}
