import { leerModoOscuro, CLAVE_MODO_OSCURO } from '../lib/tema';
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Sidebar from '../components/Sidebar';
import PageHeader from '../components/PageHeader';
import LimiteErrores from '../components/LimiteErrores';

export default function AppLayout() {
  const { logout } = useAuth();
  const { pathname } = useLocation();

  // Estado del sidebar — persiste en localStorage
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('corria-sidebar-collapsed') === 'true'
  );

  // Modo oscuro — persiste en localStorage
  const [darkMode, setDarkMode] = useState(leerModoOscuro);

  // Estado del sidebar en móvil (overlay)
  const [mobileOpen, setMobileOpen] = useState(false);

  // Detectar si es móvil con resize listener
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Aplicar tema al documento raíz
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Only an explicit toggle saves the choice; mounting never writes the key.
  const alternarOscuro = () => {
    const siguiente = !darkMode;
    try { localStorage.setItem(CLAVE_MODO_OSCURO, String(siguiente)); } catch { /* storage blocked */ }
    setDarkMode(siguiente);
    window.dispatchEvent(new CustomEvent('corria-darkmode', { detail: siguiente }));
  };

  // El selector "Modo de visualización" en Configuración cambia el tema
  // desde ahí -- se escucha el mismo evento que se dispara arriba.
  useEffect(() => {
    const handler = (e) => setDarkMode(e.detail);
    window.addEventListener('corria-darkmode', handler);
    return () => window.removeEventListener('corria-darkmode', handler);
  }, []);

  // Persistir estado del sidebar
  useEffect(() => {
    localStorage.setItem('corria-sidebar-collapsed', collapsed);
  }, [collapsed]);

  // Cerrar sidebar móvil al cambiar a escritorio
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  function handleSidebarToggle() {
    if (isMobile) {
      setMobileOpen(o => !o);
    } else {
      setCollapsed(c => !c);
    }
  }

  // En móvil el sidebar colapsado significa que está cerrado (overlay)
  const sidebarCollapsed = isMobile ? !mobileOpen : collapsed;

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-page)',
    }}>
      {/* Backdrop para móvil */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 150,
          }}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        isMobile={isMobile}
        onToggle={handleSidebarToggle}
        onLogout={logout}
      />

      {/* Área principal: header + contenido */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        <PageHeader
          onMenuToggle={handleSidebarToggle}
          isMobile={isMobile}
          darkMode={darkMode}
          onToggleDark={alternarOscuro}
        />

        <main style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--bg-page)',
        }}>
          <LimiteErrores pathname={pathname}>
            <Outlet />
          </LimiteErrores>
        </main>
      </div>
    </div>
  );
}
