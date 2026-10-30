import React, { useEffect, useRef, useState } from 'react';
import { IconoAgregarImagen, IconoError, IconoEliminar, IconoUbicacion } from './Iconos';
import NivelIcon from './NivelIcon';
import { nivelColor, nivelLabel } from '../lib/statusUtils';
import { formatoPct, etiquetaBase } from '../lib/textUtils';
import { LOTE_MAX, NOMBRE_MAX } from '../hooks/useUploadLote';

const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
};
const numStyle = { fontVariantNumeric: 'tabular-nums' };
const btnBase = {
  padding: '8px 14px', borderRadius: 8, fontFamily: 'var(--font-ui)',
  fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer',
};
const btnSecondary = {
  ...btnBase, background: 'var(--bg-inset)', border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
};
const btnPrimary = { ...btnBase, background: 'var(--accent-amber)', border: 'none', color: 'white' };

// Elapsed seconds while the server analyzes one photo. The interval exists
// only while this row is in the analyzing state.
function SegundosAnalisis({ desde }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const tick = () => setS(Math.max(0, Math.floor((Date.now() - desde) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [desde]);
  return <span style={numStyle}>{s} s</span>;
}

function EstadoFila({ it, ocupado, onReintentar }) {
  if (it.estado === 'cola') return <span>En cola</span>;
  if (it.estado === 'subiendo') return <span>Subiendo <span style={numStyle}>{it.progreso} %</span></span>;
  if (it.estado === 'analizando') return <span>Analizando · <SegundosAnalisis desde={it.inicioAnalisis} /></span>;
  if (it.estado === 'listo') {
    const r = it.resultado ?? {};
    const nivel = r.nivel_corrosion;
    const color = nivel == null ? 'var(--text-primary)' : nivelColor(nivel);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}>
        {nivel != null && <NivelIcon nivel={nivel} size={18} color={color} />}
        <span>
          Listo{nivel != null && <> · <strong>{nivelLabel(nivel)}</strong></>}
          {r.area_corroida_pct != null && <> · <span style={numStyle}>{formatoPct(r.area_corroida_pct)}</span> {etiquetaBase(r)}</>}
        </span>
      </span>
    );
  }
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6, color: 'var(--accent-red)' }}>
        <IconoError size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Error: {it.error}</span>
      </span>
      <button type="button" disabled={ocupado} onClick={onReintentar}
        style={{ ...btnSecondary, padding: '5px 12px', opacity: ocupado ? 0.6 : 1, cursor: ocupado ? 'not-allowed' : 'pointer' }}>
        Reintentar
      </button>
    </span>
  );
}

// Queue for a multi-photo upload. A list of rows (thumbnail, name, GPS badge,
// text status); the polite live region announces only per-row completion.
export default function UploadCola({ lote, onQuitar, onReintentar, onAgregar, onVerGaleria, onSubirMas }) {
  const { items, running, anuncio, iniciado, terminado, listos, errores } = lote;
  const resumenRef = useRef(null);
  const inputRef = useRef(null);

  // Move focus to the summary when the batch ends so keyboard/AT users land on the outcome.
  useEffect(() => { if (terminado) resumenRef.current?.focus(); }, [terminado]);

  return (
    <div>
      {terminado && (
        <div style={{
          marginBottom: 'var(--space-3)', padding: '14px 16px', background: 'var(--bg-inset)',
          border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <h3 ref={resumenRef} tabIndex={-1} style={{
            margin: 0, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)',
          }}>
            <span style={numStyle}>{listos}</span> de <span style={numStyle}>{items.length}</span> imágenes analizadas
            {errores > 0 && <> · <span style={numStyle}>{errores}</span> con error</>}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button type="button" onClick={onSubirMas} style={btnSecondary}>Subir más imágenes</button>
            <button type="button" onClick={onVerGaleria} style={btnPrimary}>Ver en la galería</button>
          </div>
        </div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {items.map((it, i) => (
          <li key={it.id} style={{
            display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'wrap',
            padding: 10, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8,
          }}>
            <img src={it.previewUrl} alt="" width={56} height={56}
              style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
            <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {it.estado === 'cola' && !iniciado ? (
                <>
                  <label htmlFor={`cola-nombre-${it.id}`} style={visuallyHidden}>Nombre de la imagen {i + 1}</label>
                  <input
                    id={`cola-nombre-${it.id}`} type="text" value={it.nombre} maxLength={NOMBRE_MAX}
                    autoComplete="off" placeholder="Nombre de la foto"
                    onChange={(e) => lote.renombrar(it.id, e.target.value)}
                    style={{
                      width: '100%', padding: '8px 10px', background: 'var(--bg-card)',
                      border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)',
                      fontFamily: 'var(--font-ui)', fontSize: 14,
                    }}
                  />
                </>
              ) : (
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                  {it.nombre || it.file.name}
                </div>
              )}
              {it.gps && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-2xs)', color: 'var(--accent-green)' }}>
                  <IconoUbicacion size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                  GPS detectado
                </span>
              )}
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                <EstadoFila it={it} ocupado={running} onReintentar={() => onReintentar(it.id)} />
              </div>
            </div>
            {!iniciado && (
              <button type="button" onClick={() => onQuitar(it.id)}
                aria-label={`Quitar ${it.nombre || it.file.name} de la lista`}
                style={{ ...btnSecondary, padding: 8, display: 'inline-flex', flexShrink: 0 }}>
                <IconoEliminar size={16} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {!iniciado && items.length < LOTE_MAX && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <button type="button" onClick={() => inputRef.current?.click()}
            style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <IconoAgregarImagen size={16} aria-hidden="true" />
            Agregar más imágenes
          </button>
          <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png" tabIndex={-1}
            style={{ display: 'none' }}
            onChange={(e) => { onAgregar(e.target.files); e.target.value = ''; }} />
        </div>
      )}

      {/* Announces only per-row completion, never progress ticks. */}
      <span aria-live="polite" role="status" style={visuallyHidden}>{anuncio}</span>
    </div>
  );
}
