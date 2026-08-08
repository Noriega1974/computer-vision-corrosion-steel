import { useMediciones } from './useMediciones';

/**
 * Devuelve una medición individual buscando por id_medicion en las últimas 100.
 *
 * TODO: idealmente el backend debería exponer GET /medicion/{id_medicion}
 *       para no tener que cargar las 100 más recientes. Cuando ese endpoint exista,
 *       reemplazar el body de este hook con una llamada directa a apiGet.
 */
export function useMedicion(idMedicion) {
  const { mediciones, loading, error } = useMediciones(100);

  if (loading) {
    return { medicion: null, loading: true, error: null };
  }

  if (error) {
    return { medicion: null, loading: false, error };
  }

  const medicion = mediciones.find(m => m.id_medicion === idMedicion) ?? null;

  return {
    medicion,
    loading: false,
    error: medicion ? null : 'Medición no encontrada. Es posible que no esté entre las 100 más recientes.',
  };
}
