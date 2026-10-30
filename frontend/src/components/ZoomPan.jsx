import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IconoAgregar, IconoEnfocar, IconoQuitar } from './Iconos';
import { ZOOM_MAX, ZOOM_MIN, VISTA_INICIAL, desplazar, factorRueda, limitarVista, zoomEnPunto } from '../lib/zoomPan';

const PASO_BOTON = 1.5;

const botonStyle = {
  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-card-solid)', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', cursor: 'pointer', padding: 0,
};

/**
 * Marco con zoom y desplazamiento para la foto de la medición.
 *
 * El contenido (foto + máscaras + contorno de la placa) vive en UNA capa que
 * recibe el `transform`, así que todo se acerca junto y nunca se desalinea.
 *  - Botones + / − / restablecer (misma apariencia que los controles del mapa).
 *  - Ctrl + rueda (o pellizco de trackpad) acerca hacia el cursor; la rueda sin
 *    Ctrl sigue desplazando la página.
 *  - Con zoom, arrastrar con el mouse o el dedo desplaza; dos dedos pellizcan.
 *
 * Controlado: `vista` y `onVista` los guarda quien lo usa, para que el nivel de
 * zoom se conserve al cambiar entre las pestañas Original y Segmentación.
 * `children` recibe el zoom actual (función) o se pasa tal cual.
 */
export default function ZoomPan({ vista, onVista, style, children }) {
  const marcoRef = useRef(null);
  const [tam, setTam] = useState({ W: 0, H: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const punteros = useRef(new Map());   // pointerId -> {x, y} (coordenadas de pantalla)
  const gesto = useRef(null);           // pellizco: distancia inicial
  const vistaRef = useRef(vista);
  const v = tam.W ? limitarVista(vista, tam.W, tam.H) : vista;
  vistaRef.current = v;

  useEffect(() => {
    const el = marcoRef.current;
    if (!el) return undefined;
    const medir = () => setTam({ W: el.clientWidth, H: el.clientHeight });
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const aplicar = useCallback((fn) => onVista(fn(vistaRef.current)), [onVista]);

  // Ctrl + rueda: listener NO pasivo para poder cancelar el zoom de la página.
  // Sin Ctrl no se hace nada y la página sigue desplazándose.
  useEffect(() => {
    const el = marcoRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      aplicar(a => zoomEnPunto(a, factorRueda(e.deltaY, e.deltaMode), e.clientX - r.left, e.clientY - r.top, el.clientWidth, el.clientHeight));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [aplicar]);

  const centro = () => ({ x: tam.W / 2, y: tam.H / 2 });
  const zoomBoton = (factor) => {
    const c = centro();
    aplicar(a => zoomEnPunto(a, factor, c.x, c.y, tam.W, tam.H));
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      gesto.current = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }
    if (vistaRef.current.z > ZOOM_MIN) setArrastrando(true);
  };

  const onPointerMove = (e) => {
    const previo = punteros.current.get(e.pointerId);
    if (!previo) return;
    const actual = { x: e.clientX, y: e.clientY };
    punteros.current.set(e.pointerId, actual);
    const r = marcoRef.current.getBoundingClientRect();
    if (punteros.current.size >= 2) {
      const [a, b] = [...punteros.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      // Sin referencia (p. ej. tras soltar un tercer dedo) solo se toma la base.
      const factor = gesto.current ? dist / gesto.current : 1;
      gesto.current = dist;
      const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      aplicar(s => zoomEnPunto(s, factor, cx, cy, tam.W, tam.H));
    } else if (vistaRef.current.z > ZOOM_MIN) {
      aplicar(s => desplazar(s, actual.x - previo.x, actual.y - previo.y, tam.W, tam.H));
    }
  };

  const soltar = (e) => {
    punteros.current.delete(e.pointerId);
    // Si siguen dos o más dedos, la distancia de referencia se toma de ellos.
    const quedan = [...punteros.current.values()];
    gesto.current = quedan.length >= 2
      ? Math.hypot(quedan[0].x - quedan[1].x, quedan[0].y - quedan[1].y) || 1
      : null;
    if (punteros.current.size === 0) setArrastrando(false);
  };

  const sinGesto = (e) => e.stopPropagation();  // los botones no inician arrastre
  const puedeAcercar = v.z < ZOOM_MAX - 1e-6;
  const puedeAlejar = v.z > ZOOM_MIN + 1e-6;

  return (
    <div
      ref={marcoRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      style={{
        ...style,
        // Con zoom el dedo arrastra la foto; sin zoom la página sigue desplazándose.
        touchAction: v.z > ZOOM_MIN ? 'none' : 'pan-y',
        cursor: v.z > ZOOM_MIN ? (arrastrando ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, transformOrigin: '0 0',
        transform: `translate(${v.x}px, ${v.y}px) scale(${v.z})`,
        willChange: v.z > 1 ? 'transform' : undefined,
      }}>
        {typeof children === 'function' ? children(v.z) : children}
      </div>

      <div
        onPointerDown={sinGesto}
        style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', borderRadius: 6, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}
      >
        <button type="button" aria-label="Acercar" title="Acercar (Ctrl + rueda)" disabled={!puedeAcercar}
          onClick={() => zoomBoton(PASO_BOTON)} style={{ ...botonStyle, opacity: puedeAcercar ? 1 : 0.5, cursor: puedeAcercar ? 'pointer' : 'not-allowed' }}>
          <IconoAgregar size={16} />
        </button>
        <button type="button" aria-label="Alejar" title="Alejar" disabled={!puedeAlejar}
          onClick={() => zoomBoton(1 / PASO_BOTON)} style={{ ...botonStyle, borderTop: 'none', opacity: puedeAlejar ? 1 : 0.5, cursor: puedeAlejar ? 'pointer' : 'not-allowed' }}>
          <IconoQuitar size={16} />
        </button>
        <button type="button" aria-label="Restablecer zoom" title="Restablecer zoom" disabled={!puedeAlejar}
          onClick={() => onVista(VISTA_INICIAL)} style={{ ...botonStyle, borderTop: 'none', opacity: puedeAlejar ? 1 : 0.5, cursor: puedeAlejar ? 'pointer' : 'not-allowed' }}>
          <IconoEnfocar size={16} />
        </button>
      </div>

      {v.z === ZOOM_MIN && (
        <div aria-hidden="true" style={{
          position: 'absolute', left: 8, bottom: 8, pointerEvents: 'none',
          padding: '3px 8px', borderRadius: 999, fontFamily: 'var(--font-ui)', fontSize: 11,
          background: 'var(--bg-card-solid)', color: 'var(--text-muted)', border: '1px solid var(--border)',
        }}>
          Ctrl + rueda para acercar
        </div>
      )}
    </div>
  );
}
