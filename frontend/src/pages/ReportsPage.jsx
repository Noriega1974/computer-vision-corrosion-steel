import React, { useState, useCallback } from 'react';
import {
  ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { FileText, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useReporte } from '../hooks/useReporte';
import { usePuntos } from '../hooks/usePuntos';
import { nivelLabel, nivelColor, nivelBg, nivelToStatus } from '../lib/statusUtils';

const PIE_COLORS = ['#16a34a', '#d97706', '#ea580c', '#dc2626'];

// ─── Skeleton row ────────────────────────────────────────────────────────────
function SkeletonRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '10px 12px' }}>
          <div style={{
            height: 14, borderRadius: 4,
            background: 'var(--border)',
            animation: 'shimmer 1.5s infinite',
            width: i === 0 ? '60%' : '80%',
          }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Tendencia badge ─────────────────────────────────────────────────────────
// Acepta número (reporte global) o string 'mejorando'|'estable'|'empeorando' (reporte planta)
function TendenciaBadge({ valor }) {
  if (valor === undefined || valor === null) return null;

  const mejorando = valor === 'mejorando' || (typeof valor === 'number' && valor < -0.01);
  const empeorando = valor === 'empeorando' || (typeof valor === 'number' && valor > 0.01);

  if (mejorando) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a', fontSize: 12, fontWeight: 600 }}>
      <TrendingDown size={13} /> Mejorando
    </span>
  );
  if (empeorando) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626', fontSize: 12, fontWeight: 600 }}>
      <TrendingUp size={13} /> Empeorando
    </span>
  );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-amber)', fontSize: 12, fontWeight: 600 }}>
      <Minus size={13} /> Estable
    </span>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 18px', flex: '1 1 140px',
    }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-data)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontFamily: 'var(--font-data)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function agregarRegresion(data) {
  if (data.length < 2) return data.map(d => ({ ...d, tendencia: null }));

  // Exclude nivel=0 (new/replaced sheets) — they have no weight in the trend
  const validIndices = data.reduce((acc, d, i) => {
    if (d.nivel > 0 && d.area > 1) acc.push(i);
    return acc;
  }, []);

  if (validIndices.length < 2) return data.map(d => ({ ...d, tendencia: null }));

  const n = validIndices.length;
  const xs = validIndices.map((_, i) => i);
  const ys = validIndices.map(i => data[i].area);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return data.map(d => ({ ...d, tendencia: null }));

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const trendByIndex = new Map(
    validIndices.map((dataIdx, segIdx) => [
      dataIdx,
      parseFloat(Math.max(0, intercept + slope * segIdx).toFixed(2)),
    ])
  );

  return data.map((d, i) => ({ ...d, tendencia: trendByIndex.get(i) ?? null }));
}

const hoyISO = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};

