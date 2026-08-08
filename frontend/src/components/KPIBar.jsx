import React from 'react';
import { useMediciones } from '../hooks/useMediciones';
import { useAlertas } from '../hooks/useAlertas';

function KPICard({ label, value, sub, color, icon, blink, loading }) {
  return (
    <div className="card" style={{
      padding: '14px 16px',
      borderRadius: 8,
      position: 'relative',
      overflow: 'hidden',
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontWeight: 500, lineHeight: 1.3 }}>
          {label}
        </span>
        <span style={{ fontSize: 14, color, lineHeight: 1, animation: blink ? 'blink 1s ease-in-out infinite' : 'none' }}>
          {icon}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-data)', fontSize: 24, fontWeight: 600, color, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {loading ? <span style={{ fontSize: 14, opacity: 0.4 }}>—</span> : value}
      </div>
      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {sub}
      </div>
    </div>
  );
}

export default function KPIBar() {
  const { mediciones, loading: loadingMed } = useMediciones(100);
  const { alertas, loading: loadingAlt } = useAlertas();

  // Plantas únicas
  const plantasUnicas = new Set(mediciones.map(m => m.id_punto)).size;
  // Total mediciones (de las 100 cargadas — el backend devuelve el total real)
  const totalMediciones = mediciones.length;
  // Promedio área corroída (solo mediciones con datos)
  const conDatos = mediciones.filter(m => m.area_corroida_pct != null);
  const avgArea = conDatos.length
    ? conDatos.reduce((s, m) => s + m.area_corroida_pct, 0) / conDatos.length
    : 0;
  // Alertas activas (nivel >= 2)
  const alertasActivas = alertas.filter(a => (a.nivel_corrosion ?? 0) >= 2).length;
  const criticas = alertas.filter(a => (a.nivel_corrosion ?? 0) === 3).length;

  const kpis = [
    {
      label: 'Plantas Monitoreadas',
      value: plantasUnicas,
      sub: 'puntos activos',
      color: 'var(--accent-blue)',
      icon: '⬡',
    },
    {
      label: 'Total Mediciones',
      value: totalMediciones,
      sub: 'últimas 100',
      color: 'var(--accent-green)',
      icon: '◎',
    },
    {
      label: 'Área Corroída Prom.',
      value: `${avgArea.toFixed(1)}%`,
      sub: 'promedio general',
      color: 'var(--accent-amber)',
      icon: '~',
    },
    {
      label: 'Alertas Activas',
      value: alertasActivas,
      sub: 'nivel moderado+',
      color: alertasActivas > 0 ? 'var(--accent-orange)' : 'var(--accent-green)',
      icon: '▲',
      blink: alertasActivas > 0,
    },
    {
      label: 'Estado Crítico',
      value: criticas,
      sub: 'nivel severo',
      color: criticas > 0 ? 'var(--accent-red)' : 'var(--accent-green)',
      icon: '!',
      blink: criticas > 0,
    },
    {
      label: 'Sin Corrosión',
      value: mediciones.filter(m => (m.nivel_corrosion ?? 0) === 0).length,
      sub: 'nivel 0',
      color: 'var(--accent-green)',
      icon: '✓',
    },
  ];

  const loading = loadingMed || loadingAlt;

  return (
    <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
      {kpis.map((kpi, i) => (
        <KPICard key={i} {...kpi} loading={loading} />
      ))}
    </div>
  );
}
