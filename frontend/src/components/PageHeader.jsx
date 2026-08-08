import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Menu, Bell, Sun, Moon } from 'lucide-react';
import { useAlertas } from '../hooks/useAlertas';

// Mapa de rutas a títulos de página para el breadcrumb
const ROUTE_TITLES = {
  '/dashboard':    'Dashboard',
  '/upload':       'Nueva Medición',
  '/galeria':      'Galería',
  '/reportes':     'Reportes',
  '/plantas':      'Plantas',
  '/usuarios':     'Usuarios',
  '/configuracion':'Configuración',
  '/deteccion-ia': 'Detección IA',
};

function buildBreadcrumb(pathname) {
  if (pathname.startsWith('/galeria/')) {
    const id = pathname.replace('/galeria/', '');
    return { title: 'Galería', sub: `Medición ${id.substring(0, 12)}…` };
  }
  return { title: ROUTE_TITLES[pathname] ?? pathname, sub: null };
}

export default function PageHeader({ onMenuToggle, isMobile, darkMode, onToggleDark }) {
  const location = useLocation();
  const { title, sub } = buildBreadcrumb(location.pathname);
  const { alertas } = useAlertas();
  const alertCount = alertas.filter(a => (a.nivel_corrosion ?? 0) >= 2).length;

  return (
    <header style={{
      height: 52,
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      flexShrink: 0,
      boxShadow: 'var(--shadow-sm)',
      zIndex: 50,
    }}>
      {/* Izquierda: hamburguesa (móvil) + breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isMobile && (
          <button
            onClick={onMenuToggle}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
              padding: 4,
            }}
          >
            <Menu size={20} />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15,
            color: 'var(--text-primary)',
          }}>
            {title}
          </span>
          {sub && (
            <>
              <span style={{ color: 'var(--border-strong)', fontSize: 14 }}>·</span>
              <span style={{
                fontFamily: 'var(--font-data)', fontSize: 12,
                color: 'var(--text-muted)', letterSpacing: '0.03em',
              }}>
                {sub}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Derecha: notificaciones + toggle tema */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Icono bell con badge de alertas (placeholder sin lógica de notificaciones) */}
        <button
          title="Notificaciones"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', position: 'relative',
            display: 'flex', alignItems: 'center', padding: 6, borderRadius: 7,
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-inset)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Bell size={18} strokeWidth={1.8} />
          {alertCount > 0 && (
            <div style={{
              position: 'absolute', top: 3, right: 3,
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent-red)',
              border: '1.5px solid var(--bg-card)',
              animation: 'pulse-dot 1.2s ease-in-out infinite',
            }} />
          )}
        </button>

        {/* Toggle de tema claro/oscuro */}
        <button
          onClick={onToggleDark}
          title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            padding: 6, borderRadius: 7, transition: 'background 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-inset)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {darkMode ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
        </button>
      </div>
    </header>
  );
}
