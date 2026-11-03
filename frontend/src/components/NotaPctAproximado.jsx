import React from 'react';
import { Link } from 'react-router-dom';
import { IconoInfo } from './Iconos';

// El porcentaje de área corroída depende del encuadre de la foto, aunque se
// mida sobre la placa; esta nota breve acompaña el resultado y enlaza a la
// explicación con ejemplo real en "¿Qué es PixelRust?". Es el único sitio con
// este texto: Upload, la cola de lote y la ficha usan este componente.
export const TEXTO_PCT_APROXIMADO =
  'Valor aproximado: depende del encuadre de la foto y no reemplaza una inspección en sitio.';

export default function NotaPctAproximado({ align = 'left', mostrarEnlace = true, style }) {
  return (
    <p
      style={{
        margin: 0,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        textAlign: align,
        fontSize: 12,
        lineHeight: 1.5,
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-ui)',
        ...style,
      }}
    >
      <IconoInfo size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <span>
        {TEXTO_PCT_APROXIMADO}
        {mostrarEnlace && (
          <>
            {' '}
            <Link
              to="/que-es-pixelrust#como-se-calcula"
              style={{
                color: 'var(--accent-amber)',
                fontWeight: 600,
                textUnderlineOffset: 3,
              }}
            >
              ¿Cómo se calcula?
            </Link>
          </>
        )}
      </span>
    </p>
  );
}
