import { useState, useCallback } from 'react';
import { apiPost, apiSubirS3 } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

export function useUploadMedicion() {
  const { invalidate } = useRefreshKey();
  const [loading, setLoading] = useState(false);
  const [fase, setFase] = useState(null);     // 'subiendo' | 'analizando' | null
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // `inicio` = performance.now() tomado en el clic de "Analizar imagen".
  // La foto va directo a S3 (POST prefirmado) y el body de /medicion solo
  // lleva su clave: así no hay tope de ~4.5 MB por el límite de 6 MB de Lambda.
  const upload = useCallback(async (file, body, inicio = performance.now()) => {
    setLoading(true);
    setFase('subiendo');
    setError(null);
    try {
      const post = await apiPost('/medicion/upload-url', { content_type: file.type || 'image/jpeg' });
      await apiSubirS3(post, file);
      const finSubida = performance.now();

      setFase('analizando');
      // tiempo_subida_s: el servidor lo guarda junto a su tiempo de proceso
      // para mostrar el tiempo de análisis en el detalle de la medición.
      const res = await apiPost('/medicion', {
        ...body,
        imagen_key: post.imagen_key,
        tiempo_subida_s: Number(((finSubida - inicio) / 1000).toFixed(2)),
      });
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

  return { upload, loading, fase, error, result, reset };
}
