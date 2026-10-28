import React from 'react';
import Skeleton, { SkeletonLinea } from './Skeleton';

/**
 * Fallback de Suspense mientras se descarga el chunk de una ruta.
 *
 * Es un esqueleto generico de pagina (barra de titulo + tarjetas) y no un
 * spinner: se monta dentro del layout, con el sidebar ya presente, asi que
 * ocupa el ancho disponible sin depender del alto de la ventana.
 */
export default function RouteFallback() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando página"
      style={{
        flex: 1,
        minHeight: 240,
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div style={{ fontSize: 'var(--text-lg)', lineHeight: 1.2 }}><SkeletonLinea width={220} /></div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {[0, 1, 2].map(i => (
          <div key={i} className="card" style={{ padding: '15px 17px', borderRadius: 12 }}>
            <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.35 }}><SkeletonLinea width="50%" /></div>
            <div style={{ fontSize: 'var(--text-2xl)', lineHeight: 1, marginTop: 14 }}><SkeletonLinea width="30%" /></div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 16, borderRadius: 12 }}>
        <div style={{ fontSize: 'var(--text-sm)' }}><SkeletonLinea width={180} /></div>
        <Skeleton height={190} radius={8} style={{ marginTop: 14 }} />
      </div>
    </div>
  );
}
