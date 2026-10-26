import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

export function useMedicionesPunto(idPunto) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [mediciones, setMediciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const idPuntoPrevio = useRef(idPunto);

  useEffect(() => {
    if (!idPunto) {
      idPuntoPrevio.current = idPunto;
      setMediciones([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Si cambió el punto, la lista anterior pertenece a otro: se limpia para
    // no mostrar mediciones ajenas mientras llegan las nuevas. En un refresco
    // del mismo punto se conserva la lista para evitar parpadeo.
    const cambioDePunto = idPuntoPrevio.current !== idPunto;
    idPuntoPrevio.current = idPunto;
    if (cambioDePunto) {
      setMediciones([]);
      setLoading(true);
    } else if (mediciones.length === 0) {
      setLoading(true);
    }
    setError(null);
    apiGet(`/mediciones/${idPunto}`)
      .then(data => {
        if (!cancelled) {
          setMediciones(data?.mediciones ?? []);
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
  }, [idPunto, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey(k => k + 1), []);
  return { mediciones, loading, error, refetch };
}
