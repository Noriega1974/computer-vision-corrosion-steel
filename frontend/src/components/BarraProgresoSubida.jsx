import React from 'react';
import { Link } from 'react-router-dom';
import { IconoCheck, IconoCerrar, IconoSubir } from './Iconos';
import { useUploadManager } from '../hooks/UploadManagerContext';

const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
};
const numStyle = { fontVariantNumeric: 'tabular-nums' };
const btnBase = {
  padding: '5px 12px', borderRadius: 8, fontFamily: 'var(--font-ui)',
  fontWeight: 600, fontSize: 'var(--text-xs)', cursor: 'pointer',
};

// Progress of the background batch upload. Shown on Nueva medición and at the
// top of the dashboard while a batch runs, and after it ends until closed.
// `enlaceNuevaMedicion` adds a link back to the upload page (dashboard only).
export default function BarraProgresoSubida({ enlaceNuevaMedicion = false, style }) {
  const { iniciado, running, sesion, progreso, avisoCerrado, reanudar, cerrarAviso } = useUploadManager();
  if (!iniciado || avisoCerrado) return null;

  const { total, completadas, fallidas, inciertas, reanudables, porcentaje } = progreso;
  const textoAvance = `${completadas} de ${total} imágenes (${porcentaje} %)`;
  const terminadoOk = !running && fallidas === 0 && reanudables === 0 && inciertas === 0 && total > 0;
  const conError = !running && fallidas > 0;
  const titulo = running
    ? (sesion?.loteId ? 'Analizando el lote' : 'Analizando las imágenes')
    : (fallidas > 0 || reanudables > 0 ? 'Subida con imágenes pendientes' : (sesion?.loteId ? 'Lote analizado' : 'Imágenes analizadas'));
  const claseRelleno = `subida-barra__relleno${running ? ' subida-barra__relleno--activo subida-barra__relleno--rayas' : ''}${terminadoOk ? ' subida-barra__relleno--ok' : ''}${conError ? ' subida-barra__relleno--error' : ''}`;
  const clasePunto = `subida-punto${running ? ' subida-punto--activo' : ''}${terminadoOk ? ' subida-punto--ok' : ''}${conError ? ' subida-punto--error' : ''}`;

  return (
    <section
      aria-label="Progreso de la subida"
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '8px 12px', fontFamily: 'var(--font-ui)', display: 'flex', flexDirection: 'column',
        gap: 6, ...style,
      }}
    >
      <div className="subida-tarjeta">
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span className={clasePunto} aria-hidden="true" />
            {terminadoOk && <IconoCheck size={15} aria-hidden="true" style={{ color: 'var(--accent-green)' }} />}
            <span>{titulo}</span>
            {sesion?.loteNombre && (
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                {' · '}{sesion.loteNombre}
              </span>
            )}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 1 }}>
            <span style={numStyle}>{textoAvance}</span>
            {fallidas > 0 && <> · <span style={numStyle}>{fallidas}</span> con error</>}
            {sesion?.bloqueNombre && <> · {sesion.bloqueNombre}</>}
          </div>
        </div>
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
        className="subida-barra"
        role="progressbar"
        aria-label="Imágenes analizadas"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completadas}
        aria-valuetext={textoAvance}
      >
        <div className={claseRelleno} style={{ width: `${porcentaje}%` }} />
      </div>

      {running && (
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          Puedes seguir navegando mientras termina el análisis. No cierres esta pestaña.
        </div>
      )}
      {!running && inciertas > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          <span style={numStyle}>{inciertas}</span> {inciertas === 1 ? 'imagen no se confirmó' : 'imágenes no se confirmaron'}: revisa la galería antes de reintentarlas una por una desde Nueva medición, para no duplicarlas.
        </div>
      )}

      {/* Announces only the end of a run, never the moving percentage. */}
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {running ? '' : `Subida terminada: ${completadas} de ${total} imágenes analizadas${fallidas ? `, ${fallidas} con error` : ''}.`}
      </span>
    </section>
  );
}
