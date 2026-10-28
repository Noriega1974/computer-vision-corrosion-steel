import React, { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { useAuth } from '../auth/AuthContext';
import { useBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';

const textoStyle = { fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', lineHeight: 1.6, margin: 0 };
const selectStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8, boxSizing: 'border-box',
  border: '1px solid var(--border-strong)', background: 'var(--bg-page)',
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)',
};
const etiquetaStyle = {
  display: 'block', fontFamily: 'var(--font-data)', fontSize: 'var(--text-3xs)', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', margin: '14px 0 5px',
};

// Thin adapter over the shared ConfirmDialog (native <dialog>, focus handling,
// Esc/backdrop blocking while processing, tone colors all live there).
function Marco({ titulo, children, onCancelar, onConfirmar, confirmar, confirmando, peligro, deshabilitado, procesando }) {
  return (
    <ConfirmDialog
      title={titulo}
      confirmLabel={confirmar}
      loadingLabel={confirmando || 'Procesando…'}
      tone={peligro ? 'danger' : 'default'}
      confirmDisabled={deshabilitado}
      loading={procesando}
      onConfirm={onConfirmar}
      onCancel={onCancelar}
    >
      {children}
    </ConfirmDialog>
  );
}

const fotos = (n) => `${n} ${n === 1 ? 'foto' : 'fotos'}`;

export function EliminarLoteDialog({ cantidad, procesando, onConfirmar, onCancelar }) {
  return (
    <Marco
      titulo={`¿Eliminar ${fotos(cantidad)}?`} confirmar="Eliminar" confirmando="Eliminando…" peligro
      procesando={procesando} onConfirmar={onConfirmar} onCancelar={onCancelar}
    >
      <p style={{ ...textoStyle, color: 'var(--text-secondary)' }}>
        {cantidad === 1
          ? 'La foto y su resultado de corrosión se borran para siempre y dejan de contar en las estadísticas del punto. Esta acción no se puede deshacer.'
          : 'Las fotos y sus resultados de corrosión se borran para siempre y dejan de contar en las estadísticas del punto. Esta acción no se puede deshacer.'}
      </p>
    </Marco>
  );
}

// Destino: admin y tecnico eligen entre los puntos de su empresa (el backend ya
// los acota); super_admin elige primero la empresa y luego el punto.
export function MoverLoteDialog({ cantidad, puntoActual, procesando, onConfirmar, onCancelar }) {
  const { user } = useAuth();
  const esSuperAdmin = user?.groups?.includes('super_admin');
  const { empresas } = useEmpresas(esSuperAdmin);
  const [empresaId, setEmpresaId] = useState('');
  const [destino, setDestino] = useState('');
  const { bloques, loading } = useBloques(!esSuperAdmin || !!empresaId, esSuperAdmin ? empresaId : undefined);

  const opciones = bloques.filter(b => b.activo !== false && b.id_bloque !== puntoActual);

  return (
    <Marco
      titulo={`¿Mover ${fotos(cantidad)}?`} confirmar="Mover" confirmando="Moviendo…" deshabilitado={!destino}
      procesando={procesando}
      onConfirmar={() => onConfirmar(destino, opciones.find(b => b.id_bloque === destino)?.nombre)}
      onCancelar={onCancelar}
    >
      <p style={textoStyle}>Las {fotos(cantidad)} seleccionadas pasarán al punto que elijas.</p>
      {esSuperAdmin && (
        <>
          <label htmlFor="mover-empresa" style={etiquetaStyle}>Zona</label>
          <select
            id="mover-empresa" value={empresaId} style={selectStyle}
            onChange={e => { setEmpresaId(e.target.value); setDestino(''); }}
          >
            <option value="">Elige una zona…</option>
            {empresas.map(e => <option key={e.id_empresa} value={e.id_empresa}>{e.nombre}</option>)}
          </select>
        </>
      )}
      <label htmlFor="mover-punto" style={etiquetaStyle}>Punto destino</label>
      <select
        id="mover-punto" value={destino} style={selectStyle}
        disabled={esSuperAdmin && !empresaId}
        onChange={e => setDestino(e.target.value)}
      >
        <option value="">
          {loading ? 'Cargando…' : opciones.length === 0 ? 'No hay puntos disponibles' : 'Elige un punto…'}
        </option>
        {opciones.map(b => (
          <option key={b.id_bloque} value={b.id_bloque}>{b.nombre}{b.ciudad ? ` · ${b.ciudad}` : ''}</option>
        ))}
      </select>
    </Marco>
  );
}
