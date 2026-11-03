import React from 'react';
import { useMediciones, LIMITE_DASHBOARD } from '../hooks/useMediciones';
import { SkeletonLinea } from './Skeleton';
import { calcularIndicadores, VENTANA_DIAS } from '../lib/indicadoresSistema';
import { formatoPct } from '../lib/textUtils';

const COLOR_NIVEL = ['var(--accent-green)', 'var(--accent-amber)', 'var(--accent-orange)', 'var(--accent-red)'];


// ================================================================
// KPI (compacto)
// ================================================================

// El circulo con el glifo (⬡ ◎ ▲ ✓ ~ !) se quito a proposito: no aportaba
// informacion que el numero y su etiqueta no dieran ya, y ademas parpadeaba de
// forma infinita en las tarjetas criticas. La severidad se lee por el color del
// numero, sin movimiento permanente en pantalla.
// Cada KPI es una celda de la fila de la mitad izquierda (2x2 en telefonos);
// las lineas finas entre celdas las pone .kpi-celda en index.css.
function KPICard({
  label,
  value,
  sub,
  color,
  loading,
}) {
  return (
    <div className="kpi-celda" aria-busy={loading || undefined}>
      <div
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--text-xl)',
          fontWeight: 600,
          color,
          lineHeight: 1,
          letterSpacing: '-0.035em',
        }}
      >
        {loading ? <SkeletonLinea width="3ch" /> : value}
      </div>
      <div
        style={{
          marginTop: 'var(--space-1)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-ui)',
          fontWeight: 500,
          lineHeight: 1.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-faint)',
          fontFamily: 'var(--font-ui)',
          lineHeight: 1.35,
        }}
      >
        {sub}
      </div>
    </div>
  );
}


// ================================================================
// KPI BAR
// ================================================================

export default function KPIBar() {

  const {
    mediciones,
    loading,
    error,
    refetch,
  } = useMediciones(LIMITE_DASHBOARD, { resumen: true });

  // With cached data a failed refresh keeps showing it; only an empty failure
  // is an error state (never show 0 as if it were real data).
  const sinDatos = Boolean(error) && mediciones.length === 0;


  // ==============================================================
  // DATA
  // ==============================================================

  const {
    totalPuntos,
    mayorCorrosion,
    puntosEmpeoraron,
    pctPuntosAlDia,
    mediciones30Dias,
  } = calcularIndicadores(mediciones);

  // Until the backend returns these totals, they are computed from the latest
  // LIMITE_DASHBOARD mediciones; say so instead of passing off a partial count.
  const alcanzoLimite = mediciones.length >= LIMITE_DASHBOARD;


  // ==============================================================
  // KPI CONFIG
  // ==============================================================

  const kpis = [
    {
      label: 'Mayor corrosión',
      value: mayorCorrosion ? formatoPct(mayorCorrosion.pct) : 'Sin datos',
      sub: mayorCorrosion
        ? (mayorCorrosion.punto ?? 'Punto sin nombre')
        : 'sin mediciones con %',
      color: COLOR_NIVEL[mayorCorrosion?.nivel] ?? 'var(--text-primary)',
    },
    {
      label: 'Puntos que empeoraron',
      value: puntosEmpeoraron,
      sub: `subieron en los últimos ${VENTANA_DIAS} días`,
      color: puntosEmpeoraron > 0 ? 'var(--accent-orange)' : 'var(--accent-green)',
    },
    {
      label: 'Puntos al día',
      value: pctPuntosAlDia === null ? 'Sin datos' : `${pctPuntosAlDia}%`,
      sub: `de ${totalPuntos} medidos en ${VENTANA_DIAS} días`,
      color: 'var(--text-primary)',
    },
    {
      label: `Mediciones en ${VENTANA_DIAS} días`,
      value: alcanzoLimite ? `${mediciones30Dias}+` : mediciones30Dias,
      sub: alcanzoLimite ? `de las ${LIMITE_DASHBOARD} más recientes` : 'fotos analizadas',
      color: 'var(--text-primary)',
    },
  ];

  const kpisMostrados = sinDatos
    ? kpis.map(k => ({ ...k, value: 'Sin datos', sub: 'No se pudo cargar', color: 'var(--text-faint)' }))
    : kpis;


  // ==============================================================
  // RENDER
  // ==============================================================

  return (
    <div className="card ind-card">
      <div className="ind-card-label">Estado general del sistema</div>
      <div className="kpi-grid">
        {kpisMostrados.map((kpi, i) => (
          <KPICard key={i} {...kpi} loading={loading} />
        ))}
      </div>

      {sinDatos && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            marginTop: 'var(--space-2)',
            fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
          }}
        >
          <span>No se pudieron cargar las mediciones. Revisa tu conexión.</span>
          <button
            type="button" onClick={refetch}
            style={{
              padding: '6px 12px', minHeight: 32, borderRadius: 6,
              border: '1px solid var(--border-strong)', background: 'transparent',
              color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
