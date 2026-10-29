import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Mapa de rutas a títulos de página para el breadcrumb
const ROUTE_TITLES = {
  '/que-es-pixelrust': '¿Qué es PixelRust?',
  '/dashboard':    'Dashboard',
  '/upload':       'Nueva medición',
  '/galeria':      'Galería',
  '/puntos':       'Puntos',
  '/usuarios':     'Usuarios',
  '/configuracion':'Configuración',
  '/deteccion-ia': 'Detección IA',
  '/privacidad':   'Privacidad',
};

function buildBreadcrumb(pathname) {
  // Carpetas de la galería (empresa / punto): el nombre va en la propia página.
  if (pathname.startsWith('/galeria/zona/')) return { title: 'Galería', sub: null };
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

// El Dashboard dibuja su propio encabezado de página (etiqueta de
// afiliación + título + botón "Nueva medición", ver DashboardPage.jsx) --
// mostrar esta barra ahí también duplicaría el título. Se mantiene montado
// igual (solo se oculta el render) para no perder el efecto de
// document.title de abajo.
export default function PageHeader() {
  const location = useLocation();
  const { title, sub } = buildBreadcrumb(location.pathname);

  // Todas las pantallas compartian el mismo <title> estatico, asi que con
  // varias pestanas abiertas eran indistinguibles.
  useEffect(() => {
    document.title = `${title} · PixelRust`;
  }, [title]);

  if (location.pathname === '/dashboard') return null;

  return (
    <header style={{
      height: 52,
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {/* El h1 de cada pagina vive aca. El header se monta una vez por
            ruta y ya conoce el titulo, asi que ponerlo aca garantiza
            exactamente un h1 por vista sin repetirlo en cada pagina. Los
            titulos dentro del contenido son h2 en adelante. */}
        <h1 style={{
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-md)',
          color: 'var(--text-primary)', margin: 0, lineHeight: 1.2,
        }}>
          {title}
        </h1>
        {sub && (
          <>
            <span style={{ color: 'var(--border-strong)', fontSize: 14 }}>·</span>
            <span style={{
              fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)', letterSpacing: '0.03em',
            }}>
              {sub}
            </span>
          </>
        )}
      </div>
    </header>
  );
}