export default function ReportsPage() {
  const [idPunto, setIdPunto] = useState('');
  const [desde, setDesde] = useState('');
  const hasta = hoyISO();
  const { reporte, loading, error, generarReporte, limpiar } = useReporte();
  const { puntos } = usePuntos();

  const handleGenerar = useCallback(() => {
    const desdeISO = new Date(desde + 'T00:00:00').toISOString();
    const hastaISO = new Date(hasta + 'T23:59:59').toISOString();
    generarReporte('planta', { idPunto, desde: desdeISO, hasta: hastaISO });
  }, [idPunto, desde, hasta, generarReporte]);

  const tendencia = reporte?.tendencia ?? null;
  const mediciones = reporte?.mediciones ?? [];

  const areaData = agregarRegresion(mediciones.map(m => ({
    fecha: m.timestamp?.slice(0, 10) ?? '',
    area: typeof m.area_corroida_pct === 'number' ? m.area_corroida_pct : 0,
    nivel: m.nivel_corrosion ?? 0,
  })));

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white; }
        }
        .print-only { display: none; }
      `}</style>

      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Encabezado ── */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ background: 'var(--accent-amber)', width: 3, height: 20, borderRadius: 2, display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              Reportes
            </span>
          </div>
        </div>

        {/* ── Filtros ── */}
        <div className="no-print" style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '16px 20px', marginBottom: 20,
          display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
        }}>
          {/* Selector de planta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontFamily: 'var(--font-data)', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Planta
            </label>
            <select value={idPunto} onChange={e => { setIdPunto(e.target.value); limpiar(); }} style={{
              padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
              background: 'var(--bg-page)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)', fontSize: 13, minWidth: 200,
            }}>
              <option value="">Seleccionar planta...</option>
              {puntos.map(p => (
                <option key={p.id_punto} value={p.id_punto}>
                  {[p.sede, p.ciudad, p.empresa].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha desde */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontFamily: 'var(--font-data)', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Desde
            </label>
            <input
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--bg-page)', color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)', fontSize: 13,
              }}
            />
          </div>

          {/* Fecha hasta — siempre hoy */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontFamily: 'var(--font-data)', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Hasta
            </label>
            <input
              type="date"
              value={hasta}
              readOnly
              style={{
                padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--bg-inset)', color: 'var(--text-muted)',
                fontFamily: 'var(--font-ui)', fontSize: 13, cursor: 'default',
              }}
            />
          </div>

          <button
            onClick={handleGenerar}
            disabled={!idPunto || !desde}
            style={{
              padding: '8px 20px', background: 'var(--accent-amber)', border: 'none',
              borderRadius: 8, cursor: (!idPunto || !desde) ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'white',
              opacity: (!idPunto || !desde) ? 0.5 : 1,
            }}
          >
            Generar reporte
          </button>
        </div>

        {/* ── Estado vacío / Error ── */}
        {error && (
          <div style={{ padding: 20, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        {!reporte && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-faint)' }}>
            <FileText size={40} strokeWidth={1.2} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div style={{ fontSize: 14, fontFamily: 'var(--font-ui)' }}>Configura los filtros y genera un reporte</div>
          </div>
        )}

        {/* ── Contenido del reporte ── */}
        {(reporte || loading) && (
          <div>
            {/* Print header */}
            <div className="print-only" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-ui)' }}>
                {`Reporte de Planta — ${reporte?.punto?.sede ?? ''}`}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Generado el {new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                {desde && ` · Desde ${desde}`} · Hasta {hasta}
              </div>
            </div>

            {/* Plant metadata row */}
            {reporte?.punto && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 20,
                padding: '12px 16px', background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 10,
                fontFamily: 'var(--font-ui)', fontSize: 12,
              }}>
                {[
                  ['Planta', reporte.punto.sede ?? reporte.punto.nombre_punto],
                  ['Ciudad', reporte.punto.ciudad],
                  ['Estructura', reporte.punto.tipo_estructura],
                  ['Espesor', reporte.punto.grosor_mm != null ? `${reporte.punto.grosor_mm} mm` : null],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-data)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginRight: 6 }}>
                      {label}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* KPIs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <KPICard label="Total mediciones" value={loading ? '…' : (reporte?.total_mediciones ?? mediciones.length)} />
              <KPICard label="Nivel promedio" value={loading ? '…' : (reporte?.nivel_promedio != null ? reporte.nivel_promedio.toFixed(2) : '—')} />
              <KPICard label="Área corroída prom." value={loading ? '…' : (reporte?.area_promedio != null ? `${parseFloat(reporte.area_promedio).toFixed(1)}%` : '—')} />
              <KPICard
                label="Tendencia"
                value={loading ? '…' : <TendenciaBadge valor={tendencia} />}
              />
            </div>

            {/* Gráfico: área corroída en el tiempo */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-data)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 12 }}>
                Área corroída (%) en el tiempo
              </div>
              {loading ? (
                <div style={{ height: 200, background: 'var(--border)', borderRadius: 6, animation: 'shimmer 1.5s infinite' }} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={areaData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="area" stroke="var(--accent-amber)" fill="rgba(20,50,163,0.12)" strokeWidth={2} dot={false} name="Área %" />
                    <Line type="linear" dataKey="tendencia" stroke="#60a5fa" strokeWidth={1.5} dot={false} strokeDasharray="4 3" name="Tendencia" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Tabla de mediciones */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-data)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)' }}>
                  Detalle de mediciones
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-ui)' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-page)' }}>
                      {['Fecha', 'Planta', 'Ciudad', 'Nivel', 'Área corroída', 'Temp.', 'Humedad'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                      : mediciones.map((m, i) => {
                          const status = nivelToStatus(m.nivel_corrosion ?? 0);
                          return (
                            <tr key={m.id_medicion ?? i} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{m.timestamp?.slice(0, 10) ?? '—'}</td>
                              <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{m.sede ?? reporte?.punto?.sede ?? '—'}</td>
                              <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{m.ciudad ?? reporte?.punto?.ciudad ?? '—'}</td>
                              <td style={{ padding: '9px 12px' }}>
                                <span style={{
                                  display: 'inline-block', padding: '2px 8px', borderRadius: 5,
                                  background: nivelBg(m.nivel_corrosion ?? 0),
                                  color: nivelColor(m.nivel_corrosion ?? 0),
                                  fontSize: 11, fontWeight: 600,
                                }}>
                                  {nivelLabel(m.nivel_corrosion ?? 0)}
                                </span>
                              </td>
                              <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-data)' }}>
                                {m.area_corroida_pct != null ? `${m.area_corroida_pct.toFixed(1)}%` : '—'}
                              </td>
                              <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
                                {m.clima?.temperatura_c != null ? `${m.clima.temperatura_c}°C` : '—'}
                              </td>
                              <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
                                {m.clima?.humedad_pct != null ? `${m.clima.humedad_pct}%` : '—'}
                              </td>
                            </tr>
                          );
                        })
                    }
                    {!loading && mediciones.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>Sin mediciones en el rango seleccionado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
