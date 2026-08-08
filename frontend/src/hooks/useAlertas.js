import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

export function useAlertas() {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet('/alertas')
      .then(data => {
        if (!cancelled) {
          setAlertas(Array.isArray(data) ? data : (data?.alertas ?? []));
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
  }, [globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey(k => k + 1), []);
  return { alertas, loading, error, refetch };
}
