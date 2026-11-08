import React, { useEffect, useMemo, useState } from 'react';
import { useResumenDiario } from '../hooks/useResumenDiario';
import { anioColombia } from '../lib/fechas';
import { aniosDesde } from '../lib/resumenDiario';
import { puntosTendencia, textoPromedioDia, resumenAccesible, ejePorcentaje } from '../lib/tendenciaDiaria';
import { construirEje, filaConDatosCercana } from '../lib/ejeFechasTendencia';
import { formatoPct, plural } from '../lib/textUtils';
import { COLORES_NIVEL, nivelColorTexto, nivelLabel } from '../lib/statusUtils';
import { ComposedChart, Area, Bar, Line, XAxis, YAxis, Tooltip, ReferenceLine, Customized } from 'recharts';
import Skeleton, { SkeletonLinea } from './Skeleton';

// Total height of the two plots (average on top, photos per level below), axis included.
const ALTO_GRAFICA = 190;
const PROPORCION_SUPERIOR = 0.58;
const ANCHO_EJE_Y = 36;
const COLOR_LINEA = 'var(--accent-amber)';
const NIVELES = [0, 1, 2, 3];
const MARGEN = { top: 4, right: 6, left: 0, bottom: 0 };
const MARGEN_SEPARACION = 12;
// Below this width the two reading lines wrap, so each reserves two lines (no jumping on hover).
const ANCHO_LECTURA_ANGOSTA = 480;
const TICK = { fill: 'var(--text-muted)', fontSize: 11 };

const AVISO_STYLE = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  textAlign: 'center', padding: '0 var(--space-3)',
  fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
};

// Width of an element, kept up to date on resize (the plots are fixed-size SVG).
function useAncho(el) {
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    if (!el) return undefined;
    const medir = () => setAncho(Math.round(el.getBoundingClientRect().width));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return ancho;
}

// One dot per day, filled with the day's level color; the ring matches the card
// background so the dot stands out from the line in light and dark themes.
function PuntoDia({ cx, cy, payload, activo }) {
  if (cx == null || cy == null || payload?.promedio == null) return null;
  const relleno = COLORES_NIVEL[payload.nivel] ?? COLOR_LINEA;
  return <circle cx={cx} cy={cy} r={activo ? 6.5 : 4.5} fill={relleno} stroke="var(--bg-card-solid)" strokeWidth={activo ? 2 : 1.5} />;
}
const PuntoActivo = (props) => <PuntoDia {...props} activo />;

// Faint solid gridline at every Y tick, so each label sits on its line.
const gridY = (y) => y.ticks.map((t) => (
  <ReferenceLine key={`g${t}`} y={t} stroke="var(--text-muted)" strokeOpacity={0.28} />
));

