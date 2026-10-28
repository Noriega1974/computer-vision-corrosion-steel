import { useState, useEffect } from 'react';
import { apiGet } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

const SIN_ENCONTRAR_RECIENTES = 'Medición no encontrada. Es posible que no esté entre las 100 más recientes.';

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
  const [estado, setEstado] = useState({ medicion: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    // Stale-while-revalidate solo para la misma medición.
    setEstado(e => (e.medicion?.id_medicion === idMedicion ? e : { medicion: null, loading: true, error: null }));

    async function cargar() {
      let medicion = null;
      let error = null;
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
          if (!medicion) error = SIN_ENCONTRAR_RECIENTES;
        } catch (err) {
          error = err.message;
        }
      }
      if (!cancelled) setEstado({ medicion, loading: false, error: medicion ? null : error });
    }
    cargar();
    return () => { cancelled = true; };
  }, [idMedicion, idPunto, globalKey]);

  return estado;
}
