import { useState, useEffect, useCallback, useMemo } from 'react';
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

  useEffect(() => {
    if (!habilitado) { setLoading(false); return undefined; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(anios.map((a) => apiGet(urlResumenDiario(a, { idPunto, empresaId }))))
      .then((resp) => { if (!cancelled) { setResumen(combinarResumenes(resp)); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
    // `clave` stands for anios/idPunto/empresaId (a new array each render would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, habilitado, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey((k) => k + 1), []);
  return useMemo(() => ({ ...resumen, loading, error, refetch }), [resumen, loading, error, refetch]);
}
