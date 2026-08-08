import { useState, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

export function useReporte() {
  const [reporte, setReporte] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generarReporte = useCallback(async (tipo, params = {}) => {
    setLoading(true);
    setError(null);
    setReporte(null);
    try {
      const query = new URLSearchParams();
      if (params.desde) query.set('desde', params.desde);
      if (params.hasta) query.set('hasta', params.hasta);
      const qs = query.toString() ? `?${query.toString()}` : '';

      let path;
      if (tipo === 'planta' && params.idPunto) {
        path = `/reportes/planta/${params.idPunto}${qs}`;
      } else {
        path = `/reportes/global${qs}`;
      }

      const data = await apiGet(path);

      // Normalizar respuesta de planta al mismo shape plano que usa la página.
      // El backend de planta devuelve { punto, periodo, resumen:{...}, mediciones, alertas }.
      let normalizado = data;
      if (tipo === 'planta' && data?.resumen) {
        const r = data.resumen;
        normalizado = {
          ...data,
          // Aplanar campos del resumen con tipos numéricos garantizados
          total_mediciones: r.total_mediciones,
          nivel_promedio:   parseFloat(r.nivel_promedio   ?? 0),
          nivel_maximo:     r.nivel_maximo,
          area_promedio:    parseFloat(r.area_promedio_pct ?? 0),
          total_alertas:    r.total_alertas,
          tendencia:        r.tendencia, // string: 'mejorando'|'estable'|'empeorando'
          // Parsear campos numéricos de cada medición que pueden venir como string
          mediciones: (data.mediciones ?? []).map(m => ({
            ...m,
            area_corroida_pct: parseFloat(m.area_corroida_pct ?? 0),
            nivel_corrosion:   parseInt(m.nivel_corrosion   ?? 0, 10),
          })),
        };
      }

      setReporte(normalizado);
      return normalizado;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const limpiar = useCallback(() => {
    setReporte(null);
    setError(null);
  }, []);

  return { reporte, loading, error, generarReporte, limpiar };
}
