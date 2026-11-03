import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';
import { urlMedicionesRango } from '../lib/lineaTiempo';

// Measurements of a local-day range straight from the server
// (GET /mediciones/recientes?desde&hasta), for ranges older than the loaded
// 1000-recent window. `truncado` says the server cut the range at `limite`.
// Loading/error derive from the key so the first render after picking a range
// shows "loading", never an empty list.
export function useMedicionesRango({ desde, hasta, habilitado }) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [datos, setDatos] = useState({ clave: '', mediciones: [], truncado: false });
  const [fallo, setFallo] = useState({ clave: '', mensaje: null });
  const clave = habilitado ? `${desde || ''}|${hasta || ''}` : '';

  useEffect(() => {
    if (!clave) return undefined;
    let cancelled = false;
    setFallo({ clave: '', mensaje: null });
    apiGet(urlMedicionesRango(desde, hasta))
      .then((data) => {
        if (!cancelled) setDatos({ clave, mediciones: data?.mediciones ?? [], truncado: Boolean(data?.truncado) });
      })
      .catch((err) => { if (!cancelled) setFallo({ clave, mensaje: err.message }); });
    return () => { cancelled = true; };
    // `clave` stands for desde/hasta/habilitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey((k) => k + 1), []);
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
