import React, { useEffect, useRef } from 'react';
import { IconoExito, IconoError } from './Iconos';

// Shared feedback surface. No side-tab accent: the tone is carried by a full
// 1px border (token at reduced alpha), a soft tint and a drawn icon.
const TONOS = {
  exito: { token: 'var(--accent-green)', Icono: IconoExito, role: 'status' },
  error: { token: 'var(--accent-red)', Icono: IconoError, role: 'alert' },
};

function estiloTono(token) {
  return {
    background: `color-mix(in srgb, ${token} 8%, var(--bg-card-solid))`,
    border: `1px solid color-mix(in srgb, ${token} 45%, transparent)`,
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--text-sm)',
  };
}

// Floating toast, auto-dismissed after 3.5 s (same behavior as the old local copies).
export default function Aviso({ message, onDismiss, tone = 'exito' }) {
  // Keep the latest onDismiss in a ref so a parent re-render (inline arrow)
  // does not restart the 3.5 s timer.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const t = setTimeout(() => dismissRef.current?.(), 3500);
    return () => clearTimeout(t);
  }, [message]);

  const { token, Icono, role } = TONOS[tone] ?? TONOS.exito;
  return (
    <div
      role={role === 'alert' ? 'alert' : 'status'}
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 600,
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        padding: '10px 16px',
        boxShadow: 'var(--shadow-lg)',
        ...estiloTono(token),
      }}
    >
      <Icono size={16} color={token} />
      {message}
    </div>
  );
}

// Inline banner (forms, upload errors). Keeps role="alert" for errors.
export function AvisoEnLinea({ tone = 'error', children, style }) {
  const { token, Icono, role } = TONOS[tone] ?? TONOS.error;
  return (
    <div
      role={role}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
        padding: '10px 14px', lineHeight: 1.5,
        ...estiloTono(token),
        ...style,
      }}
    >
      <Icono size={16} color={token} style={{ marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
