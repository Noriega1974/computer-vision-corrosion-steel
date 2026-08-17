import React from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * 404 real.
 *
 * Antes cualquier ruta desconocida hacia `<Navigate to="/dashboard">`, asi que
 * un enlace roto se disfrazaba de navegacion normal y el usuario nunca se
 * enteraba de que la URL estaba mal. Esta pantalla dice que paso, muestra la
 * ruta que se intento abrir y ofrece la salida.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <div
      style={{
        flex: 1,
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 16,
        padding: '48px 20px',
        maxWidth: 560,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.14em',
          color: 'var(--text-faint)',
        }}
      >
        ERROR 404
      </span>

      {/* h2 y no h1: esta pagina se monta dentro de AppLayout, y el h1 de la
          vista lo pone PageHeader. Dos h1 en el mismo documento rompen la
          navegacion por estructura de un lector de pantalla. */}
      <h2
        style={{
          fontSize: 26,
          fontWeight: 640,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        Esta página no existe
      </h2>

      <p
        style={{
          fontSize: 14,
          color: 'var(--text-muted)',
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        No hay nada en{' '}
        <code
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 13,
            background: 'var(--bg-inset)',
            padding: '2px 6px',
            borderRadius: 4,
            color: 'var(--text-primary)',
          }}
        >
          {pathname}
        </code>
        . Puede que el enlace esté mal escrito o que la sección se haya movido.
      </p>

      <Link
        to="/dashboard"
        style={{
          marginTop: 8,
          padding: '10px 18px',
          borderRadius: 8,
          background: 'var(--accent-blue)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 550,
          textDecoration: 'none',
        }}
      >
        Volver al dashboard
      </Link>
    </div>
  );
}
