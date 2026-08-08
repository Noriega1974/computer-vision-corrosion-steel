import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

export function usePunto(idPunto) {
  const [localKey, setLocalKey] = useState(0);
  const [punto, setPunto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!idPunto) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet(`/puntos/${idPunto}`)
      .then(data => {
        if (!cancelled) {
          setPunto(data);
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
  }, [idPunto, localKey]);

  const refetch = useCallback(() => setLocalKey(k => k + 1), []);
  return { punto, loading, error, refetch };
}

export function useGestionPuntos() {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [puntos, setPuntos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mutating, setMutating] = useState(false);
  const [mutError, setMutError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet('/puntos')
      .then(data => {
        if (!cancelled) {
          setPuntos(Array.isArray(data) ? data : (data?.puntos ?? []));
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

  const crearPunto = useCallback(async (payload) => {
    setMutating(true);
    setMutError(null);
    try {
      const result = await apiPost('/puntos', payload);
      refetch();
      return result;
    } catch (err) {
      setMutError(err.message);
      throw err;
    } finally {
      setMutating(false);
    }
  }, [refetch]);

  const editarPunto = useCallback(async (idPunto, payload) => {
    setMutating(true);
    setMutError(null);
    try {
      const result = await apiPut(`/puntos/${idPunto}`, payload);
      refetch();
      return result;
    } catch (err) {
      setMutError(err.message);
      throw err;
    } finally {
      setMutating(false);
    }
  }, [refetch]);

  return { puntos, loading, error, mutating, mutError, crearPunto, editarPunto, refetch };
}
