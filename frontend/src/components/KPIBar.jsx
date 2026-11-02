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

// Minimal tipográfico (elegido por el usuario entre 4 opciones): sin
// bordes de color ni fondo propio, solo una línea vertical fina entre
// métricas -- el número hace el trabajo visual. El color queda
// reservado casi del todo a la alerta real (Severas > 0 en rojo), no a
// decorar cada métrica con un color distinto.
function Metrica({ label, value, sub, alert, loading, isLast }) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        padding: '2px 14px',
        borderRight: isLast ? 'none' : '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {/* Truncar a 1 línea cortaba texto que el usuario quería poder leer
          completo. En su lugar: hasta 2 líneas (line-clamp) con un alto
          mínimo fijo e igual en las 4 tarjetas -- así una leyenda corta
          ("en total") no hace que esta tarjeta sea más baja que una larga
          ("Planta Industrial Bogotá · Sin corrosión"), sin necesidad de
          truncar ninguna de las dos. */}
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        lineHeight: 1.25, minHeight: '2.3em',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {label}
      </span>

      <span
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 24,
          fontWeight: 800,
          color: alert ? 'var(--accent-red)' : 'var(--text-primary)',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {loading ? <SkeletonLinea width="3ch" /> : value}
      </span>

      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', letterSpacing: '0.01em',
        lineHeight: 1.3, minHeight: '3.6em',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
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
    },
    {
      label: 'Puntos activos',
      value: puntosMedidos,
      sub: 'con mediciones registradas',
    },
    {
      label: 'Última área corroída',
      value: ultima?.area_corroida_pct != null ? formatoPct(ultima.area_corroida_pct) : '—',
      sub: ultima
        ? [bloqueUltima?.nombre, nivelLabel(ultima.nivel_corrosion)].filter(Boolean).join(' · ')
        : 'sin mediciones aún',
    },
    {
      label: 'Severas',
      value: puntosSeveros,
      sub: 'requieren revisión',
      alert: puntosSeveros > 0,
    },
  ];

  const metricasMostradas = sinDatos
    ? metricas.map(k => ({ ...k, value: '—', sub: 'No se pudo cargar', alert: false }))
    : metricas;

  // ==============================================================
  // RENDER
  // ==============================================================

  return (
    <div>
      <div className="dashboard-section-title" style={{ marginBottom: 8 }}>
        Indicadores
      </div>

      {/* nowrap a propósito: las 4 tarjetas se achican entre sí para
          seguir cabiendo en una sola fila en vez de pasar la 4ta ("Severas")
          a una fila nueva -- eso hacía crecer todo el bloque de Indicadores. */}
      <div style={{ display: 'flex', flexWrap: 'nowrap' }}>
        {metricasMostradas.map((m, i) => (
          <Metrica key={i} {...m} loading={loading} isLast={i === metricasMostradas.length - 1} />
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
