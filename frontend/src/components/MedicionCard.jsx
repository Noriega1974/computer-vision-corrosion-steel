import { CARD_TITULO_STYLE, CARD_SUBTITULO_STYLE, CARD_PILDORA_STYLE } from './cardTextStyles';
import React from 'react';
import { Link } from 'react-router-dom';
import { IconoCasilla, IconoCasillaMarcada, IconoError } from './Iconos';
import NivelIcon from './NivelIcon';
import { nivelColor, nivelLabel } from '../lib/statusUtils';
import { formatFecha } from '../utils/dateFormat';
import { formatoPct, etiquetaBase } from '../lib/textUtils';
import { tiempoRelativo } from '../lib/tiempoRelativo';

// ─── Card de galería (patrón Flashcard) ──────────────────────────────────────
// `contexto` (opcional): texto que antecede a la fecha en el subtítulo, p. ej.
// "Empresa · Punto" en los resultados de búsqueda; por defecto el punto, solo si
// la foto tiene nombre propio (el nombre pasa a ser el título).
// `seleccion` (opcional): { marcada, onToggle } en modo selección. La tarjeta
// deja de navegar, muestra una casilla y un clic alterna la selección.
export default function MedicionCard({ medicion, to, state, contexto, seleccion }) {
  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const nombrePunto = medicion.bloque_nombre ?? 'Sin punto asignado';
  // Si la foto tiene nombre, es el título y el punto pasa al subtítulo.
  const titulo = medicion.nombre || nombrePunto;
  const prefijo = contexto ?? (medicion.nombre ? nombrePunto : '');

  return (
    <Link
      to={to}
      state={state}
      className="medicion-card"
      role={seleccion ? 'checkbox' : undefined}
      aria-checked={seleccion ? seleccion.marcada : undefined}
      onClick={seleccion ? (e) => { e.preventDefault(); seleccion.onToggle(); } : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 14,
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        ...(seleccion?.marcada
          ? { border: '1px solid var(--accent-amber)', boxShadow: '0 0 0 2px var(--accent-amber)' }
          : { boxShadow: 'var(--shadow-sm)' }),
      }}
    >
      {seleccion && (
        <span aria-hidden="true" style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2, display: 'flex',
          padding: 3, borderRadius: 6, background: 'var(--bg-card-solid)', border: '1px solid var(--border-strong)',
          color: seleccion.marcada ? 'var(--accent-amber)' : 'var(--text-faint)',
        }}>
          {seleccion.marcada ? <IconoCasillaMarcada size={20} /> : <IconoCasilla size={20} />}
        </span>
      )}

      {/* 1. Cabecera: Título en negrita + subtítulo suave */}
      <div>
        <div style={{ ...CARD_TITULO_STYLE, color: 'var(--text-primary)' }}>
          {titulo}
        </div>
        <div style={{ ...CARD_SUBTITULO_STYLE, color: 'var(--text-muted)' }}>
          {prefijo ? `${prefijo} · ` : ''}{tiempoRelativo(medicion.timestamp, { vacio: '—', formatFecha })}
        </div>
      </div>

      {/* 2. Imagen encuadrada con bordes redondeados */}
      <div style={{
        height: 164, background: 'var(--bg-inset)',
        borderRadius: 10, border: '1px solid var(--border)',
        position: 'relative', overflow: 'hidden',
      }}>
        {medicion.url_imagen ? (
          <img
            src={medicion.url_thumbnail || medicion.url_imagen}
            alt="Medición"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
          }}>
            <IconoError size={28} style={{ color: 'var(--text-faint)' }} />
            <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-data)' }}>
              Sin imagen
            </span>
          </div>
        )}

        {/* Barra de progreso al pie de la imagen */}
        {medicion.area_corroida_pct != null && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
            background: 'rgba(0,0,0,0.35)',
          }}>
            <div style={{
              height: '100%',
              width: '100%',
              transformOrigin: 'left center',
              transform: `scaleX(${Math.min(100, medicion.area_corroida_pct) / 100})`,
              background: color,
              transition: 'transform 0.28s ease-out',
            }} />
          </div>
        )}
      </div>

      {/* 3. Pie: métrica grande + estado a la izquierda, botón píldora CTA a la derecha */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 10, marginTop: 2,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 18,
            color: 'var(--text-primary)', lineHeight: 1.05, letterSpacing: '-0.02em', whiteSpace: 'nowrap',
          }}>
            <span className="sr-only-pw">Área corroída </span>
            {formatoPct(medicion.area_corroida_pct)}
          </div>
          <div style={{
            fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 11, color: 'var(--text-muted)',
            marginTop: 2, whiteSpace: 'nowrap',
          }}>
            {etiquetaBase(medicion)}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
            fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600,
          }}>
            <NivelIcon nivel={nivel} size={20} color={color} />
            <span>{nivelLabel(nivel)}</span>
          </div>
        </div>

        <span style={{
          ...CARD_PILDORA_STYLE,
          background: 'var(--text-primary)', color: 'var(--bg-card-solid)',
        }}>
          Ver detalle
        </span>
      </div>
    </Link>
  );
}
