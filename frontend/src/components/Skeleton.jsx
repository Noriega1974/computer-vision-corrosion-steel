import React from 'react';

/**
 * Bloque de carga con la forma del contenido que va a aparecer.
 *
 * Es decorativo: va con aria-hidden. El contenedor que lo agrupa debe llevar
 * aria-busy="true". El brillo y el color viven en .skeleton (index.css) para
 * que sigan el tema claro/oscuro y respeten prefers-reduced-motion.
 *
 * Para IMAGENES, graficos y mapas: alto fijo igual al del contenedor real.
 * Para TEXTO usa SkeletonLinea (el alto lo pone la tipografia, no el bloque).
 */
export default function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
  className = '',
}) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`.trim()}
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

/**
 * Barra que reemplaza una linea de texto SIN cambiar la altura de la linea.
 *
 * Va DENTRO del mismo elemento (misma fuente, line-height, margenes) que
 * tendra el texto real: la barra es inline-block de ~0.75em, centrada
 * verticalmente, asi que el alto de la linea lo da el line-height real y no la
 * barra. El ancho es aproximado; el alto exacto.
 *
 *   <div style={estiloDelTitulo}><SkeletonLinea width="60%" /></div>
 */
export function SkeletonLinea({ width = '60%', style }) {
  return (
    <span
      aria-hidden="true"
      className="skeleton"
      style={{
        display: 'inline-block',
        width,
        maxWidth: '100%',
        height: '0.75em',
        verticalAlign: 'middle',
        borderRadius: 999,
        ...style,
      }}
    />
  );
}

/**
 * Caja pintada (boton, pildora) cuyo alto sale de su padding + tipografia, igual
 * que la real: pasa en `style` el mismo padding/fontSize/lineHeight/radius.
 */
export function SkeletonCaja({ width = 40, style }) {
  return (
    <span
      aria-hidden="true"
      className="skeleton"
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
    >
      <span style={{ display: 'inline-block', width, height: '0.75em', verticalAlign: 'middle' }} />
    </span>
  );
}
