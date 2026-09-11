import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/apiClient';
import { useRefreshKey } from './RefreshKeyContext';

// GET/POST /bloques y PUT/DELETE /bloques/{id_bloque} -- misma Lambda que
// /puntos (ver handler.py de api_puntos). GET lo puede llamar cualquier rol
// autenticado: super_admin ve todos (o filtra con ?empresa_id=), el resto
// ve solo los de su propia empresa (scopeado por el backend). POST/PUT/DELETE
// son admin/super_admin únicamente.
//
// `enabled` evita el fetch para roles/vistas que no lo necesitan (mismo
// patrón que useEmpresas). `empresaId` agrega ?empresa_id= a la query --
// solo tiene efecto real para super_admin (el resto ya viene scopeado por
// el backend sin importar el parámetro); se usa en el selector de afiliación
// del formulario de punto (BloqueForm, en BloquesPage) cuando super_admin
// elige una.
export function useBloques(enabled = true, empresaId) {
  const { key: globalKey } = useRefreshKey();
  const [localKey, setLocalKey] = useState(0);
  const [bloques, setBloques] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = empresaId ? `?empresa_id=${encodeURIComponent(empresaId)}` : '';
    apiGet(`/bloques${query}`)
      .then(data => {
        if (!cancelled) {
          setBloques(Array.isArray(data) ? data : (data?.bloques ?? []));
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
  }, [enabled, empresaId, globalKey, localKey]);

  const refetch = useCallback(() => setLocalKey(k => k + 1), []);
  return { bloques, loading, error, refetch };
}

// Gestión completa (CRUD) para BloquesPage. Reusa useBloques sin filtro de
// empresa: super_admin ve todos los bloques de todas las afiliaciones en la
// tabla (con columna Empresa), admin ve solo los suyos.
export function useGestionBloques(enabled = true) {
  const { bloques, loading, error, refetch } = useBloques(enabled);
  const [mutating, setMutating] = useState(false);
  const [mutError, setMutError] = useState(null);

  const crearBloque = useCallback(async (payload) => {
    setMutating(true);
    setMutError(null);
    try {
      const result = await apiPost('/bloques', payload);
      refetch();
      return result;
    } catch (err) {
      setMutError(err.message);
      throw err;
    } finally {
      setMutating(false);
    }
  }, [refetch]);

  // payload acepta { nombre?, descripcion?, activo? } -- el backend
  // (PUT /bloques/{id_bloque}) actualiza solo los campos presentes.
  const editarBloque = useCallback(async (idBloque, payload) => {
    setMutating(true);
    setMutError(null);
    try {
      const result = await apiPut(`/bloques/${idBloque}`, payload);
      refetch();
      return result;
    } catch (err) {
      setMutError(err.message);
      throw err;
    } finally {
      setMutating(false);
    }
  }, [refetch]);

  // 409 si el bloque (punto) tiene mediciones asociadas -- el mensaje real
  // del backend viaja en mutError tal cual, sin reescribirlo acá.
  const eliminarBloque = useCallback(async (idBloque) => {
    setMutating(true);
    setMutError(null);
    try {
      await apiDelete(`/bloques/${idBloque}`);
      refetch();
    } catch (err) {
      setMutError(err.message);
      throw err;
    } finally {
      setMutating(false);
    }
  }, [refetch]);

  return { bloques, loading, error, mutating, mutError, crearBloque, editarBloque, eliminarBloque, refetch };
}
