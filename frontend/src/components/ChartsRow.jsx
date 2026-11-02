import React, { useMemo } from 'react';
import { IconoGrafico } from './Iconos';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from 'recharts';

import { useMediciones, LIMITE_DASHBOARD } from '../hooks/useMediciones';
import { useBloques } from '../hooks/useBloques';
import { useMedicionesPunto } from '../hooks/useMedicionesPunto';
import Skeleton from './Skeleton';
import {
  nivelColor,
} from '../lib/statusUtils';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        padding: '8px 12px',
        borderRadius: 6,
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-xs)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div
        style={{
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-1)',
          fontSize: 'var(--text-2xs)',
        }}
      >
        {label}
      </div>

      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            color: p.color || p.fill,
            fontWeight: 500,
          }}
        >
          {p.name}:{' '}
          <strong
            style={{
              fontFamily: 'var(--font-data)',
            }}
          >
            {typeof p.value === 'number'
              ? p.value.toFixed(1)
              : p.value}
          </strong>

          {p.name?.includes('%') ||
          p.name?.includes('Área')
            ? '%'
            : ''}
        </div>
      ))}
    </div>
  );
};

// Skeleton con el mismo alto que el grafico real (150).
function BarsSkeleton() {
  const alturas = [70, 100, 55, 85, 40];
  return (
    <div
      aria-busy="true"
      style={{
        height: 150,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-around',
        padding: '4px 8px 0',
      }}
    >
      {alturas.map((h, i) => (
        <Skeleton key={i} width={28} height={`${h}%`} radius="2px 2px 0 0" />
      ))}
    </div>
  );
}

function EmptyChart({ message }) {
  return (
    <div
      style={{
        height: 150,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
      }}
    >
      <div
        style={{
          opacity: 0.3,
        }}
      >
        <IconoGrafico size={24} aria-hidden="true" />
      </div>

      <div
        style={{
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-muted)',
          textAlign: 'center',
          letterSpacing: '0.06em',
        }}
      >
        {message}
      </div>
    </div>
  );
}

export default function ChartsRow({ selectedPunto }) {
  const {
    mediciones,
    loading,
  } = useMediciones(LIMITE_DASHBOARD, { resumen: true });

  // Tendencia del punto seleccionado en el mapa/lista -- vivía en
  // PlantDetail.jsx (columna angosta, poco legible) y se mudó acá, con más
  // espacio horizontal, a pedido del usuario.
  const { mediciones: medicionesPunto, loading: loadingPunto } = useMedicionesPunto(selectedPunto?.id_bloque);
  const trendData = [...medicionesPunto]
    .filter(m => m.area_corroida_pct != null)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-20)
    .map(m => ({
      fecha: new Date(m.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
      corrosion: parseFloat((m.area_corroida_pct ?? 0).toFixed(1)),
    }));

  // Ciudad ya no viaja denormalizada en la medición -- se resuelve por
  // bloque_id contra la lista de puntos (bloques).
  const { bloques } = useBloques(true);
  const ciudadPorBloqueId = useMemo(
    () => Object.fromEntries(bloques.map(b => [b.id_bloque, b.ciudad])),
    [bloques]
  );

  // Bar: mediciones por ciudad (top 6). La distribución por nivel se mudó
  // a MedicionesPorNivel.jsx (tarjeta "Mediciones por nivel" junto a
  // Indicadores, ver DashboardPage.jsx) -- este componente ahora solo
  // vive dentro de "Análisis y métricas avanzadas".
  const byCity = {};
  mediciones.forEach(m => {
    const ciudad = ciudadPorBloqueId[m.bloque_id] ?? '—';
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
    <div
      className="charts-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 'var(--space-4)',
      }}
    >

      {/* -------------------------------------------
          TENDENCIA DEL PUNTO SELECCIONADO
      ------------------------------------------- */}

      <ChartCard
        title="TENDENCIA — ÁREA CORROÍDA (%)"
        subtitle={selectedPunto ? `${selectedPunto.nombre} · últimas ${trendData.length} mediciones` : 'SELECCIONA UN PUNTO EN EL MAPA'}
      >
        {!selectedPunto ? (
          <EmptyChart message="Selecciona un punto en el mapa o la lista para ver su tendencia" />
        ) : loadingPunto ? (
          <BarsSkeleton />
        ) : trendData.length < 2 ? (
          <EmptyChart message="Este punto todavía no tiene suficientes mediciones para una tendencia" />
        ) : (
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${selectedPunto.id_bloque}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-amber)" stopOpacity={0.4}/>
                  <stop offset="100%" stopColor="var(--accent-amber)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="fecha" tick={{ fill: 'var(--text-muted)', fontSize: 'var(--text-2xs)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 'var(--text-3xs)' }} tickLine={false} axisLine={false} unit="%" />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="corrosion" name="Área %" stroke="var(--accent-amber)" strokeWidth={2} fill={`url(#grad-${selectedPunto.id_bloque})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* -------------------------------------------
          MEDICIONES POR CIUDAD
      ------------------------------------------- */}

      <ChartCard
        title="MEDICIONES POR CIUDAD"
        subtitle="TOP INSTALACIONES · CANTIDAD DE REGISTROS"
      >
        {loading ? (
          <BarsSkeleton />
        ) : cityData.length === 0 ? (
          <EmptyChart message="Sin datos suficientes para mostrar tendencias" />
        ) : (
          <ResponsiveContainer width="100%" height={150}>
            <BarChart
              data={cityData}
              margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-muted)', fontSize: 'var(--text-2xs)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-faint)', fontSize: 'var(--text-3xs)' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Mediciones" radius={[2, 2, 0, 0]} maxBarSize={28}>
                {cityData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}) {
  return (
    <div
      className="card"
      style={{
        padding: '16px 16px 12px',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-ui)',
          marginBottom: 2,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-ui)',
          marginBottom: 'var(--space-3)',
        }}
      >
        {subtitle}
      </div>

      {children}
    </div>
  );
}