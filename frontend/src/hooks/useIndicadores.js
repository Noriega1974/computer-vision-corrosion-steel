import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

// Indicadores globales calculados por el servidor (GET /indicadores). Solo
// super_admin puede acotar por empresa (`empresaId`); para el resto el
// backend ignora el parámetro. Mantiene los datos previos mientras recarga del
// MISMO alcance; al cambiar de empresa los descarta (nunca mostrar los de otra).
export function useIndicadores(empresaId = null) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  // Los datos llevan el alcance con el que se pidieron: si no coincide con el
  // actual (cambio de empresa) se tratan como ausentes desde el primer render.
  const [guardado, setGuardado] = useState({ empresaId, datos: null });
  const [loading, setLoading] = useState(true);
  const [errorGuardado, setErrorGuardado] = useState({ empresaId, mensaje: null });
  const vigente = guardado.empresaId === empresaId;
  const datos = vigente ? guardado.datos : null;
  const error = errorGuardado.empresaId === empresaId ? errorGuardado.mensaje : null;

  useEffect(() => {
    let cancelled = false;
    setErrorGuardado({ empresaId, mensaje: null });
    setLoading(true);
    const qs = empresaId ? `?empresa_id=${encodeURIComponent(empresaId)}` : '';
    apiGet(`/indicadores${qs}`)
      .then((data) => {
        if (cancelled) return;
        setGuardado({ empresaId, datos: data ?? null });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Un fallo no deja a la vista datos de otro alcance.
        setGuardado((g) => (g.empresaId === empresaId ? g : { empresaId, datos: null }));
        setErrorGuardado({ empresaId, mensaje: err.message || 'No se pudo cargar' });
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [empresaId, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey((k) => k + 1), []);
  return { datos, loading: loading || !vigente, error, refetch };
}
