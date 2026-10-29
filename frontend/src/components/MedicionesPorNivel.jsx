import React from 'react';
import { useMediciones, LIMITE_DASHBOARD } from '../hooks/useMediciones';
import Skeleton, { SkeletonLinea } from './Skeleton';
import { nivelColor, nivelLabel } from '../lib/statusUtils';

// Barras simples (no Recharts): el rediseño pide columnas planas por nivel
// de corrosión, con la altura proporcional al máximo -- ver mockup en
// docs/rediseno/REDISENO_DASHBOARD.md. Reemplaza al anillo (Pie de
// Recharts) que vivía en ChartsRow.jsx.
export default function MedicionesPorNivel() {
  const { mediciones, loading } = useMediciones(LIMITE_DASHBOARD, { resumen: true });

  const conteos = [0, 1, 2, 3].map(nivel => ({
    nivel,
    label: nivelLabel(nivel),
    color: nivelColor(nivel),
    valor: mediciones.filter(m => m.nivel_corrosion === nivel).length,
  }));

  const max = Math.max(1, ...conteos.map(c => c.valor));

  return (
    <div>
      <div className="dashboard-section-title" style={{ marginBottom: 'var(--space-3)' }}>
        Mediciones por nivel
      </div>

      {loading ? (
        <div aria-busy="true" style={{ display: 'flex', gap: 10 }}>
          {conteos.map(c => (
            <div key={c.nivel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <SkeletonLinea width={18} />
              <Skeleton width="100%" height={120} radius={8} />
              <SkeletonLinea width={48} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          {conteos.map(c => (
            <div key={c.nivel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700,
                color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
              }}>
                {c.valor}
              </span>
              <div style={{
                width: '100%', height: 120, display: 'flex', alignItems: 'flex-end',
                background: 'var(--bg-inset)', borderRadius: 8,
              }}>
                <div style={{
                  width: '100%',
                  height: `${Math.max(5, (c.valor / max) * 100)}%`,
                  background: c.color,
                  borderRadius: 8,
                  transition: 'height var(--dur-base) var(--ease-out)',
                }} />
              </div>
              <span style={{
                fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-secondary)',
                textAlign: 'center', lineHeight: 1.2,
              }}>
                {c.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
