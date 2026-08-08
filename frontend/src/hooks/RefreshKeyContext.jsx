import React, { createContext, useContext, useState, useCallback } from 'react';

// Contexto global para invalidar la caché de todos los hooks de datos
// Llamar invalidate() después de un upload exitoso para refrescar la UI
const RefreshKeyContext = createContext({ key: 0, invalidate: () => {} });

export function RefreshKeyProvider({ children }) {
  const [key, setKey] = useState(0);
  const invalidate = useCallback(() => setKey(k => k + 1), []);
  return (
    <RefreshKeyContext.Provider value={{ key, invalidate }}>
      {children}
    </RefreshKeyContext.Provider>
  );
}

export function useRefreshKey() {
  return useContext(RefreshKeyContext);
}
