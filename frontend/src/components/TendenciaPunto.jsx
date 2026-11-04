import React, { useMemo, useState } from 'react';
import { useResumenDiario } from '../hooks/useResumenDiario';
import { aniosDesde } from '../lib/resumenDiario';
import { puntosTendencia, textoPromedioDia, textoDetalleDia, pctTexto } from '../lib/tendenciaDiaria';
import { nivelColor, nivelLabel } from '../lib/statusUtils';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Skeleton, { SkeletonLinea } from './Skeleton';

const ALTO_GRAFICA = 80;
const COLOR_LINEA = '#C1460B';

const AVISO_STYLE = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  textAlign: 'center', padding: '0 var(--space-3)',
  fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
};

// Punto del día pintado con el color de su nivel ponderado.
function PuntoDia({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  const color = payload?.nivel != null ? nivelColor(payload.nivel) : COLOR_LINEA;
  return <circle cx={cx} cy={cy} r={3} fill={color} stroke="var(--bg-card)" strokeWidth={1} />;
}

// Mitad derecha de "Indicadores globales": tendencia del área corroída del
// punto elegido en el mapa o en la lista. Un punto por día (promedio de todas
// las fotos del día), así escala a miles de mediciones. Sin punto muestra un aviso.
export default function TendenciaPunto({ punto }) {
  const idPunto = punto?.id_bloque;
  const anios = useMemo(() => aniosDesde(new Date().getFullYear()), []);
  const resumen = useResumenDiario({ anios, idPunto, habilitado: Boolean(idPunto) });
  const loading = resumen.loading;
  // Lectura del punto bajo el cursor; va en una línea fija sobre la gráfica
  // para no tapar los ejes.
  const [puntoActivo, setPuntoActivo] = useState(null);

  const trendData = useMemo(() => puntosTendencia(resumen.dias), [resumen.dias]);

  let contenido;
  if (!punto) {
    contenido = <div style={AVISO_STYLE}>Selecciona un punto en el mapa para ver su tendencia</div>;
  } else if (loading) {
    contenido = (
      <div aria-busy="true">
        <div style={{ minHeight: 32, marginBottom: 'var(--space-1)' }}><SkeletonLinea width={160} /></div>
        <Skeleton height={ALTO_GRAFICA} radius={8} />
      </div>
    );
  } else if (resumen.error) {
    contenido = <div role="alert" style={AVISO_STYLE}>No se pudo cargar la tendencia. Inténtalo de nuevo más tarde.</div>;
  } else if (trendData.length < 2) {
    contenido = <div style={AVISO_STYLE}>Este punto necesita mediciones en al menos dos días para mostrar su tendencia</div>;
  } else {
    const d = puntoActivo ?? trendData[trendData.length - 1];
    contenido = (
      <div>
        <div aria-live="off" style={{
          fontFamily: 'var(--font-data)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)',
          marginBottom: 'var(--space-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          <div style={{ minHeight: 16, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.etiqueta} · <strong style={{ color: 'var(--accent-amber)' }}>{pctTexto(d.promedio)}</strong> promedio
          </div>
          <div style={{ minHeight: 16, overflow: 'hidden', textOverflow: 'ellipsis' }}>{textoDetalleDia(d, nivelLabel)}</div>
        </div>
        <ResponsiveContainer width="100%" height={ALTO_GRAFICA}>
          <AreaChart
            data={trendData}
            margin={{ top: 2, right: 6, left: -28, bottom: 0 }}
            onMouseMove={(e) => {
              const i = e?.activeTooltipIndex;
              const activo = i != null ? trendData[i] : null;
              setPuntoActivo((prev) => (prev === activo ? prev : activo));
            }}
            onMouseLeave={() => setPuntoActivo(null)}
          >
            <defs>
              <linearGradient id={`grad-${punto.id_bloque}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_LINEA} stopOpacity={0.4}/>
                <stop offset="100%" stopColor={COLOR_LINEA} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="etiqueta" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip content={() => null} cursor={{ stroke: 'var(--border-strong)' }} />
            <Area
              type="monotone" dataKey="promedio" stroke={COLOR_LINEA} strokeWidth={1.5}
              fill={`url(#grad-${punto.id_bloque})`} dot={<PuntoDia />} activeDot={<PuntoDia />}
              isAnimationActive={false}
            />
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
