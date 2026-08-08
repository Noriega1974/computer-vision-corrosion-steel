import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, LineChart, Line, ReferenceLine,
} from 'recharts';
import { useMediciones } from '../hooks/useMediciones';
import { nivelColor, nivelToStatus, getStatusLabel } from '../lib/statusUtils';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      padding: '8px 12px', borderRadius: 6,
      fontFamily: 'var(--font-ui)', fontSize: 12,
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 11 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.fill, fontWeight: 500 }}>
          {p.name}: <strong style={{ fontFamily: 'var(--font-data)' }}>
            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
          </strong>{p.name?.includes('%') || p.name?.includes('Área') ? '%' : ''}
        </div>
      ))}
    </div>
  );
};

function EmptyChart({ message }) {
  return (
    <div style={{
      height: 150, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <div style={{ fontSize: 24, opacity: 0.3 }}>📊</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.06em' }}>
        {message}
      </div>
    </div>
  );
}

export default function ChartsRow() {
  const { mediciones, loading } = useMediciones(100);

  // Pie: distribución por nivel_corrosion
  const nivelCounts = [0, 1, 2, 3].map(n => ({
    name: getStatusLabel(nivelToStatus(n)),
    value: mediciones.filter(m => (m.nivel_corrosion ?? 0) === n).length,
    fill: nivelColor(n),
    nivel: n,
  })).filter(d => d.value > 0);

  // Line: tendencia de area_corroida_pct en las últimas 30 mediciones (ordenadas por tiempo)
  const sorted = [...mediciones]
    .filter(m => m.area_corroida_pct != null)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-30);
  const trendData = sorted.map((m, i) => ({
    idx: i + 1,
    fecha: new Date(m.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
    'Área %': parseFloat((m.area_corroida_pct ?? 0).toFixed(1)),
  }));

  // Bar: mediciones por ciudad (top 6)
  const byCity = {};
  mediciones.forEach(m => {
    const ciudad = m.punto_info?.ciudad ?? m.ciudad ?? '—';
    if (!byCity[ciudad]) byCity[ciudad] = { count: 0, totalArea: 0, maxNivel: 0 };
    byCity[ciudad].count++;
    byCity[ciudad].totalArea += m.area_corroida_pct ?? 0;
    byCity[ciudad].maxNivel = Math.max(byCity[ciudad].maxNivel, m.nivel_corrosion ?? 0);
  });
  const cityData = Object.entries(byCity)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([ciudad, d]) => ({
      name: ciudad.substring(0, 6).toUpperCase(),
      fullName: ciudad,
      Mediciones: d.count,
      fill: nivelColor(d.maxNivel),
    }));

  return (
    <div className="charts-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 240px 1fr', gap: 16 }}>

      {/* Tendencia temporal */}
      <ChartCard title="TENDENCIA DE CORROSIÓN" subtitle="ÁREA CORROÍDA % · ÚLTIMAS 30 MEDICIONES">
        {loading || trendData.length === 0
          ? <EmptyChart message={loading ? 'Cargando…' : 'Sin datos suficientes para mostrar tendencias'} />
          : (
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <XAxis dataKey="fecha" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.4} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="Área %" stroke="var(--accent-orange)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )
        }
      </ChartCard>

      {/* Distribución por nivel */}
      <ChartCard title="DISTRIBUCIÓN" subtitle="POR NIVEL DE CORROSIÓN">
        {loading || nivelCounts.length === 0
          ? <EmptyChart message={loading ? 'Cargando…' : 'Sin mediciones'} />
          : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie
                    data={nivelCounts} cx="50%" cy="50%"
                    innerRadius={35} outerRadius={55}
                    paddingAngle={3} dataKey="value"
                  >
                    {nivelCounts.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} stroke="var(--bg-void)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', padding: '0 8px 4px' }}>
                {nivelCounts.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: d.fill }} />
                    <span style={{ color: 'var(--text-muted)' }}>{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </>
          )
        }
      </ChartCard>

      {/* Por ciudad */}
      <ChartCard title="MEDICIONES POR CIUDAD" subtitle="TOP INSTALACIONES · CANTIDAD DE REGISTROS">
        {loading || cityData.length === 0
          ? <EmptyChart message={loading ? 'Cargando…' : 'Sin datos suficientes para mostrar tendencias'} />
          : (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={cityData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Mediciones" radius={[2, 2, 0, 0]} maxBarSize={28}>
                  {cityData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="card" style={{ padding: '16px 16px 12px', borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', marginBottom: 2 }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginBottom: 12 }}>
        {subtitle}
      </div>
      {children}
    </div>
  );
}
