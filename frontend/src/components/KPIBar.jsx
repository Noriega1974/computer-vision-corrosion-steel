import React from 'react';
import { useMediciones, LIMITE_DASHBOARD } from '../hooks/useMediciones';
import { useBloques } from '../hooks/useBloques';
import { SkeletonLinea } from './Skeleton';
import { ultimaMedicionPorPunto } from '../lib/mediciones';
import { nivelLabel } from '../lib/statusUtils';
import { formatoPct } from '../lib/textUtils';

// ================================================================
// MÉTRICA
// ================================================================

function Metrica({ label, value, sub, color, loading, primera }) {
  return (
    <div
      style={{
        flex: '1 1 130px',
        minWidth: 130,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '4px 20px',
        borderLeft: primera ? 'none' : '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
        {label}
      </span>

      <span
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 34,
          fontWeight: 800,
          color,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {loading ? <SkeletonLinea width="3ch" /> : value}
      </span>

      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
        {sub}
      </span>
    </div>
  );
}

// ================================================================
// INDICADORES
// ================================================================

export default function KPIBar() {
  const {
    mediciones,
    loading,
    error,
    refetch,
  } = useMediciones(LIMITE_DASHBOARD, { resumen: true });

  // Nombre del punto para "Última área corroída" (ver debajo) -- mismo
  // patrón que ChartsRow.jsx para resolver bloque_id -> datos del bloque.
  const { bloques } = useBloques(true);
  const bloquePorId = React.useMemo(
    () => Object.fromEntries(bloques.map(b => [b.id_bloque, b])),
    [bloques]
  );

  // With cached data a failed refresh keeps showing it; only an empty failure
  // is an error state (never show 0 as if it were real data).
  const sinDatos = Boolean(error) && mediciones.length === 0;

  // ==============================================================
  // DATA
  // ==============================================================

  const puntosMedidos = new Set(
    mediciones.map(m => m.bloque_id).filter(Boolean)
  ).size;

  const totalMediciones = mediciones.length;
  const alcanzoLimite = totalMediciones >= LIMITE_DASHBOARD;

  let puntosSeveros = 0;
  for (const { nivel_corrosion: nivel } of ultimaMedicionPorPunto(mediciones).values()) {
    if (nivel === 3) puntosSeveros++;
  }

  // Medición más reciente de todas (independiente del orden del API, igual
  // que ultimaMedicionPorPunto) -- para "Última área corroída".
  let ultima = null;
  let ultimaT = -Infinity;
  for (const m of mediciones) {
    const t = new Date(m.timestamp).getTime() || 0;
    if (t > ultimaT) { ultimaT = t; ultima = m; }
  }
  const bloqueUltima = ultima ? bloquePorId[ultima.bloque_id] : null;

  const metricas = [
    {
      label: 'Mediciones',
      value: alcanzoLimite ? `${totalMediciones}+` : totalMediciones,
      sub: alcanzoLimite ? `las ${LIMITE_DASHBOARD} más recientes` : 'en todos los puntos',
      color: 'var(--text-primary)',
    },
    {
      label: 'Puntos activos',
      value: puntosMedidos,
      sub: 'con mediciones registradas',
      color: 'var(--text-primary)',
    },
    {
      label: 'Última área corroída',
      value: ultima?.area_corroida_pct != null ? formatoPct(ultima.area_corroida_pct) : '—',
      sub: ultima
        ? [bloqueUltima?.nombre, nivelLabel(ultima.nivel_corrosion)].filter(Boolean).join(' · ')
        : 'sin mediciones aún',
      color: 'var(--accent-amber)',
    },
    {
      label: 'Severas',
      value: puntosSeveros,
      sub: 'requieren revisión',
      color: puntosSeveros > 0 ? 'var(--accent-red)' : 'var(--text-primary)',
    },
  ];

  const metricasMostradas = sinDatos
    ? metricas.map(k => ({ ...k, value: '—', sub: 'No se pudo cargar', color: 'var(--text-faint)' }))
    : metricas;

  // ==============================================================
  // RENDER
  // ==============================================================

  return (
    <div>
      <div className="dashboard-section-title" style={{ marginBottom: 'var(--space-3)' }}>
        Indicadores
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 16, alignItems: 'center' }}>
        {metricasMostradas.map((m, i) => (
          <Metrica key={i} {...m} loading={loading} primera={i === 0} />
        ))}
      </div>

      {sinDatos && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            marginTop: 'var(--space-3)',
            fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
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
