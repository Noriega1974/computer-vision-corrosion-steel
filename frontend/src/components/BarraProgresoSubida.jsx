import React from 'react';
import { Link } from 'react-router-dom';
import { IconoCerrar, IconoSubir } from './Iconos';
import { useUploadManager } from '../hooks/UploadManagerContext';

const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
};
const numStyle = { fontVariantNumeric: 'tabular-nums' };
const btnBase = {
  padding: '7px 14px', borderRadius: 8, fontFamily: 'var(--font-ui)',
  fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer',
};

// Progress of the background batch upload. Shown on Nueva medición and at the
// top of the dashboard while a batch runs, and after it ends until closed.
// `enlaceNuevaMedicion` adds a link back to the upload page (dashboard only).
export default function BarraProgresoSubida({ enlaceNuevaMedicion = false, style }) {
  const { iniciado, running, sesion, progreso, avisoCerrado, reanudar, cerrarAviso } = useUploadManager();
  if (!iniciado || avisoCerrado) return null;

  const { total, completadas, fallidas, inciertas, reanudables, porcentaje } = progreso;
  const textoAvance = `${completadas} de ${total} imágenes (${porcentaje} %)`;
  const color = !running && fallidas > 0 ? 'var(--accent-red)' : 'var(--accent-amber)';
  const titulo = running
    ? 'Analizando el lote'
    : (fallidas > 0 || reanudables > 0 ? 'Lote con imágenes pendientes' : 'Lote analizado');

  return (
    <section
      aria-label="Progreso de la subida por lotes"
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '14px 16px', fontFamily: 'var(--font-ui)', display: 'flex', flexDirection: 'column',
        gap: 'var(--space-2)', ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            {titulo}
            {sesion?.loteNombre && (
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                {' · '}{sesion.loteNombre}
              </span>
            )}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
            <span style={numStyle}>{textoAvance}</span>
            {fallidas > 0 && <> · <span style={numStyle}>{fallidas}</span> con error</>}
            {sesion?.bloqueNombre && <> · {sesion.bloqueNombre}</>}
          </div>
        </div>
        {!running && (
          <button
            type="button"
            onClick={cerrarAviso}
            aria-label="Cerrar el aviso de la subida"
            style={{ display: 'flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
          >
            <IconoCerrar size={18} />
          </button>
        )}
      </div>

      <div
        role="progressbar"
        aria-label="Imágenes analizadas del lote"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completadas}
        aria-valuetext={textoAvance}
        style={{ height: 8, borderRadius: 999, background: 'var(--bg-inset)', overflow: 'hidden', border: '1px solid var(--border)' }}
      >
        <div style={{
          width: `${porcentaje}%`, height: '100%', background: color, borderRadius: 999,
          transition: 'width var(--dur-fast) var(--ease-out)',
        }} />
      </div>

      {running && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Puedes seguir navegando mientras termina el análisis. No cierres esta pestaña.
        </div>
      )}
      {!running && inciertas > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          <span style={numStyle}>{inciertas}</span> {inciertas === 1 ? 'imagen no se confirmó' : 'imágenes no se confirmaron'}: revisa la galería antes de reintentarlas una por una desde Nueva medición, para no duplicarlas.
        </div>
      )}

      {(enlaceNuevaMedicion || (!running && reanudables > 0)) && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {!running && reanudables > 0 && (
            <button
              type="button"
              onClick={reanudar}
              style={{ ...btnBase, background: 'var(--accent-amber)', border: 'none', color: 'white' }}
            >
              {reanudables === 1 ? 'Reanudar la imagen faltante' : `Reanudar las ${reanudables} faltantes`}
            </button>
          )}
          {enlaceNuevaMedicion && (
            <Link
              to="/upload"
              style={{
                ...btnBase, background: 'var(--bg-inset)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <IconoSubir size={14} />
              Ir a Nueva medición
            </Link>
          )}
        </div>
      )}

      {/* Announces only the end of a run, never the moving percentage. */}
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {running ? '' : `Subida terminada: ${completadas} de ${total} imágenes analizadas${fallidas ? `, ${fallidas} con error` : ''}.`}
      </span>
    </section>
  );
}
