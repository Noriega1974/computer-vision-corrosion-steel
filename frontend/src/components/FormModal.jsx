import React, { useEffect, useId, useRef } from 'react';
import { IconoCerrar } from './Iconos';

// Shared modal for create/edit forms (users, puntos, zonas). Same base as
// ConfirmDialog: a native <dialog> opened with showModal(), which gives the
// focus trap and an inert background for free. Layout and the entry animation
// reuse .lote-dialog / .lote-dialog-panel from index.css.
//
// - Initial focus goes to the first enabled field; if the content has none
//   (e.g. a result panel) it falls back to the close button.
// - Esc (the dialog's `cancel` event), the X button and a backdrop click all
//   call onClose, and are ignored while `saving` is true.
// - Body scroll is locked and focus returns to the opener on unmount (the
//   dialog is removed from the DOM, so the browser's own restore never runs).
//
// Props: title, onClose, children, maxWidth (default 500), saving (optional).

const FIELD_SELECTOR = [
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
].join(',');

export default function FormModal({ title, onClose, children, maxWidth = 500, saving = false }) {
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    dialogRef.current?.showModal();
    document.body.style.overflow = 'hidden';
    const first = bodyRef.current?.querySelector(FIELD_SELECTOR);
    (first || closeRef.current)?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="lote-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); if (!saving) onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div
        className="lote-dialog-panel"
        style={{
          // --bg-card is translucent for use over the dashboard blur; a dialog
          // has no blur of its own, so it needs the opaque variant.
          background: 'var(--bg-card-solid)', border: '1px solid var(--border)',
          borderRadius: 12, width: '100%', maxWidth,
          maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
          padding: '10px 11px 10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <h2 id={titleId} style={{ margin: 0, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
            {title}
          </h2>
          {/* 18px icon + 9px padding each side = 36px hit area */}
          <button
            ref={closeRef} type="button" onClick={onClose} disabled={saving} aria-label="Cerrar"
            style={{
              display: 'flex', padding: 9, background: 'transparent', border: 'none', borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', flexShrink: 0,
            }}
          >
            <IconoCerrar size={18} />
          </button>
        </div>
        <div ref={bodyRef} style={{ overflowY: 'auto', flex: 1, padding: 20 }}>
          {children}
        </div>
      </div>
    </dialog>
  );
}
