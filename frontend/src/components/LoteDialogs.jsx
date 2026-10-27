import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';

const fondoStyle = {
  position: 'fixed', inset: 0, zIndex: 500, padding: 'var(--space-4)',
  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panelStyle = {
  background: 'var(--bg-card-solid)', border: '1px solid var(--border)',
  borderRadius: 12, maxWidth: 440, width: '100%', padding: '24px 20px',
  maxHeight: '90vh', overflowY: 'auto',
};
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

function Marco({ titulo, children, onCancelar, onConfirmar, confirmar, peligro, deshabilitado, procesando }) {
  return (
    <div style={fondoStyle} role="dialog" aria-modal="true" aria-label={titulo}>
      <div style={panelStyle}>
        <h3 style={{ margin: '0 0 12px', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-md, 16px)', color: 'var(--text-primary)' }}>
          {titulo}
        </h3>
        {children}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2-5)', marginTop: 20 }}>
          <button
            type="button" onClick={onCancelar} disabled={procesando}
            style={{
              padding: '7px 16px', background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
            }}
          >
            Cancelar
          </button>
          <button
            type="button" onClick={onConfirmar} disabled={deshabilitado || procesando}
            style={{
              padding: '7px 16px', border: 'none', borderRadius: 8, color: 'white',
              background: peligro ? 'var(--accent-red)' : 'var(--accent-amber)',
              cursor: deshabilitado || procesando ? 'not-allowed' : 'pointer',
              opacity: deshabilitado || procesando ? 0.6 : 1,
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)',
            }}
          >
            {procesando ? 'Procesando…' : confirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

const fotos = (n) => `${n} ${n === 1 ? 'foto' : 'fotos'}`;

export function EliminarLoteDialog({ cantidad, procesando, onConfirmar, onCancelar }) {
  return (
    <Marco
      titulo="Eliminar fotos" confirmar="Eliminar" peligro
      procesando={procesando} onConfirmar={onConfirmar} onCancelar={onCancelar}
    >
      <p style={textoStyle}>
        Vas a eliminar {fotos(cantidad)} de forma permanente, junto con sus imágenes y resultados.
        Esta acción no se puede deshacer.
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
      titulo="Mover fotos" confirmar="Mover" deshabilitado={!destino}
      procesando={procesando} onConfirmar={() => onConfirmar(destino)} onCancelar={onCancelar}
    >
      <p style={textoStyle}>Las {fotos(cantidad)} seleccionadas pasarán al punto que elijas.</p>
      {esSuperAdmin && (
        <>
          <label htmlFor="mover-empresa" style={etiquetaStyle}>Afiliación</label>
          <select
            id="mover-empresa" value={empresaId} style={selectStyle}
            onChange={e => { setEmpresaId(e.target.value); setDestino(''); }}
          >
            <option value="">Elige una afiliación…</option>
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
