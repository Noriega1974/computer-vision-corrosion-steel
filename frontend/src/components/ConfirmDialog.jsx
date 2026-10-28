import React, { useEffect, useId, useRef } from 'react';
import { IconoCerrar } from './Iconos';

// Shared confirmation modal. Uses a native <dialog> opened with showModal(),
// which gives the focus trap and an inert background for free. Layout and the
// entry animation live in index.css under .lote-dialog / .lote-dialog-panel;
// tone colors live under .confirm-btn--* (contrast verified in both themes).
//
// tone: 'danger' | 'warning' | 'default'
// Buttons are left-aligned in the order Cancelar | Action.

const panelStyle = {
  background: 'var(--bg-card-solid)', border: '1px solid var(--border)',
  borderRadius: 12, maxWidth: 440, width: '100%', padding: '24px 20px',
  maxHeight: '90vh', overflowY: 'auto',
};

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  loadingLabel = 'Procesando…',
  tone = 'default',
  onConfirm,
  onCancel,
  loading = false,
  confirmDisabled = false,
  hideConfirm = false,
  children,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  // Open as a modal, focus the safe option so Enter never triggers a
  // destructive action by accident, lock body scroll, and give focus back to
  // the opener on unmount (the dialog is removed from the DOM, so the
  // browser's own close() focus restore does not run).
  useEffect(() => {
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  const blocked = loading || confirmDisabled;
  const hasMessage = message !== undefined && message !== null && message !== false && message !== '';

  return (
    <dialog
      ref={dialogRef}
      className="lote-dialog"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={hasMessage ? messageId : undefined}
      // Esc fires `cancel`; route it through our handler and never let it close mid-action.
      onCancel={(e) => { e.preventDefault(); if (!loading) onCancel(); }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div className="lote-dialog-panel" style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: hasMessage ? 8 : 0 }}>
          {title ? (
            <h3 id={titleId} style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-md, 16px)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {title}
            </h3>
          ) : <span />}
          <button
            type="button" onClick={onCancel} disabled={loading} aria-label="Cerrar"
            style={{
              display: 'flex', padding: 9, margin: '-9px -9px 0 auto', background: 'transparent', border: 'none',
              borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', color: 'var(--text-muted)',
            }}
          >
            <IconoCerrar size={18} />
          </button>
        </div>
        {hasMessage && (
          <div id={messageId} style={{ fontSize: 14, color: title ? 'var(--text-secondary)' : 'var(--text-primary)', fontFamily: 'var(--font-ui)', lineHeight: 1.6 }}>
            {message}
          </div>
        )}
        {children}
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 'var(--space-2-5)', marginTop: 20 }}>
          <button
            ref={cancelRef} type="button" onClick={onCancel} disabled={loading}
            style={{
              padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-strong)',
              borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
            }}
          >
            {cancelLabel}
          </button>
          {!hideConfirm && (
            <button
              type="button" onClick={onConfirm} disabled={blocked}
              className={`confirm-btn--${tone}`}
              style={{
                padding: '8px 16px', border: 'none', borderRadius: 8,
                cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.6 : 1,
                fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)',
              }}
            >
              {loading ? loadingLabel : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
