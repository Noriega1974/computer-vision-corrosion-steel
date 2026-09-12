import React, { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Menu, Sun, Moon } from 'lucide-react';

// Mapa de rutas a títulos de página para el breadcrumb
const ROUTE_TITLES = {
  '/dashboard':    'Dashboard',
  '/upload':       'Nueva Medición',
  '/galeria':      'Galería',
  '/puntos':       'Puntos',
  '/usuarios':     'Usuarios',
  '/configuracion':'Configuración',
  '/deteccion-ia': 'Detección IA',
  '/privacidad':   'Privacidad',
};

function buildBreadcrumb(pathname) {
  if (pathname.startsWith('/galeria/')) {
    const id = pathname.replace('/galeria/', '');
    return { title: 'Galería', sub: `Medición ${id.substring(0, 12)}…` };
  }
  // Una ruta desconocida cae en NotFoundPage: mostrar el pathname crudo como
  // titulo delataba la implementacion en vez de explicar que paso.
  const title = ROUTE_TITLES[pathname];
  if (!title) return { title: 'Página no encontrada', sub: pathname };

  return { title, sub: null };
}

export default function PageHeader({ onMenuToggle, isMobile, darkMode, onToggleDark }) {
  const location = useLocation();
  const { title, sub } = buildBreadcrumb(location.pathname);

  // Todas las pantallas compartian el mismo <title> estatico, asi que con
  // varias pestanas abiertas eran indistinguibles.
  useEffect(() => {
    document.title = `${title} · PixelRust`;
  }, [title]);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {isMobile && (
          <button
            onClick={onMenuToggle}
            aria-label="Abrir menú de navegación"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
              padding: 'var(--space-1)',
            }}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {/* El h1 de cada pagina vive aca. El header se monta una vez por
              ruta y ya conoce el titulo, asi que ponerlo aca garantiza
              exactamente un h1 por vista sin repetirlo en cada pagina. Los
              titulos dentro del contenido son h2 en adelante. */}
          <h1 style={{
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-md)',
            color: 'var(--text-primary)', margin: 0, lineHeight: 1.2,
          }}>
            {title}
          </h1>
          {sub && (
            <>
              <span style={{ color: 'var(--border-strong)', fontSize: 14 }}>·</span>
              <span style={{
                fontFamily: 'var(--font-data)', fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)', letterSpacing: '0.03em',
              }}>
                {sub}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Derecha: toggle tema */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Toggle de tema claro/oscuro */}
        <button
          onClick={onToggleDark}
          title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
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
