import React from 'react';
import { Globe } from 'lucide-react';
import { useEmpresas } from '../hooks/useEmpresas';
import { useAuth } from '../auth/AuthContext';

// Lista de zonas dibujadas -- clic centra el mapa en esa zona (ver
// ColombiaMap, prop `selectedZona`). Solo super_admin ve zonas de empresa
// (mismo límite que el mapa: GET /empresas es exclusivo de ese rol).
export default function ZonasList({ selectedZona, onSelectZona }) {
  const { user } = useAuth();
  const esSuperAdmin = user?.groups?.includes('super_admin');
  const { empresas, loading } = useEmpresas(esSuperAdmin);

  if (!esSuperAdmin) return null;

  const filas = empresas.flatMap(e =>
    (e.zonas ?? []).map((zona, i) => ({
      key: `${e.id_empresa}-${i}`,
      empresa: e.nombre,
      etiqueta: `Zona ${i + 1}`,
      zona,
    }))
  );

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      maxHeight: 150, overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-sm)', letterSpacing: '0.1em', color: 'var(--text-primary)' }}>
          <Globe size={13} /> ZONAS
        </div>
        <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 2 }}>
          {loading ? 'Cargando…' : `${filas.length} ZONAS`}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-2)' }}>
        {!loading && filas.length === 0 && (
          <div style={{ padding: '10px', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
            Sin zonas dibujadas.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {filas.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => onSelectZona(f.zona)}
              aria-pressed={selectedZona === f.zona}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px', font: 'inherit', cursor: 'pointer',
                background: selectedZona === f.zona ? 'rgba(0,185,255,0.1)' : 'var(--bg-page)',
                border: `1px solid ${selectedZona === f.zona ? '#00b9ff' : 'var(--border)'}`,
                borderLeft: `3px solid ${selectedZona === f.zona ? '#00b9ff' : 'var(--border-bright)'}`,
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>{f.empresa}</div>
              <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)' }}>{f.etiqueta} · {f.zona.puntos.length} puntos</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
