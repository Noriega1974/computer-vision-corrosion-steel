import React, { useEffect, useMemo, useState } from 'react';
import { useResumenDiario } from '../hooks/useResumenDiario';
import { anioColombia } from '../lib/fechas';
import { aniosDesde } from '../lib/resumenDiario';
import { puntosTendencia, textoPromedioDia, resumenAccesible } from '../lib/tendenciaDiaria';
import { construirEje, filaConDatosCercana, MODO_FECHAS_DEFECTO } from '../lib/ejeFechasTendencia';
import { formatoPct, plural } from '../lib/textUtils';
import { COLORES_NIVEL, nivelColorTexto, nivelLabel } from '../lib/statusUtils';
import { ComposedChart, Area, Bar, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import Skeleton, { SkeletonLinea } from './Skeleton';

// Total height of the two plots (average on top, photos per level below), axis included.
const ALTO_GRAFICA = 190;
const PROPORCION_SUPERIOR = 0.56;
const ANCHO_EJE_Y = 36;
const COLOR_LINEA = 'var(--accent-amber)';
const UMBRAL_MODERADA = 10;
const UMBRAL_SEVERA = 25;
const NIVELES = [0, 1, 2, 3];
const MARGEN = { top: 4, right: 6, left: 0, bottom: 0 };
const MARGEN_SEPARACION = 6;
// Below this width the two reading lines wrap, so each reserves two lines (no jumping on hover).
const ANCHO_LECTURA_ANGOSTA = 480;
const TICK = { fill: 'var(--text-muted)', fontSize: 11 };

// Temporary, only for the screenshot round of the owner (dev server only):
// ?tg_alto=140|190|240 and ?tg_fechas=compacto|proporcional|saltos.
function opcionesDeDesarrollo() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const alto = Number(q.get('tg_alto'));
  return { alto: alto > 0 ? alto : undefined, fechas: q.get('tg_fechas') || undefined };
}

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

function PuntoDia({ cx, cy, payload }) {
  if (cx == null || cy == null || payload?.promedio == null) return null;
  return <circle cx={cx} cy={cy} r={2.5} fill={COLOR_LINEA} stroke="var(--bg-card-solid)" strokeWidth={1} />;
}

// Y axis of the average plot: the two level thresholds (10 and 25 %) are always the
// preferred labels; 0 and the top of the range only appear if they do not collide.
function ejeY(puntos, altoPx) {
  const tope = Math.max(...puntos.map((p) => p.maxPct ?? p.promedio), 0);
  const max = tope <= 12 ? 15 : tope <= 30 ? 30 : Math.ceil(tope / 10) * 10;
  const px = (v) => (v / max) * altoPx;
  const ticks = [];
  [UMBRAL_SEVERA, UMBRAL_MODERADA, max, 0].forEach((v) => {
    if (v <= max && !ticks.includes(v) && ticks.every((t) => Math.abs(px(t) - px(v)) >= 13)) ticks.push(v);
  });
  return { dominio: [0, max], ticks: ticks.sort((x, y) => x - y) };
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
            {nivelLabel(n)}{' '}
            <strong style={{ color: d.porNivel[n] === 0 ? 'inherit' : nivelColorTexto(n) }}>{d.porNivel[n]}</strong>
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
export default function TendenciaPunto({ punto, alturaGrafica = ALTO_GRAFICA, modoFechas = MODO_FECHAS_DEFECTO }) {
  const dev = useMemo(opcionesDeDesarrollo, []);
  const alto = dev.alto ?? alturaGrafica;
  const modo = dev.fechas ?? modoFechas;
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
  const eje = useMemo(() => construirEje(trendData, { modo, anchoPx: anchoPlot }), [trendData, modo, anchoPlot]);
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
    const y = ejeY(trendData, altoSuperior - MARGEN.top - MARGEN_SEPARACION);
    const alHover = (e) => {
      const f = filaConDatosCercana(filas, e?.activeTooltipIndex);
      setPuntoActivo((prev) => (prev === f || !f ? prev : trendData.find((p) => p.fecha === f.fecha) ?? prev));
    };
    const manejadores = { onMouseMove: alHover, onMouseLeave: () => setPuntoActivo(null) };
    const marcas = (conTexto) => (
      <>
        {eje.meses.map((m) => (
          <ReferenceLine key={m.clave} x={m.clave} stroke="var(--border-strong)" strokeOpacity={0.6}
            label={conTexto ? { value: m.texto, position: 'insideTopLeft', fill: 'var(--text-muted)', fontSize: 10, dx: 3 } : undefined} />
        ))}
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
                <XAxis dataKey="clave" hide />
                <YAxis width={ANCHO_EJE_Y} domain={y.dominio} ticks={y.ticks} interval={0} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <ReferenceLine y={UMBRAL_MODERADA} stroke="var(--text-muted)" strokeDasharray="1 3" strokeOpacity={0.55} />
                <ReferenceLine y={UMBRAL_SEVERA} stroke="var(--text-muted)" strokeDasharray="1 3" strokeOpacity={0.55} />
                {marcas(true)}
                <Tooltip content={() => null} cursor={false} />
                <Area type="monotone" dataKey="banda" stroke="none" fill={COLOR_LINEA} fillOpacity={0.16}
                  isAnimationActive={false} activeDot={false} />
                {/* Proportional axis: days without data break the solid line; a thin dashed one bridges them. */}
                {modo === 'proporcional' && (
                  <Line type="monotone" dataKey="promedio" stroke={COLOR_LINEA} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.7}
                    connectNulls dot={false} activeDot={false} isAnimationActive={false} />
                )}
                <Line type="monotone" dataKey="promedio" stroke={COLOR_LINEA} strokeWidth={1.75}
                  dot={<PuntoDia />} activeDot={<PuntoDia />} isAnimationActive={false} />
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
