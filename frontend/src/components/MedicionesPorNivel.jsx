import React from 'react';
import { useMediciones, LIMITE_DASHBOARD } from '../hooks/useMediciones';
import Skeleton, { SkeletonLinea } from './Skeleton';
import { nivelLabel } from '../lib/statusUtils';

// Barras simples (no Recharts): el rediseño pide columnas planas por nivel
// de corrosión, con la altura proporcional al máximo -- ver mockup en
// docs/rediseno/REDISENO_DASHBOARD.md. Reemplaza al anillo (Pie de
// Recharts) que vivía en ChartsRow.jsx.

// Colores propios de este gráfico (--sev-*, ver index.css) en vez de
// nivelColor()/getStatusColor() -- esos los usan el mapa, la galería, el
// detalle de medición, etc. en toda la app y deben seguir siendo los
// mismos colores cálidos en los dos temas. Acá el usuario pidió
// específicamente que combinaran mejor con el azul del tema oscuro, así
// que --sev-* sí tiene un segundo valor para oscuro (ver index.css).
const SEVERITY_COLOR_VARS = ['var(--sev-ok)', 'var(--sev-early)', 'var(--sev-moderate)', 'var(--sev-critical)'];

export default function MedicionesPorNivel() {
  const { mediciones, loading } = useMediciones(LIMITE_DASHBOARD, { resumen: true });

  const conteos = [0, 1, 2, 3].map(nivel => ({
    nivel,
    label: nivelLabel(nivel),
    color: SEVERITY_COLOR_VARS[nivel],
    valor: mediciones.filter(m => m.nivel_corrosion === nivel).length,
  }));

  const max = Math.max(1, ...conteos.map(c => c.valor));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="dashboard-section-title" style={{ marginBottom: 6, flexShrink: 0 }}>
        Mediciones por nivel
      </div>

      {/* flex:1 -- las barras usan el alto que le sobre a la tarjeta (la
          misma fila que Indicadores) en vez de un alto fijo chico; antes
          quedaban "chatas" sin aprovechar el espacio disponible. */}
      {loading ? (
        <div aria-busy="true" style={{ display: 'flex', gap: 8, flex: 1, minHeight: 90 }}>
          {conteos.map(c => (
            <div key={c.nivel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <SkeletonLinea width={18} />
              <Skeleton width="100%" height="100%" radius={6} />
              <SkeletonLinea width={48} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flex: 1, minHeight: 90 }}>
          {conteos.map(c => (
            <div key={c.nivel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700,
                color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0,
              }}>
                {c.valor}
              </span>
              <div style={{
                width: '100%', flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end',
                background: 'var(--bg-inset)', borderRadius: 6,
              }}>
                <div style={{
                  width: '100%',
                  height: `${Math.max(8, (c.valor / max) * 100)}%`,
                  background: c.color,
                  borderRadius: 6,
                  transition: 'height var(--dur-base) var(--ease-out)',
                }} />
              </div>
              <span style={{
                fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-secondary)',
                textAlign: 'center', lineHeight: 1.15, flexShrink: 0,
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
