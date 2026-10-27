import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

// `resumen` pide al backend omitir máscaras y detecciones (la galería no las
// usa y así caben 1000 mediciones en una respuesta).
export function useMediciones(limit = 20, { resumen = false } = {}) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [mediciones, setMediciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Solo mostramos el skeleton de carga si no tenemos datos en caché (stale-while-revalidate)
    if (mediciones.length === 0) {
      setLoading(true);
    }
    setError(null);
    apiGet(`/mediciones/recientes?limit=${limit}${resumen ? '&resumen=1' : ''}`)
      .then(data => {
        if (!cancelled) {
          setMediciones(data?.mediciones ?? []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [limit, resumen, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey(k => k + 1), []);
  return { mediciones, loading, error, refetch };
}
