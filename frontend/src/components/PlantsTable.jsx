import React from 'react';
import { Factory } from 'lucide-react';

// ─── Lista de plantas — reemplaza el antiguo "Centro de alertas" en el Dashboard ──
export default function PlantsTable({ puntos, loading, error, selectedPunto, onSelectPunto }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-sm)',
          letterSpacing: '0.1em', color: 'var(--text-primary)',
        }}>
          PLANTAS REGISTRADAS
        </div>
        <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 2 }}>
          {loading ? 'Cargando…' : `${puntos.length} PLANTAS`}
        </div>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-2)' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 }}>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>Cargando…</span>
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 'var(--space-3)', fontSize: 'var(--text-2xs)', color: 'var(--accent-red)' }}>Error: {error}</div>
        )}
        {!loading && !error && puntos.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 'var(--space-2)', padding: 20,
          }}>
            <Factory size={22} opacity={0.4} />
            <div style={{ fontSize: 'var(--text-2xs)', letterSpacing: '0.12em', textAlign: 'center' }}>
              Sin plantas registradas.
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {puntos.map((p, i) => (
            <PlantRow
              key={p.id_punto}
              punto={p}
              index={i}
              selected={selectedPunto?.id_punto === p.id_punto}
              onClick={() => onSelectPunto(p)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlantRow({ punto, index, selected, onClick }) {
  const nombre = punto.sede ?? punto.id_punto;
  return (
    // Mismo gotcha que se corrigio ayer en el resto de la app: era un
    // <div onClick>, invisible para el teclado. button+aria-pressed lo
    // trae de vuelta al orden de foco sin cambiar el look de la fila.
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        background: selected ? 'rgba(156,54,16,0.08)' : 'var(--bg-page)',
        border: `1px solid ${selected ? 'var(--accent-blue)' : 'var(--border)'}`,
        borderLeft: `3px solid ${selected ? 'var(--accent-blue)' : 'var(--border-bright)'}`,
        borderRadius: 0,
        cursor: 'pointer',
        font: 'inherit',
        animation: `fade-in-up 0.3s ease ${index * 0.04}s both`,
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-page)'; }}
    >
      {/* La columna quedo mas angosta que la fila horizontal de antes:
          nombres largos truncan con elipsis en vez de romper el ancho. */}
      <div
        title={nombre}
        style={{
          fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {nombre}
      </div>
      <div
        title={`${punto.ciudad ?? '—'}${punto.departamento ? ` · ${punto.departamento}` : ''}`}
        style={{
          fontSize: 'var(--text-3xs)', color: 'var(--text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {punto.ciudad ?? '—'}{punto.departamento ? ` · ${punto.departamento}` : ''}
      </div>
    </button>
  );
}
