import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import TopNav from '../components/TopNav';
import PageHeader from '../components/PageHeader';

export default function AppLayout() {
  const { logout } = useAuth();

  // Modo oscuro — persiste en localStorage
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('corria-darkmode') === 'true'
  );

  // Aplicar tema al documento raíz
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('corria-darkmode', darkMode);
    window.dispatchEvent(new CustomEvent('corria-darkmode', { detail: darkMode }));
  }, [darkMode]);

  // El selector "Modo de visualización" en Configuración cambia el tema
  // desde ahí -- se escucha el mismo evento que se dispara arriba.
  useEffect(() => {
    const handler = (e) => setDarkMode(e.detail);
    window.addEventListener('corria-darkmode', handler);
    return () => window.removeEventListener('corria-darkmode', handler);
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-page)',
    }}>
      <TopNav
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        onLogout={logout}
      />

      {/* El Dashboard dibuja su propio encabezado de página (ver
          DashboardPage.jsx) -- PageHeader se oculta ahí para no duplicar
          el título, pero se mantiene montado igual para no perder el
          efecto que actualiza document.title. */}
      <PageHeader />

      <main style={{
        flex: 1,
        overflow: 'auto',
        background: 'var(--bg-page)',
      }}>
        <Outlet />
      </main>
    </div>
  );
}
