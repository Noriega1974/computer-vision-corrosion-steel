import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

// GET/POST /empresas -- restringido a super_admin en el backend
// (api_usuarios/handler.py). No hay PUT/DELETE todavia: una empresa, una
// vez creada, no se edita ni se borra desde la UI (fuera de alcance de
// esta tarea, el backend tampoco lo expone).
// `enabled` evita el fetch (y el 403 esperable) para roles que no son
// super_admin -- los hooks se llaman igual siempre (regla de React), pero
// el efecto no dispara la request si enabled es false.
export function useEmpresas(enabled = true) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet('/empresas')
      .then(data => {
        if (!cancelled) {
          setEmpresas(Array.isArray(data) ? data : (data?.empresas ?? []));
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
  }, [enabled, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey(k => k + 1), []);
  return { empresas, loading, error, refetch };
}

export function useGestionEmpresas(enabled = true) {
  const { empresas, loading, error, refetch } = useEmpresas(enabled);
  const [mutating, setMutating] = useState(false);
  const [mutError, setMutError] = useState(null);

  const crearEmpresa = useCallback(async (payload) => {
    setMutating(true);
    setMutError(null);
    try {
      const result = await apiPost('/empresas', payload);
      refetch();
      return result;
    } catch (err) {
      setMutError(err.message);
      throw err;
    } finally {
      setMutating(false);
    }
  }, [refetch]);

  return { empresas, loading, error, mutating, mutError, crearEmpresa, refetch };
}
