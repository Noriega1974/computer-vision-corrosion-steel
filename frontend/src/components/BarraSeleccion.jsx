import React from 'react';
import { FolderInput, Trash2 } from 'lucide-react';

const botonBase = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)',
};

// Barra fija al pie del área de fotos en modo selección. Se acomoda en varias
// líneas en pantallas angostas (flex-wrap).
export default function BarraSeleccion({
  cantidad, total, onSeleccionarTodo, onMover, onEliminar, onCancelar, deshabilitado,
}) {
  const todas = cantidad === total && total > 0;
  return (
    <div
      role="toolbar"
      aria-label="Acciones sobre las fotos seleccionadas"
      style={{
        position: 'sticky', bottom: 12, zIndex: 20, marginTop: 16,
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)',
        padding: '10px 14px', background: 'var(--bg-card-solid)',
        border: '1px solid var(--border-strong)', borderRadius: 12,
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <span
        aria-live="polite"
        style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginRight: 'auto' }}
      >
        {cantidad} {cantidad === 1 ? 'seleccionada' : 'seleccionadas'}
      </span>
      <button
        type="button" onClick={onSeleccionarTodo} disabled={deshabilitado}
        style={{ ...botonBase, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 500 }}
      >
        {todas ? 'Quitar selección' : 'Seleccionar todo'}
      </button>
      <button
        type="button" onClick={onMover} disabled={deshabilitado || cantidad === 0}
        style={{
          ...botonBase, background: 'var(--accent-amber)', border: 'none', color: 'white',
          opacity: cantidad === 0 ? 0.5 : 1, cursor: cantidad === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        <FolderInput size={15} aria-hidden="true" />
        Mover a…
      </button>
      <button
        type="button" onClick={onEliminar} disabled={deshabilitado || cantidad === 0}
        style={{
          ...botonBase, background: 'var(--accent-red)', border: 'none', color: 'white',
          opacity: cantidad === 0 ? 0.5 : 1, cursor: cantidad === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        <Trash2 size={15} aria-hidden="true" />
        Eliminar
      </button>
      <button
        type="button" onClick={onCancelar} disabled={deshabilitado}
        style={{ ...botonBase, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 500 }}
      >
        Cancelar
      </button>
    </div>
  );
}
