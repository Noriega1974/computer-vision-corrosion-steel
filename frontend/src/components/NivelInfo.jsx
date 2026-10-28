import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconoInfo } from './Iconos';
import { NIVELES, nivelColor } from '../lib/statusUtils';

const ANCHO = 240;
const MARGEN = 8;
const SEPARACION = 6;
// Above Leaflet panes/controls (up to ~1000) and the app's own overlays.
const Z_POPOVER = 2000;

// Stops the event from reaching ancestors (e.g. the Leaflet map container).
const aislar = (e) => e.stopPropagation();

// Small "i" button that opens a popover with the ISO 10289 level table.
// `nivel` (0-3) optionally highlights the level of the current measurement.
export default function NivelInfo({ nivel, color }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, ancho: ANCHO });
  const botonRef = useRef(null);
  const popRef = useRef(null);
  const id = useId();

  const reposicionar = useCallback(() => {
    const btn = botonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const ancho = Math.min(ANCHO, window.innerWidth - MARGEN * 2);
    const left = Math.min(
      Math.max(r.left + r.width / 2 - ancho / 2, MARGEN),
      window.innerWidth - ancho - MARGEN,
    );
    let top = r.bottom + SEPARACION;
    const alto = popRef.current?.offsetHeight ?? 0;
    // Flip above the button only when it would overflow below and fits above.
    if (alto && top + alto > window.innerHeight - MARGEN && r.top - SEPARACION - alto >= MARGEN) {
      top = r.top - SEPARACION - alto;
    }
    setPos({ top, left, ancho });
  }, []);

  useLayoutEffect(() => {
    if (abierto) reposicionar();
  }, [abierto, reposicionar]);

  useEffect(() => {
    if (!abierto) return undefined;
    const alPresionar = (e) => {
      if (botonRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setAbierto(false);
    };
    const alTeclear = (e) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        botonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', alPresionar);
    document.addEventListener('keydown', alTeclear);
    window.addEventListener('resize', reposicionar);
    window.addEventListener('scroll', reposicionar, true);
    return () => {
      document.removeEventListener('pointerdown', alPresionar);
      document.removeEventListener('keydown', alTeclear);
      window.removeEventListener('resize', reposicionar);
      window.removeEventListener('scroll', reposicionar, true);
    };
  }, [abierto, reposicionar]);

  const nivelValido = Number.isInteger(nivel) && nivel >= 0 && nivel < NIVELES.length;

  return (
    <span
      style={{ display: 'inline-flex', verticalAlign: 'middle' }}
      onClick={aislar}
      onDoubleClick={aislar}
      onMouseDown={aislar}
      onPointerDown={aislar}
      onTouchStart={aislar}
    >
      <button
        ref={botonRef}
        type="button"
        aria-label="Qué significa el nivel"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto(a => !a)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: 7, margin: -7, border: 'none', background: 'transparent',
          color: color ?? 'var(--text-muted)', cursor: 'pointer', borderRadius: '50%',
          lineHeight: 0,
        }}
      >
        <IconoInfo size={14} />
      </button>

      {abierto && createPortal(
        <div
          ref={popRef}
          id={id}
          role="region"
          aria-label="Nivel según ISO 10289"
          className="nivel-info-popover"
          onClick={aislar}
          onDoubleClick={aislar}
          onMouseDown={aislar}
          onPointerDown={aislar}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.ancho,
            zIndex: Z_POPOVER, boxSizing: 'border-box', padding: '12px 14px',
            background: 'var(--bg-card-solid)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: 'var(--shadow-md)',
            fontFamily: 'var(--font-ui)', textAlign: 'left', fontWeight: 400,
            letterSpacing: 'normal', textTransform: 'none',
          }}
        >
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            Nivel según ISO 10289
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, marginBottom: 10 }}>
            Porcentaje del área con corrosión
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {NIVELES.map((n, i) => {
              const actual = nivelValido && i === nivel;
              return (
                <li key={n.status} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8, height: 8, borderRadius: '50%', background: nivelColor(i),
                      flexShrink: 0, marginTop: 5,
                    }}
                  />
                  <span style={{
                    fontSize: 'var(--text-xs)', color: 'var(--text-primary)',
                    fontWeight: actual ? 700 : 400, lineHeight: 1.4,
                  }}>
                    {n.label}
                    <span style={{ color: 'var(--text-muted)', fontWeight: actual ? 600 : 400 }}>
                      {' '}{n.range}{actual ? ' · esta medición' : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </span>
  );
}