// Month separators: short subtle tick at the boundary between the last day of a month and the
// first of the next (midway between two slots, so it never covers a point). `arriba` draws it at
// the top with the month name just right of it (left if it would touch the plot edge).
function SeparadoresMes({ offset, meses, filas, arriba }) {
  if (!offset || !filas.length) return null;
  const ranura = offset.width / filas.length;
  return (
    <g aria-hidden="true">
      {meses.map((m) => {
        const x = offset.left + filas.findIndex((f) => f.clave === m.clave) * ranura;
        const y1 = arriba ? offset.top : offset.top + offset.height - 6;
        const y2 = arriba ? offset.top + 14 : offset.top + offset.height;
        const aDerecha = x + 3 + m.texto.length * 5.6 <= offset.left + offset.width - 2;
        return (
          <g key={m.clave}>
            <line x1={x} x2={x} y1={y1} y2={y2} stroke="var(--text-muted)" strokeOpacity={0.5} />
            {arriba && (
              <text x={aDerecha ? x + 3 : x - 3} y={offset.top + 10} textAnchor={aDerecha ? 'start' : 'end'}
                fill="var(--text-muted)" fontSize={10}>{m.texto}</text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// Reading of the hovered day (or the latest one) in two fixed lines; the level
// counts double as the legend of the bars.
function Lectura({ d, estrecho }) {
  const rango = d.minPct != null && d.maxPct != null ? `Rango ${formatoPct(d.minPct)} a ${formatoPct(d.maxPct)}` : null;
  return (
    <div aria-live="off" style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap', minHeight: estrecho ? 32 : 16 }}>
        <span>{d.etiqueta} · <strong style={{ color: 'var(--accent-amber)' }}>{formatoPct(d.promedio)}</strong> promedio · {plural(d.total, 'medición', 'mediciones')}</span>
        {rango && <span>{rango}</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-2)', minHeight: estrecho ? 32 : 16 }}>
        {NIVELES.map((n) => (
          <span key={n} style={{ whiteSpace: 'nowrap', opacity: d.porNivel[n] === 0 ? 0.6 : 1 }}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: COLORES_NIVEL[n], marginRight: 4 }} />
            <span style={{ color: nivelColorTexto(n) }}>{nivelLabel(n)}</span>{' '}
            <strong style={{ color: nivelColorTexto(n) }}>{d.porNivel[n]}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// Mitad derecha de "Indicadores globales": tendencia del área corroída del
// punto elegido en el mapa o en la lista. Un punto por día (promedio de todas
// las fotos del día), así escala a miles de mediciones. Arriba: promedio y banda
// mín-máx; abajo: fotos por nivel de cada día. Sin punto muestra un aviso.
export default function TendenciaPunto({ punto }) {
  const alto = ALTO_GRAFICA;
  const idPunto = punto?.id_bloque;
  const anios = useMemo(() => aniosDesde(anioColombia()), []);
  const resumen = useResumenDiario({ anios, idPunto, habilitado: Boolean(idPunto) });
  const loading = resumen.loading;
  // Lectura del punto bajo el cursor; va en una línea fija sobre la gráfica
  // para no tapar los ejes.
  const [puntoActivo, setPuntoActivo] = useState(null);
  // A hovered day of the previous point must not linger when another is chosen.
  useEffect(() => { setPuntoActivo(null); }, [idPunto]);

  const trendData = useMemo(() => puntosTendencia(resumen.dias), [resumen.dias]);
  const [contenedor, setContenedor] = useState(null);
  const ancho = useAncho(contenedor);
  const anchoPlot = Math.max(ancho - ANCHO_EJE_Y - MARGEN.right, 0);
  const eje = useMemo(() => construirEje(trendData, { anchoPx: anchoPlot }), [trendData, anchoPlot]);
  const filas = useMemo(() => eje.filas.map((f) => (f.vacio ? f : {
    ...f, n0: f.porNivel[0], n1: f.porNivel[1], n2: f.porNivel[2], n3: f.porNivel[3],
    banda: f.minPct != null && f.maxPct != null ? [f.minPct, f.maxPct] : null,
  })), [eje.filas]);
  const maxFotos = useMemo(() => Math.max(...trendData.map((p) => p.total), 1), [trendData]);

  let contenido;
  if (!punto) {
    contenido = <div style={AVISO_STYLE}>Selecciona un punto en el mapa para ver su tendencia</div>;
  } else if (loading) {
    contenido = (
      <div aria-busy="true">
        <div style={{ minHeight: 32, marginBottom: 'var(--space-1)' }}><SkeletonLinea width={160} /></div>
        <Skeleton height={alto} radius={8} />
      </div>
    );
  } else if (resumen.error) {
    contenido = <div role="alert" style={AVISO_STYLE}>No se pudo cargar la tendencia. Inténtalo de nuevo más tarde.</div>;
  } else if (trendData.length < 2) {
    contenido = <div style={AVISO_STYLE}>Este punto necesita mediciones en al menos dos días para mostrar su tendencia</div>;
  } else {
    const ultimo = trendData[trendData.length - 1];
    const d = puntoActivo ?? ultimo;
    const altoSuperior = Math.round(alto * PROPORCION_SUPERIOR);
    const altoInferior = alto - altoSuperior;
    const mediaRanura = anchoPlot / filas.length / 2;
    const y = ejePorcentaje(Math.max(...trendData.map((p) => p.maxPct ?? p.promedio), 0));
    const alHover = (e) => {
      const f = filaConDatosCercana(filas, e?.activeTooltipIndex);
      setPuntoActivo((prev) => (prev === f || !f ? prev : trendData.find((p) => p.fecha === f.fecha) ?? prev));
    };
    const manejadores = { onMouseMove: alHover, onMouseLeave: () => setPuntoActivo(null) };
    const marcas = (conTexto) => (
      <>
        <Customized component={<SeparadoresMes meses={eje.meses} filas={eje.filas} arriba={conTexto} />} />
        {eje.saltos.map((g) => (
          <ReferenceLine key={g.clave} x={g.clave} stroke="var(--text-muted)" strokeDasharray="2 3" strokeOpacity={0.8}
            label={conTexto ? { value: g.texto, angle: -90, position: 'center', fill: 'var(--text-muted)', fontSize: 10 } : undefined} />
        ))}
        {puntoActivo && <ReferenceLine x={puntoActivo.fecha} stroke="var(--text-secondary)" strokeOpacity={0.55} />}
      </>
    );
    contenido = (
      <div role="group" aria-label={`Tendencia del área corroída. Último día: ${textoPromedioDia(ultimo)}`}>
        <Lectura d={d} estrecho={ancho < ANCHO_LECTURA_ANGOSTA} />
        {/* The plots are pointer-only; the list below is their equivalent for keyboard and screen readers. */}
        <ul className="sr-only-pw" aria-label="Últimos 7 días con mediciones">
          {resumenAccesible(trendData, nivelLabel).map((linea) => <li key={linea}>{linea}</li>)}
        </ul>
        <div ref={setContenedor} aria-hidden="true" style={{ width: '100%' }}>
          {ancho > 0 && (
            <>
              <ComposedChart width={ancho} height={altoSuperior} data={filas} margin={{ ...MARGEN, bottom: MARGEN_SEPARACION }} {...manejadores}>
                {/* Half a slot of padding puts each point at the center of its bar below. */}
                <XAxis dataKey="clave" hide padding={{ left: mediaRanura, right: mediaRanura }} />
                <YAxis width={ANCHO_EJE_Y} domain={y.dominio} ticks={y.ticks} interval={0} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                {gridY(y)}
                {marcas(true)}
                <Tooltip content={() => null} cursor={false} />
                <Area type="monotone" dataKey="banda" stroke="none" fill={COLOR_LINEA} fillOpacity={0.16}
                  isAnimationActive={false} activeDot={false} />
                <Line type="monotone" dataKey="promedio" stroke={COLOR_LINEA} strokeWidth={1.75}
                  dot={<PuntoDia />} activeDot={<PuntoActivo />} isAnimationActive={false} />
              </ComposedChart>
              <ComposedChart width={ancho} height={altoInferior} data={filas} margin={{ ...MARGEN, top: 2 }} barCategoryGap="14%" {...manejadores}>
                <XAxis dataKey="clave" ticks={eje.ticks} interval={0} tick={TICK} tickLine={false} axisLine={{ stroke: 'var(--border)' }}
                  tickFormatter={(k) => eje.etiquetas[k] ?? ''} height={18} tickMargin={2} />
                <YAxis width={ANCHO_EJE_Y} domain={[0, maxFotos]} ticks={[0, maxFotos]} allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
                {marcas(false)}
                <Tooltip content={() => null} cursor={false} />
                {NIVELES.map((n) => (
                  <Bar key={n} dataKey={`n${n}`} stackId="niveles" fill={COLORES_NIVEL[n]} maxBarSize={22}
                    stroke="var(--bg-card-solid)" strokeWidth={0.5} isAnimationActive={false} />
                ))}
              </ComposedChart>
            </>
          )}
          {ancho === 0 && <div style={{ height: alto }} />}
        </div>
        {resumen.truncado && (
          <div role="note" style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
            Datos parciales: este punto tiene más mediciones de las que se pueden resumir.
          </div>
        )}
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
