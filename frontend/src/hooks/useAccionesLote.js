import { useCallback, useState } from 'react';
import { apiPost } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

// POST /mediciones/lote/eliminar y /mediciones/lote/mover (api_mediciones).
// El backend acepta hasta 100 por solicitud y responde 200 con resultado por
// ítem: { ok: [id_medicion], error: [{ id_medicion, motivo }] }. Aquí se parte
// la selección en tandas de 100 y se unen los resultados; si una tanda entera
// falla (403, red) todas sus mediciones se marcan con error.
const TANDA = 100;

async function enTandas(ruta, items, extra) {
  const ok = [];
  const error = [];
  for (let i = 0; i < items.length; i += TANDA) {
    const tanda = items.slice(i, i + TANDA);
    try {
      const data = await apiPost(ruta, { items: tanda, ...extra });
      ok.push(...(data?.ok ?? []));
      error.push(...(data?.error ?? []));
    } catch (err) {
      const motivo = err.message || 'No se pudo completar la acción';
      error.push(...tanda.map(t => ({ id_medicion: t.id_medicion, motivo })));
    }
  }
  return { ok, error };
}

// items: [{ id_punto, id_medicion }]. Tras cada acción invalida los datos de
// todas las pantallas (RefreshKeyContext) para que reflejen el cambio.
export function useAccionesLote() {
  const { invalidate } = useRefreshKey();
  const [procesando, setProcesando] = useState(false);

  const ejecutar = useCallback(async (ruta, items, extra) => {
    setProcesando(true);
    try {
      return await enTandas(ruta, items, extra);
    } finally {
      setProcesando(false);
      invalidate();
    }
  }, [invalidate]);

  const eliminar = useCallback((items) => ejecutar('/mediciones/lote/eliminar', items), [ejecutar]);
  const mover = useCallback(
    (items, destinoBloqueId) => ejecutar('/mediciones/lote/mover', items, { destino_bloque_id: destinoBloqueId }),
    [ejecutar],
  );

  return { eliminar, mover, procesando };
}
