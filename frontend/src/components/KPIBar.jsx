import React from 'react';
import { useMediciones, LIMITE_DASHBOARD } from '../hooks/useMediciones';
import { SkeletonLinea } from './Skeleton';
import { ultimaMedicionPorPunto } from '../lib/mediciones';


// ================================================================
// KPI CARD
// ================================================================

// El circulo con el glifo (⬡ ◎ ▲ ✓ ~ !) se quito a proposito: no aportaba
// informacion que el numero y su etiqueta no dieran ya, y ademas parpadeaba de
// forma infinita en las tarjetas criticas. La severidad se lee por el color y
// por la franja superior, sin movimiento permanente en pantalla.
function KPICard({
  label,
  value,
  sub,
  color,
  loading,
}) {

  return (

    <div
      className="card kpi-card"
      aria-busy={loading || undefined}
      style={{
        '--kpi-color': color,

        padding: '15px 17px',

        position: 'relative',

        overflow: 'hidden',

        borderRadius: 12,

        borderTop:
          `2px solid ${color}`,
      }}
    >

      {/* ========================================================
          HEADER
          ======================================================== */}

      <div
        style={{
          display: 'flex',

          justifyContent:
            'space-between',

          alignItems:
            'flex-start',

          gap: 'var(--space-3)',

          marginBottom: 'var(--space-3)',
        }}
      >

        <span
          style={{
            fontSize: 'var(--text-xs)',

            color:
              'var(--text-muted)',

            fontFamily:
              'var(--font-ui)',

            fontWeight: 500,

            lineHeight: 1.35,
          }}
        >
          {label}
        </span>


      </div>


      {/* ========================================================
          VALUE
          ======================================================== */}

      <div
        style={{
          fontFamily:
            'var(--font-data)',

          fontSize: 'var(--text-2xl)',

          fontWeight: 600,

          color,

          lineHeight: 1,

          letterSpacing:
            '-0.035em',
        }}
      >

        {loading ? (

          <SkeletonLinea width="3ch" />

        ) : (

          value

        )}

      </div>


      {/* ========================================================
          SUBTITLE
          ======================================================== */}

      <div
        style={{
          marginTop: 'var(--space-2)',

          fontSize: 'var(--text-2xs)',

          color:
            'var(--text-faint)',

          fontFamily:
            'var(--font-ui)',

          textTransform:
            'uppercase',

          letterSpacing:
            '0.075em',
        }}
      >

        {sub}

      </div>


      {/* ========================================================
          BOTTOM ACCENT
          ======================================================== */}

      <div
        style={{
          position: 'absolute',

          left: 17,
          right: 17,

          bottom: 0,

          height: 1,

          background:
            `linear-gradient(
              90deg,
              transparent,
              ${color},
              transparent
            )`,

          opacity: 0.20,
        }}
      />

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

  // Measurements without an assigned point are not a monitored point.
  const puntosMedidos =
    new Set(
      mediciones
        .map(m => m.bloque_id)
        .filter(Boolean)
    ).size;

  const totalMediciones =
    mediciones.length;

  const alcanzoLimite =
    totalMediciones >= LIMITE_DASHBOARD;

  // Latest measurement per point (shared helper); a null level counts in neither card.
  let puntosSeveros = 0;
  let puntosSinCorrosion = 0;
  for (const { nivel_corrosion: nivel } of ultimaMedicionPorPunto(mediciones).values()) {
    if (nivel === 3) puntosSeveros++;
    else if (nivel === 0) puntosSinCorrosion++;
  }


  // ==============================================================
  // KPI CONFIG
  // ==============================================================

  const kpis = [
    {
      label: 'Puntos medidos',
      value: puntosMedidos,
      sub: 'con al menos una medición',
      color: 'var(--accent-blue)',
    },
    {
      label: 'Mediciones',
      value: alcanzoLimite ? `${totalMediciones}+` : totalMediciones,
      sub: alcanzoLimite ? `se cuentan las ${LIMITE_DASHBOARD} más recientes` : 'en total',
      color: 'var(--accent-green)',
    },
    {
      label: 'En estado severo',
      value: puntosSeveros,
      sub: 'puntos, según su última medición',
      color: puntosSeveros > 0 ? 'var(--accent-red)' : 'var(--accent-green)',
    },
    {
      label: 'Sin corrosión',
      value: puntosSinCorrosion,
      sub: 'puntos, según su última medición',
      color: 'var(--accent-green)',
    },
  ];

  const kpisMostrados = sinDatos
    ? kpis.map(k => ({ ...k, value: '—', sub: 'No se pudo cargar', color: 'var(--text-faint)' }))
    : kpis;


  // ==============================================================
  // RENDER
  // ==============================================================

  return (
    <div>
      <div
        className="kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
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
