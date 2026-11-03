import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

// All photos of one local day of a point (GET /mediciones/{id}?desde=D&hasta=D),
// without heavy fields. The server caps at 500; `truncado` says more exist.
export function useMedicionesDia(idPunto, fechaISO) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [datos, setDatos] = useState({ clave: '', mediciones: [], truncado: false });
  const [loading, setLoading] = useState(Boolean(idPunto && fechaISO));
  const [error, setError] = useState(null);
  const clave = idPunto && fechaISO ? `${idPunto}|${fechaISO}` : '';

  useEffect(() => {
    if (!clave) { setLoading(false); setError(null); return undefined; }
    let cancelled = false;
    // Refreshing the open day keeps its rows; a different day starts empty.
    if (datos.clave !== clave) setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ desde: fechaISO, hasta: fechaISO, resumen: '1', limite: '500' });
    apiGet(`/mediciones/${encodeURIComponent(idPunto)}?${qs}`)
      .then((data) => {
        if (cancelled) return;
        setDatos({ clave, mediciones: data?.mediciones ?? [], truncado: Boolean(data?.truncado) });
        setLoading(false);
      })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
    // `datos.clave` is read on purpose only at effect start (not a trigger).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, idPunto, fechaISO, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey((k) => k + 1), []);
  // Never expose another day's rows while the new day loads.
  const vigente = datos.clave === clave;
  return {
    mediciones: vigente ? datos.mediciones : [],
    truncado: vigente ? datos.truncado : false,
    loading,
    error,
    refetch,
  };
}
