import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut } from '../lib/apiClient';

export function useUsuarioPerfil() {
  const [localKey, setLocalKey] = useState(0);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet('/usuarios/me')
      .then(data => {
        if (!cancelled) {
          setPerfil(data);
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
  }, [localKey]);

  const refetch = useCallback(() => setLocalKey(k => k + 1), []);

  const actualizarPerfil = useCallback(async (payload) => {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiPut('/usuarios/me', payload);
      setPerfil(updated);
      return updated;
    } catch (err) {
      setSaveError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { perfil, loading, error, saving, saveError, actualizarPerfil, refetch };
}
