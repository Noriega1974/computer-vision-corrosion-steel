import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';
import { combinarResumenes, urlResumenDiario } from '../lib/resumenDiario';

// Daily aggregates from the server (GET /mediciones/resumen-diario), one call per
// year in `anios`, merged. Independent of the 1000-most-recent window the lists use.
export function useResumenDiario({ anios, idPunto, empresaId, habilitado = true }) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [resumen, setResumen] = useState(() => combinarResumenes([]));
  const [loading, setLoading] = useState(habilitado);
  const [error, setError] = useState(null);
  const clave = `${anios.join(',')}|${idPunto ?? ''}|${empresaId ?? ''}`;
  const claveCargada = useRef(null);

  useEffect(() => {
    if (!habilitado) { setLoading(false); return undefined; }
    let cancelled = false;
    // Stale-while-revalidate: a refresh of the same query keeps the data on screen;
    // a different query (other point/year) starts empty so it never shows foreign rows.
    if (claveCargada.current !== clave) {
      setResumen(combinarResumenes([]));
      setLoading(true);
    }
    setError(null);
    Promise.all(anios.map((a) => apiGet(urlResumenDiario(a, { idPunto, empresaId }))))
      .then((resp) => { if (!cancelled) { claveCargada.current = clave; setResumen(combinarResumenes(resp)); setLoading(false); } })
      .catch((err) => {
        if (cancelled) return;
        // Never paint stale data next to an error: the bar shows the error + retry.
        claveCargada.current = null;
        setResumen(combinarResumenes([]));
        setError(err.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
    // `clave` stands for anios/idPunto/empresaId (a new array each render would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, habilitado, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey((k) => k + 1), []);
  return useMemo(() => ({ ...resumen, loading, error, refetch }), [resumen, loading, error, refetch]);
}
