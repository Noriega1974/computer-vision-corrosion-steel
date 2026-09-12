import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Contexto global para invalidar la caché de todos los hooks de datos
// Llamar invalidate() después de un upload exitoso para refrescar la UI

const AUTOREFRESH_STORAGE_KEY = 'corria-auto-refresh';
const INTERVALO_MS = 60_000; // cada 60s, suficiente para verse "vivo" sin saturar la API

const RefreshKeyContext = createContext({
  key: 0,
  invalidate: () => {},
  autoRefresh: true,
  setAutoRefresh: () => {},
});

export function RefreshKeyProvider({ children }) {
  const [key, setKey] = useState(0);
  const invalidate = useCallback(() => setKey(k => k + 1), []);

  // Preferencia de Configuración > Preferencias del sistema. Por defecto
  // activada (así se comportaba la app antes de que este switch existiera).
  const [autoRefresh, setAutoRefreshState] = useState(
    () => localStorage.getItem(AUTOREFRESH_STORAGE_KEY) !== 'false'
  );

  const setAutoRefresh = useCallback((value) => {
    setAutoRefreshState(value);
    localStorage.setItem(AUTOREFRESH_STORAGE_KEY, String(value));
  }, []);

  // Mientras esté activado, invalida periódicamente para que todos los
  // hooks que dependen de `key` (useMediciones, useBloques, etc.) refetcheen.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(invalidate, INTERVALO_MS);
    return () => clearInterval(id);
  }, [autoRefresh, invalidate]);

  return (
    <RefreshKeyContext.Provider value={{ key, invalidate, autoRefresh, setAutoRefresh }}>
      {children}
    </RefreshKeyContext.Provider>
  );
}

export function useRefreshKey() {
  return useContext(RefreshKeyContext);
}
