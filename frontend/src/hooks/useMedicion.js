import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

const SIN_ENCONTRAR = 'No encontramos esta medición. Puede que se haya eliminado.';

/**
 * Devuelve una medición individual con todos sus campos (máscaras incluidas).
 *
 * Con `idPunto` (los enlaces de la galería lo llevan en `?punto=`) la pide a
 * GET /mediciones/{id_punto}?id_medicion=..., que halla fotos de cualquier
 * antigüedad. Sin él, o si esa consulta falla o no la halla, la busca entre las
 * 100 más recientes (comportamiento anterior; enlaces viejos o guardados).
 */
export function useMedicion(idMedicion, idPunto) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [estado, setEstado] = useState({ medicion: null, loading: true, error: null, noEncontrada: false });

  useEffect(() => {
    let cancelled = false;
    // Stale-while-revalidate solo para la misma medición.
    setEstado(e => (e.medicion?.id_medicion === idMedicion ? e : { medicion: null, loading: true, error: null, noEncontrada: false }));

    async function cargar() {
      let medicion = null;
      let error = null;
      let noEncontrada = false;
      if (idPunto) {
        try {
          const data = await apiGet(
            `/mediciones/${encodeURIComponent(idPunto)}?id_medicion=${encodeURIComponent(idMedicion)}`
          );
          medicion = data?.mediciones?.find(m => m.id_medicion === idMedicion) ?? null;
        } catch { /* se intenta con las recientes */ }
      }
      if (!medicion) {
        try {
          const data = await apiGet('/mediciones/recientes?limit=100');
          medicion = data?.mediciones?.find(m => m.id_medicion === idMedicion) ?? null;
          if (!medicion) { error = SIN_ENCONTRAR; noEncontrada = true; }
        } catch (err) {
          error = err.message;
        }
      }
      if (!cancelled) setEstado({ medicion, loading: false, error: medicion ? null : error, noEncontrada: medicion ? false : noEncontrada });
    }
    cargar();
    return () => { cancelled = true; };
  }, [idMedicion, idPunto, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey(k => k + 1), []);
  // Reemplaza la medición mostrada por una ya traída (p. ej. tras reanalizar),
  // sin otra consulta.
  const reemplazar = useCallback(m => setEstado(e => ({ ...e, medicion: m })), []);
  return { ...estado, refetch, reemplazar };
}
