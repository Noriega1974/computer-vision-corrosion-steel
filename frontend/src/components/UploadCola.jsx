import React, { useEffect, useRef, useState } from 'react';
import { IconoAgregarImagen, IconoError, IconoEliminar, IconoFlechaAdelante, IconoFlechaAtras, IconoUbicacion } from './Iconos';
import NivelIcon from './NivelIcon';
import { nivelColor, nivelLabel } from '../lib/statusUtils';
import { formatoPct, etiquetaBase } from '../lib/textUtils';
import { LOTE_MAX } from '../hooks/useUploadLote';
import { paginar } from '../lib/gestorSubida';
import NotaPctAproximado from './NotaPctAproximado';

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
  if (it.estado === 'cola') return <span>{it.reintentando ? 'Reintentando en unos segundos' : 'En cola'}</span>;
  if (it.estado === 'subiendo') {
    return (
      <span>
        Subiendo <span style={numStyle}>{it.progreso} %</span>
        {it.reintentando && ' · Reintentando'}
      </span>
    );
  }
  if (it.estado === 'analizando') {
    return (
      <span>
        Analizando · <SegundosAnalisis desde={it.inicioAnalisis} />
        {it.reintentando && ' · Reintentando'}
      </span>
    );
  }
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

// Thumbnail with its own object URL: created on mount and revoked on unmount,
// so only the rows on the visible page hold a preview in memory.
function Miniatura({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const estilo = { width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--bg-card)' };
  return url ? <img src={url} alt="" width={56} height={56} style={estilo} /> : <div aria-hidden="true" style={estilo} />;
}

// Queue for a batch upload (up to LOTE_MAX rows). Paged, FILAS_POR_PAGINA rows
// at a time, so a 1000-photo batch never renders 1000 rows or previews at once.
// The polite live region announces only per-row completion.
export default function UploadCola({ lote, onQuitar, onReintentar, onAgregar, onVerGaleria, onSubirMas }) {
  const { items, running, anuncio, iniciado, terminado, listos, errores } = lote;
  const resumenRef = useRef(null);
  const inputRef = useRef(null);
  const listaRef = useRef(null);
  const [paginaPedida, setPaginaPedida] = useState(0);
  const { filas, pagina, paginas, desde } = paginar(items, paginaPedida);

  // Move focus to the summary when the batch ends so keyboard/AT users land on the outcome.
  useEffect(() => { if (terminado) resumenRef.current?.focus(); }, [terminado]);

  const irAPagina = (n) => {
    setPaginaPedida(n);
    listaRef.current?.focus();
  };

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
            <button type="button" onClick={onSubirMas} style={btnSecondary}>Subir otro lote</button>
            <button type="button" onClick={onVerGaleria} style={btnPrimary}>Ver en la galería</button>
          </div>
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        marginBottom: 'var(--space-2)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
      }}>
        <span>
          <span style={numStyle}>{items.length}</span> {items.length === 1 ? 'imagen' : 'imágenes'} en el lote
          {paginas > 1 && <> · mostrando <span style={numStyle}>{desde + 1}</span>-<span style={numStyle}>{desde + filas.length}</span></>}
        </span>
      </div>

      <ul
        ref={listaRef}
        tabIndex={-1}
        aria-label={paginas > 1 ? `Imágenes del lote, página ${pagina + 1} de ${paginas}` : 'Imágenes del lote'}
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', outline: 'none' }}
      >
        {filas.map((it) => (
          <li key={it.id} style={{
            display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'wrap',
            padding: 10, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8,
          }}>
            <Miniatura file={it.file} />
            <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', padding: '3px 9px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                  fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 'var(--text-xs)',
                  color: 'var(--text-primary)', overflowWrap: 'anywhere',
                }}>
                  {it.nombre || it.file.name}
                </span>
              </div>
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

      {paginas > 1 && (
        <nav aria-label="Páginas del lote" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          marginTop: 'var(--space-3)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
        }}>
          <button type="button" onClick={() => irAPagina(pagina - 1)} disabled={pagina === 0}
            style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: pagina === 0 ? 0.5 : 1, cursor: pagina === 0 ? 'not-allowed' : 'pointer' }}>
            <IconoFlechaAtras size={14} aria-hidden="true" />
            Anterior
          </button>
          <span>Página <span style={numStyle}>{pagina + 1}</span> de <span style={numStyle}>{paginas}</span></span>
          <button type="button" onClick={() => irAPagina(pagina + 1)} disabled={pagina >= paginas - 1}
            style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: pagina >= paginas - 1 ? 0.5 : 1, cursor: pagina >= paginas - 1 ? 'not-allowed' : 'pointer' }}>
            Siguiente
            <IconoFlechaAdelante size={14} aria-hidden="true" />
          </button>
        </nav>
      )}

      {listos > 0 && (
        <NotaPctAproximado style={{ marginTop: 'var(--space-3)' }} />
      )}

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
