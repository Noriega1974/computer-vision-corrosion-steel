import React from 'react';

/**
 * Fallback de Suspense mientras se descarga el chunk de una ruta.
 *
 * Ocupa el alto disponible y no el de la ventana: se monta dentro del layout,
 * con el sidebar ya presente, asi que centrarlo contra 100vh lo empujaria
 * fuera de cuadro.
 */
export default function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: 1,
        minHeight: 240,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent-blue)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 12,
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
        }}
      >
        Cargando…
      </span>
    </div>
  );
}
