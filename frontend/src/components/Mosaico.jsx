import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconoCamara, IconoMoverACarpeta } from './Iconos';
import { nivelColor, nivelLabel } from '../lib/statusUtils';
import { formatFecha } from '../utils/dateFormat';
import {
  destinoMedicion, etiquetaTestera, etiquetaTesteraLote, miniaturaDe, nombreCorto, textoPctMedicion,
} from '../lib/mosaico';

// Contenedor de la cuadrícula: alto máximo definido con scroll interno.
// `ancho` usa casillas más grandes (~140px) para áreas amplias.
export const Mosaico = React.forwardRef(function Mosaico({ children, ancho = false, altoMax = 300, sinTope = false, label, style, ...resto }, ref) {
  return (
    <div
      ref={ref}
      className={`mosaico${ancho ? ' mosaico--ancho' : ''}${sinTope ? ' mosaico--sin-tope' : ''}`}
      style={{ '--mosaico-alto': `${altoMax}px`, ...style }}
      role="group"
      aria-label={label}
      {...resto}
    >
      {children}
    </div>
  );
});

function Imagen({ src, alt = '' }) {
  const [fallo, setFallo] = useState(false);
  if (!src || fallo) return null;
  return <img className="mosaico-tile__img" src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFallo(true)} />;
}

// Hora local corta (HH:mm) del timestamp, tomada del formato elegido por el usuario.
function horaCorta(ts) {
  const t = formatFecha(ts, { conHora: true });
  return /\d{2}:\d{2}$/.test(t) ? t.slice(-5) : '';
}

// Casilla de una foto: miniatura cuadrada, punto de nivel, % y nombre corto.
// Navega al detalle de la foto en la galería.
export function TesteraFoto({ medicion, idPunto, mostrarFecha = false, subtitulo = null, etiquetaDia = null }) {
  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const src = miniaturaDe(medicion);
  const fecha = formatFecha(medicion.timestamp, { conHora: true });
  const to = destinoMedicion(medicion, idPunto);
  const label = `${etiquetaTestera(medicion, fecha)}`;
  const contenido = (
    <>
      {src ? <Imagen src={src} /> : (
        <span className="mosaico-tile__vacio" aria-hidden="true"><IconoCamara size={22} /></span>
      )}
      <span className="mosaico-tile__punto" aria-hidden="true" style={{ background: color }} title={nivelLabel(nivel)} />
      {etiquetaDia && <span className="mosaico-tile__dia">{etiquetaDia}</span>}
      <span className="mosaico-tile__pie">
        <span className="mosaico-tile__pct">{textoPctMedicion(medicion)}</span>
        <span className="mosaico-tile__nombre">
          {subtitulo ?? (mostrarFecha ? fecha : nombreCorto(medicion, horaCorta(medicion.timestamp)))}
        </span>
      </span>
    </>
  );
  if (!to) {
    return <div className="mosaico-tile" role="img" aria-label={label}>{contenido}</div>;
  }
  return (
    <Link to={to} className="mosaico-tile" aria-label={`Ver foto: ${label}`}>{contenido}</Link>
  );
}

// Casilla de un lote: portada, nombre, cantidad y peor nivel. Abre/cierra su contenido.
export function TesteraLote({ nombre, total, peorNivel, peorPct, preview, abierto = false, onClick, etiquetaDia = null }) {
  const nivel = peorNivel ?? 0;
  const color = nivelColor(nivel);
  return (
    <button
        type="button"
        onClick={onClick}
        aria-expanded={onClick ? abierto : undefined}
        aria-label={etiquetaTesteraLote(nombre, total, nivel)}
        className={`mosaico-tile mosaico-tile--lote${abierto ? ' mosaico-tile--abierto' : ''}`}
      >
        {preview ? <Imagen src={preview} /> : (
          <span className="mosaico-tile__vacio" aria-hidden="true"><IconoMoverACarpeta size={24} /></span>
        )}
        <span className="mosaico-tile__punto" aria-hidden="true" style={{ background: color }} />
        <span className="mosaico-tile__cuenta">{total}</span>
        {etiquetaDia && <span className="mosaico-tile__dia">{etiquetaDia}</span>}
        <span className="mosaico-tile__pie">
          <span className="mosaico-tile__pct">{nivelLabel(nivel)}{peorPct != null ? ` · ${formatoPct(peorPct)}` : ''}</span>
          <span className="mosaico-tile__nombre">{nombre || 'Lote sin nombre'}</span>
        </span>
    </button>
  );
}
