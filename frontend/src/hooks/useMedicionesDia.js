import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

// All photos of one local day of a point (GET /mediciones/{id}?desde=D&hasta=D),
// without heavy fields. The server caps at 500; `truncado` says more exist.
export function useMedicionesDia(idPunto, fechaISO) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [datos, setDatos] = useState({ clave: '', mediciones: [], truncado: false });
  const [fallo, setFallo] = useState({ clave: '', mensaje: null });
  const clave = idPunto && fechaISO ? `${idPunto}|${fechaISO}` : '';

  useEffect(() => {
    if (!clave) return undefined;
    let cancelled = false;
    setFallo({ clave: '', mensaje: null });
    const qs = new URLSearchParams({ desde: fechaISO, hasta: fechaISO, resumen: '1', limite: '500' });
    apiGet(`/mediciones/${encodeURIComponent(idPunto)}?${qs}`)
      .then((data) => {
        if (cancelled) return;
        setDatos({ clave, mediciones: data?.mediciones ?? [], truncado: Boolean(data?.truncado) });
      })
      .catch((err) => { if (!cancelled) setFallo({ clave, mensaje: err.message }); });
    return () => { cancelled = true; };
  }, [clave, idPunto, fechaISO, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey((k) => k + 1), []);
  // Never expose another day's rows while the new day loads. Loading and error
  // derive from the key, so the very first render after picking a day already
  // reads "loading" (no empty-state flash); refreshing the open day keeps its rows.
  const vigente = Boolean(clave) && datos.clave === clave;
  const error = clave && fallo.clave === clave ? fallo.mensaje : null;
  return {
    mediciones: vigente ? datos.mediciones : [],
    truncado: vigente ? datos.truncado : false,
    loading: Boolean(clave) && !vigente && !error,
    error,
    refetch,
  };
}
