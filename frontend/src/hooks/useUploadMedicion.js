import { useState, useCallback } from 'react';
import { apiPost } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

export function useUploadMedicion() {
  const { invalidate } = useRefreshKey();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const upload = useCallback(async (body) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost('/medicion', body);
      setResult(res);
      // Invalidar cache global para que todos los hooks refresquen
      invalidate();
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [invalidate]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { upload, loading, error, result, reset };
}
