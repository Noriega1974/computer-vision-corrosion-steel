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

// 2026-11-03: Indicadores pasa de 4 tarjetas a una línea tipo "ticker".
//
// 2026-11-04: estirado a flex:1 por métrica para usar el ancho completo
// (Mediciones por nivel ya no comparte fila con esto).
//
// 2026-11-05: el detalle (p.ej. "Planta Industrial Bogotá · Sin
// corrosión") había pasado a `title` (tooltip al pasar el mouse) para
// que la línea quedara compacta -- el usuario lo quería visible siempre,
// no solo al pasar el mouse. Vuelve a texto, debajo de etiqueta + valor
// en vez de al lado. Severas tampoco se distingue más por color -- el
// número va igual que las otras 3 métricas.
function Metrica({ label, value, sub, loading, isFirst }) {
  return (
    <div
      style={{
        flex: '1 1 170px',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 3,
        padding: '2px 16px',
        borderLeft: isFirst ? 'none' : '1px solid var(--border)',
      }}
    >
      <span style={{
        fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {label}
      </span>

      <span
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 28,
          fontWeight: 800,
          color: 'var(--text-primary)',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {loading ? <SkeletonLinea width="2.5ch" /> : value}
      </span>

      {sub && (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', lineHeight: 1.3 }}>
          {sub}
        </span>
      )}
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
    },
  ];

  const metricasMostradas = sinDatos
    ? metricas.map(k => ({ ...k, value: '—', sub: 'No se pudo cargar' }))
    : metricas;

  // ==============================================================
  // RENDER
  // ==============================================================

  return (
    <div>
      <div className="dashboard-section-title" style={{ marginBottom: 8 }}>
        Indicadores
      </div>

      {/* wrap (no nowrap): en pantallas angostas pasan a 2 filas de 2 en vez
          de inflar el dashboard con overflow horizontal. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', rowGap: 10 }}>
        {metricasMostradas.map((m, i) => (
          <Metrica key={i} {...m} loading={loading} isFirst={i === 0} />
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
