import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

// Indicadores globales calculados por el servidor (GET /indicadores). Solo
// super_admin puede acotar por empresa (`empresaId`); para el resto el
// backend ignora el parámetro. Mantiene los datos previos mientras recarga.
export function useIndicadores(empresaId = null) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    const qs = empresaId ? `?empresa_id=${encodeURIComponent(empresaId)}` : '';
    apiGet(`/indicadores${qs}`)
      .then((data) => {
        if (cancelled) return;
        setDatos(data ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'No se pudo cargar');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [empresaId, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey((k) => k + 1), []);
  return { datos, loading, error, refetch };
}
