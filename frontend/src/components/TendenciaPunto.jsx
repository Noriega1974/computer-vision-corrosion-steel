import React, { useState } from 'react';
import { useMedicionesPunto } from '../hooks/useMedicionesPunto';
import { formatoPct, baseArea } from '../lib/textUtils';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Skeleton, { SkeletonLinea } from './Skeleton';

const ALTO_GRAFICA = 96;

const AVISO_STYLE = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  textAlign: 'center', padding: '0 var(--space-3)',
  fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
};

// Mitad derecha de "Indicadores globales": tendencia del área corroída del
// punto elegido en el mapa o en la lista. Sin punto elegido muestra un aviso.
export default function TendenciaPunto({ punto }) {
  const { mediciones, loading } = useMedicionesPunto(punto?.id_bloque);
  // Lectura del punto bajo el cursor; va en una línea fija sobre la gráfica
  // para no tapar los ejes.
  const [puntoActivo, setPuntoActivo] = useState(null);

  // Últimas 20 mediciones en orden cronológico.
  const trendData = [...mediciones]
    .filter(m => m.area_corroida_pct != null)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-20)
    .map(m => ({
      fecha: new Date(m.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
      corrosion: parseFloat((m.area_corroida_pct ?? 0).toFixed(1)),
      base: baseArea(m),
    }));

  let contenido;
  if (!punto) {
    contenido = <div style={AVISO_STYLE}>Selecciona un punto en el mapa para ver su tendencia</div>;
  } else if (loading) {
    contenido = (
      <div aria-busy="true">
        <div style={{ minHeight: 16, marginBottom: 'var(--space-1)' }}><SkeletonLinea width={160} /></div>
        <Skeleton height={ALTO_GRAFICA} radius={8} />
      </div>
    );
  } else if (trendData.length < 2) {
    contenido = <div style={AVISO_STYLE}>Este punto necesita al menos dos mediciones para mostrar su tendencia</div>;
  } else {
    const d = puntoActivo ?? trendData[trendData.length - 1];
    contenido = (
      <div>
        <div aria-live="off" style={{
          fontFamily: 'var(--font-data)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)',
          minHeight: 16, marginBottom: 'var(--space-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {d.fecha} · <strong style={{ color: 'var(--accent-amber)' }}>{formatoPct(d.corrosion)}</strong> sobre la {d.base}
        </div>
        <ResponsiveContainer width="100%" height={ALTO_GRAFICA}>
          <AreaChart
            data={trendData}
            margin={{ top: 2, right: 0, left: -28, bottom: 0 }}
            onMouseMove={(e) => {
              const i = e?.activeTooltipIndex;
              const activo = i != null ? trendData[i] : null;
              setPuntoActivo((prev) => (prev === activo ? prev : activo));
            }}
            onMouseLeave={() => setPuntoActivo(null)}
          >
            <defs>
              <linearGradient id={`grad-${punto.id_bloque}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C1460B" stopOpacity={0.4}/>
                <stop offset="100%" stopColor="#C1460B" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="fecha" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip content={() => null} cursor={{ stroke: 'var(--border-strong)' }} />
            <Area type="monotone" dataKey="corrosion" stroke="#C1460B" strokeWidth={1.5} fill={`url(#grad-${punto.id_bloque})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="card ind-card" aria-busy={(punto && loading) || undefined}>
      <div className="ind-card-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        Tendencia del área corroída (%){punto?.nombre ? ` · ${punto.nombre}` : ''}
      </div>
      {contenido}
    </div>
  );
}
