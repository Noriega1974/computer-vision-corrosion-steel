import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconoCheck, IconoCerrar, IconoSubir } from './Iconos';
import { useUploadManager } from '../hooks/UploadManagerContext';
import ConfirmDialog from './ConfirmDialog';

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
// `onDescartar` replaces the default discard (limpiar) when the page keeps extra state.
export default function BarraProgresoSubida({ enlaceNuevaMedicion = false, onDescartar, style }) {
  const { iniciado, running, deteniendo, sesion, progreso, avisoCerrado, reanudar, detener, cerrarAviso, limpiar } = useUploadManager();
  const [confirmando, setConfirmando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  // The stop dialog only makes sense while running; drop it when the run ends on its own.
  useEffect(() => { if (!running) setConfirmando(false); }, [running]);
  if (!iniciado || avisoCerrado) return null;

  const { total, completadas, fallidas, inciertas, detenidas, reanudables, porcentaje } = progreso;
  const textoAvance = `${completadas} de ${total} imágenes (${porcentaje} %)`;
  const detenida = !running && detenidas > 0;
  const terminadoOk = !running && fallidas === 0 && reanudables === 0 && inciertas === 0 && total > 0;
  const conError = !running && !detenida && fallidas > 0;
  const titulo = running
    ? (deteniendo ? 'Deteniendo la subida' : (sesion?.loteId ? 'Analizando el lote' : 'Analizando las imágenes'))
    : detenida ? 'Subida detenida'
    : (fallidas > 0 || reanudables > 0 ? 'Subida con imágenes pendientes' : (sesion?.loteId ? 'Lote analizado' : 'Imágenes analizadas'));
  const claseRelleno = `subida-barra__relleno${running ? ' subida-barra__relleno--activo subida-barra__relleno--rayas' : ''}${terminadoOk ? ' subida-barra__relleno--ok' : ''}${conError ? ' subida-barra__relleno--error' : ''}${detenida ? ' subida-barra__relleno--detenida' : ''}`;
  const clasePunto = `subida-punto${running ? ' subida-punto--activo' : ''}${terminadoOk ? ' subida-punto--ok' : ''}${conError ? ' subida-punto--error' : ''}${detenida ? ' subida-punto--detenida' : ''}`;

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
            {detenidas > 0 && <> · <span style={numStyle}>{detenidas}</span> {detenidas === 1 ? 'pendiente' : 'pendientes'}</>}
            {fallidas > 0 && <> · <span style={numStyle}>{fallidas}</span> con error</>}
            {sesion?.bloqueNombre && <> · {sesion.bloqueNombre}</>}
          </div>
        </div>
        {(enlaceNuevaMedicion || running || (!running && reanudables > 0) || detenida) && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {running && (
              <button
                type="button"
                className="subida-accion"
                disabled={deteniendo}
                onClick={() => setConfirmando(true)}
                style={{ ...btnBase, background: 'var(--bg-inset)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
              >
                {deteniendo ? 'Deteniendo…' : 'Detener'}
              </button>
            )}
            {!running && reanudables > 0 && (
              <button
                type="button"
                className="subida-accion"
                onClick={reanudar}
                style={{ ...btnBase, background: 'var(--accent-amber)', border: 'none', color: 'white' }}
              >
                {detenida
                  ? 'Reanudar pendientes'
                  : (reanudables === 1 ? 'Reanudar la imagen faltante' : `Reanudar las ${reanudables} faltantes`)}
              </button>
            )}
            {detenida && (
              <button
                type="button"
                className="subida-accion"
                onClick={() => setDescartando(true)}
                style={{ ...btnBase, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
              >
                Descartar pendientes
              </button>
            )}
            {enlaceNuevaMedicion && (
              <Link
                to="/upload"
                className="subida-accion"
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
        {!running && !detenida && (
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

      {running && !deteniendo && (
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          Puedes seguir navegando mientras termina el análisis. No cierres esta pestaña.
        </div>
      )}
      {running && deteniendo && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          Las fotos que ya se están analizando terminan; las demás quedan pendientes.
        </div>
      )}
      {detenida && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          Las fotos analizadas se conservan. Las pendientes no se subirán hasta que las reanudes.
        </div>
      )}
      {!running && inciertas > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          <span style={numStyle}>{inciertas}</span> {inciertas === 1 ? 'imagen no se confirmó' : 'imágenes no se confirmaron'}: revisa la galería antes de reintentarlas una por una desde Nueva medición, para no duplicarlas.
        </div>
      )}

      {confirmando && running && (
        <ConfirmDialog
          title="Detener la subida"
          message="Se detendrá la subida. Las fotos ya analizadas se conservan; las pendientes no se subirán."
          confirmLabel="Detener"
          cancelLabel="Seguir subiendo"
          tone="danger"
          onConfirm={() => { setConfirmando(false); detener(); }}
          onCancel={() => setConfirmando(false)}
        />
      )}

      {descartando && !running && (
        <ConfirmDialog
          title="Descartar las fotos pendientes"
          message={`${detenidas === 1 ? 'La foto pendiente no se subirá' : `Las ${detenidas} fotos pendientes no se subirán`}. Las fotos ya analizadas se conservan en la galería.`}
          confirmLabel="Descartar"
          cancelLabel="Volver"
          tone="danger"
          onConfirm={() => { setDescartando(false); (onDescartar ?? limpiar)(); }}
          onCancel={() => setDescartando(false)}
        />
      )}

      {/* Announces only the end of a run, never the moving percentage. */}
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {running ? '' : `${detenida ? 'Subida detenida' : 'Subida terminada'}: ${completadas} de ${total} imágenes analizadas${fallidas ? `, ${fallidas} con error` : ''}.`}
      </span>
    </section>
  );
}
