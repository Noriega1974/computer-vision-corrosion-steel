import React, { useEffect, useRef, useState } from 'react';
import { IconoAgregarImagen, IconoError, IconoEliminar, IconoFlechaAdelante, IconoFlechaAtras } from './Iconos';
import { nivelColor, nivelLabel } from '../lib/statusUtils';
import { formatoPct, etiquetaBase } from '../lib/textUtils';
import { LOTE_MAX } from '../hooks/useUploadLote';
import { paginar } from '../lib/gestorSubida';
import NotaPctAproximado from './NotaPctAproximado';
import { Mosaico } from './Mosaico';
import { estadoTesteraSubida } from '../lib/mosaico';

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

// Preview with its own object URL: created on mount and revoked on unmount,
// so only the tiles on the visible page hold a preview in memory.
function Previa({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img className="mosaico-tile__img" src={url} alt="" decoding="async" loading="lazy" /> : null;
}

// One square tile of the queue: preview, status overlay and its actions.
function TesteraCola({ it, ocupado, iniciado, onQuitar, onReintentar }) {
  const nombre = it.nombre || it.file.name;
  const estado = it.estado;
  const r = it.resultado ?? {};
  const nivel = r.nivel_corrosion;
  const color = nivel == null ? 'var(--accent-green)' : nivelColor(nivel);
  const texto = estado === 'listo' && nivel != null
    ? `Listo, ${nivelLabel(nivel)}${r.area_corroida_pct != null ? `, ${formatoPct(r.area_corroida_pct)}` : ''}`
    : estado === 'error' ? `Error: ${it.error}` : estadoTesteraSubida(it);
  return (
    <div className="mosaico-tile" role="group" aria-label={`${nombre}: ${texto}`}>
      <Previa file={it.file} />
      {estado === 'listo' ? (
        <>
          <span className="mosaico-tile__punto" aria-hidden="true" style={{ background: color }} />
          <span className="mosaico-tile__pie">
            <span className="mosaico-tile__pct">
              {r.area_corroida_pct != null ? formatoPct(r.area_corroida_pct) : 'Listo'}
            </span>
            <span className="mosaico-tile__nombre">{nivel != null ? nivelLabel(nivel) : nombre}</span>
          </span>
        </>
      ) : estado === 'error' ? (
        <div className="mosaico-tile__estado mosaico-tile__estado--error" title={it.error}>
          <IconoError size={18} aria-hidden="true" />
          <span>Error</span>
        </div>
      ) : (
        <>
          <span className="mosaico-tile__pie">
            <span className="mosaico-tile__pct">{estadoTesteraSubida(it)}</span>
            <span className="mosaico-tile__nombre">{nombre}</span>
          </span>
          {estado === 'subiendo' && (
            <span className="mosaico-tile__barra" aria-hidden="true"><span style={{ width: `${it.progreso ?? 0}%` }} /></span>
          )}
          {estado === 'analizando' && <span className="mosaico-tile__barra mosaico-tile__barra--indet" aria-hidden="true"><span /></span>}
        </>
      )}
      {estado === 'error' && (
        <button type="button" disabled={ocupado} onClick={onReintentar}
          className="mosaico-tile__accion mosaico-tile__accion--reintentar"
          style={{ opacity: ocupado ? 0.6 : 1, cursor: ocupado ? 'not-allowed' : 'pointer' }}>
          Reintentar
        </button>
      )}
      {!iniciado && (
        <button type="button" onClick={onQuitar}
          aria-label={`Quitar ${nombre} de la lista`}
          className="mosaico-tile__accion mosaico-tile__accion--quitar">
          <IconoEliminar size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
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

      <Mosaico
        ref={listaRef}
        tabIndex={-1}
        altoMax={420}
        label={paginas > 1 ? `Imágenes del lote, página ${pagina + 1} de ${paginas}` : 'Imágenes del lote'}
        style={{ outline: 'none' }}
      >
        {filas.map((it) => (
          <TesteraCola
            key={it.id}
            it={it}
            ocupado={running}
            iniciado={iniciado}
            onQuitar={() => onQuitar(it.id)}
            onReintentar={() => onReintentar(it.id)}
          />
        ))}
      </Mosaico>

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
