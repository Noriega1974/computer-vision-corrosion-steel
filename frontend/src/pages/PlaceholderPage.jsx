import React from 'react';
import { Wrench } from 'lucide-react';

// Página reutilizable para secciones aún no implementadas
export default function PlaceholderPage({ titulo = 'Sección', descripcion }) {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 40,
    }}>
      <div style={{
        width: 64, height: 64,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <Wrench size={28} strokeWidth={1.5} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 18,
          color: 'var(--text-primary)', marginBottom: 8,
        }}>
          {titulo}
        </div>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: 13,
          color: 'var(--text-muted)', maxWidth: 380,
          lineHeight: 1.6,
        }}>
          {descripcion ?? 'Próximamente — Esta sección estará disponible en la siguiente iteración.'}
        </div>
      </div>

      <div style={{
        padding: '6px 16px',
        background: 'var(--bg-inset)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        fontFamily: 'var(--font-data)',
        fontSize: 10,
        color: 'var(--text-faint)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        En desarrollo
      </div>
    </div>
  );
}
