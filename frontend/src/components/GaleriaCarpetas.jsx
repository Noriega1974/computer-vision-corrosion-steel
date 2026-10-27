import React from 'react';
import { Link } from 'react-router-dom';
import { Folder } from 'lucide-react';
import NivelIcon from './NivelIcon';
import { nivelColor, nivelLabel } from '../lib/statusUtils';

// Tarjeta de carpeta (patrón flashcard): título en negrita + subtítulo suave,
// portada encuadrada con la última foto, pie con detalle y botón píldora.
function CarpetaCard({ item }) {
  const { to, titulo, subtitulo, portada, detalle, nivel } = item;
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
        {portada ? (
          <img src={portada} alt="" loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <Folder size={30} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 2 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
            {detalle}
          </div>
          {nivel != null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, marginTop: 3,
              fontSize: 11, color: 'var(--text-muted)', fontWeight: 500,
            }}>
              <NivelIcon nivel={nivel} size={14} color={nivelColor(nivel)} />
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

// Rejilla de carpetas. `items`: [{ key, to, titulo, subtitulo, portada, detalle, nivel? }]
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
