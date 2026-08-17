import React from 'react';
import { useMediciones } from '../hooks/useMediciones';
import { useAlertas } from '../hooks/useAlertas';


// ================================================================
// KPI CARD
// ================================================================

function KPICard({
  label,
  value,
  sub,
  color,
  icon,
  blink,
  loading,
}) {

  return (

    <div
      className="card kpi-card"
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

          gap: 10,

          marginBottom: 10,
        }}
      >

        <span
          style={{
            fontSize: 11,

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


        {/* Icon */}

        <span
          style={{
            display: 'flex',

            alignItems: 'center',
            justifyContent: 'center',

            width: 25,
            height: 25,

            borderRadius: '50%',

            color,

            background:
              `color-mix(
                in srgb,
                ${color} 9%,
                transparent
              )`,

            fontSize: 13,

            lineHeight: 1,

            animation:
              blink
                ? 'blink 1s ease-in-out infinite'
                : 'none',
          }}
        >
          {icon}
        </span>

      </div>


      {/* ========================================================
          VALUE
          ======================================================== */}

      <div
        style={{
          fontFamily:
            'var(--font-data)',

          fontSize: 27,

          fontWeight: 600,

          color,

          lineHeight: 1,

          letterSpacing:
            '-0.035em',
        }}
      >

        {loading ? (

          <span
            style={{
              fontSize: 14,
              opacity: 0.4,
            }}
          >
            —
          </span>

        ) : (

          value

        )}

      </div>


      {/* ========================================================
          SUBTITLE
          ======================================================== */}

      <div
        style={{
          marginTop: 7,

          fontSize: 9,

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
    loading: loadingMed,
  } = useMediciones(100);

  const {
    alertas,
    loading: loadingAlt,
  } = useAlertas();

  const loading = loadingMed || loadingAlt;


  // ==============================================================
  // DATA
  // ==============================================================

  const ubicacionesUnicas =
    new Set(
      mediciones.map(
        m => m.id_punto
      )
    ).size;


  const totalMediciones =
    mediciones.length;


  const criticas =
    mediciones.filter(
      m =>
        (m.nivel_corrosion ?? 0) === 3
    ).length;


  const sinCorrosion =
    mediciones.filter(
      m =>
        (m.nivel_corrosion ?? 0) === 0
    ).length;


  // Promedio de area corroida, solo sobre mediciones que tienen el dato.
  const conDatos =
    mediciones.filter(
      m => m.area_corroida_pct != null
    );

  const avgArea =
    conDatos.length
      ? conDatos.reduce(
          (s, m) => s + m.area_corroida_pct,
          0
        ) / conDatos.length
      : 0;


  // Alertas activas: nivel moderado o peor.
  const alertasActivas =
    alertas.filter(
      a =>
        (a.nivel_corrosion ?? 0) >= 2
    ).length;


  // ==============================================================
  // KPI CONFIG
  // ==============================================================

  const kpis = [

    {
      label:
        'Ubicaciones Monitoreadas',

      value:
        ubicacionesUnicas,

      sub:
        'ubicaciones activas',

      color:
        'var(--accent-blue)',

      icon:
        '⌖',
    },


    {
      label:
        'Total Mediciones',

      value:
        totalMediciones,

      sub:
        'últimas 100',

      color:
        'var(--accent-green)',

      icon:
        '◎',
    },


    {
      label:
        'Área Corroída Prom.',

      value:
        `${avgArea.toFixed(1)}%`,

      sub:
        'promedio general',

      color:
        'var(--accent-amber)',

      icon:
        '~',
    },


    {
      label:
        'Alertas Activas',

      value:
        alertasActivas,

      sub:
        'nivel moderado+',

      color:
        alertasActivas > 0
          ? 'var(--accent-orange)'
          : 'var(--accent-green)',

      icon:
        '▲',

      blink:
        alertasActivas > 0,
    },


    {
      label:
        'Estado Crítico',

      value:
        criticas,

      sub:
        'nivel severo',

      color:
        criticas > 0
          ? 'var(--accent-red)'
          : 'var(--accent-green)',

      icon:
        '!',

      blink:
        criticas > 0,
    },


    {
      label:
        'Sin Corrosión',

      value:
        sinCorrosion,

      sub:
        'nivel 0',

      color:
        'var(--accent-green)',

      icon:
        '✓',
    },

  ];


  // ==============================================================
  // RENDER
  // ==============================================================

  return (

    <div
      className="kpi-grid"
      style={{
        display: 'grid',

        gridTemplateColumns:
          'repeat(6, minmax(0, 1fr))',

        gap: 12,
      }}
    >

      {kpis.map(
        (kpi, i) => (

          <KPICard
            key={i}

            {...kpi}

            loading={loading}
          />

        )
      )}

    </div>
  );
}