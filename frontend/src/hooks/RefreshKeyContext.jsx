import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Contexto global para invalidar la caché de todos los hooks de datos.
// Llamar invalidate() después de un upload, edición o borrado exitoso para
// refrescar la UI. No hay recarga automática periódica.

// Clave de la antigua preferencia "Actualización automática" (ya eliminada).
// Se borra al cargar para que los navegadores viejos dejen de guardarla.
const LEGACY_AUTOREFRESH_KEY = 'corria-auto-refresh';

const RefreshKeyContext = createContext({
  key: 0,
  invalidate: () => {},
});

export function RefreshKeyProvider({ children }) {
  const [key, setKey] = useState(0);
  const invalidate = useCallback(() => setKey(k => k + 1), []);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_AUTOREFRESH_KEY);
    } catch {
      // localStorage no disponible (modo privado, etc.): nada que limpiar.
    }
  }, []);

  return (
    <RefreshKeyContext.Provider value={{ key, invalidate }}>
      {children}
    </RefreshKeyContext.Provider>
  );
}

export function useRefreshKey() {
  return useContext(RefreshKeyContext);
}
