import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import NivelIcon from './NivelIcon';
import { nivelColor, nivelLabel } from '../lib/statusUtils';
import { iniciales as calcularIniciales } from '../lib/galeriaCarpetas';

// Imagen de la carpeta. Punto: su foto de portada propia, recortada a cubrir.
// Empresa: su logo completo (contain) sobre fondo neutro. Si no hay imagen
// cargada o la URL falla (p. ej. vencida), se muestra un círculo neutro con
// sus iniciales (nunca la foto de la última medición).
function CarpetaMedia({ portada, logo, iniciales, titulo }) {
  const [fallo, setFallo] = useState(false);
  const esEmpresa = logo !== undefined;
  const src = fallo ? null : (esEmpresa ? logo : portada);

  if (src) {
    return (
      <img src={src} alt="" loading="lazy" onError={() => setFallo(true)}
        style={esEmpresa
          ? { width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 14, boxSizing: 'border-box' }
          : { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    );
  }
  return (
    <div aria-hidden="true" style={{
      width: 84, height: 84, borderRadius: '50%', background: 'var(--bg-card-solid)',
      border: '1px solid var(--border-strong)', color: 'var(--text-secondary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 28, letterSpacing: '0.02em',
    }}>
      {iniciales || calcularIniciales(titulo)}
    </div>
  );
}

// Tarjeta de carpeta (patrón flashcard): imagen + nombre en negrita + subtítulo
// suave (nunca la imagen sola), pie con detalle y botón píldora.
// `logo` definido (url o null) la vuelve tarjeta de empresa; `iniciales` es su respaldo.
function CarpetaCard({ item }) {
  const { to, titulo, subtitulo, portada, logo, iniciales, detalle, nivel } = item;
  return (
    <Link
      to={to}
      className="medicion-card"
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
        textDecoration: 'none', color: 'inherit',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div>
        <div style={{
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15,
          color: 'var(--text-primary)', lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {titulo}
        </div>
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-ui)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {subtitulo}
        </div>
      </div>

      <div style={{
        height: 140, background: 'var(--bg-inset)', borderRadius: 10,
        border: '1px solid var(--border)', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CarpetaMedia portada={portada} logo={logo} iniciales={iniciales} titulo={titulo} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 2 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
            {detalle}
          </div>
          {nivel != null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
              fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600,
            }}>
              <NivelIcon nivel={nivel} size={20} color={nivelColor(nivel)} />
              <span>{nivelLabel(nivel)}</span>
            </div>
          )}
        </div>
        <span style={{
          padding: '7px 14px', borderRadius: 999,
          background: 'var(--text-primary)', color: 'var(--bg-card-solid)',
          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, lineHeight: 1, flexShrink: 0,
        }}>
          Abrir
        </span>
      </div>
    </Link>
  );
}

// Rejilla de carpetas. `items`: [{ key, to, titulo, subtitulo, portada, logo?, iniciales?, detalle, nivel? }]
export default function GaleriaCarpetas({ items }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 'var(--space-4)',
    }}>
      {items.map(item => <CarpetaCard key={item.key} item={item} />)}
    </div>
  );
}
