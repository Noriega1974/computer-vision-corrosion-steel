import React from 'react';
import { useMedicionesPunto } from '../hooks/useMedicionesPunto';
import {
  nivelColor, nivelBg, nivelLabel, nivelToStatus,
} from '../lib/statusUtils';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-section)', border: '1px solid var(--border)',
      padding: '8px 12px', fontFamily: 'var(--font-data)', fontSize: 11,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#1432A3' }}>
        Área: <strong>{payload[0]?.value?.toFixed(1)}%</strong>
      </div>
    </div>
  );
};

export default function PlantDetail({ punto }) {
  const { mediciones, loading, error } = useMedicionesPunto(punto?.id_punto);

  if (!punto) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', gap: 12,
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" opacity="0.3">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="#7a9ab5" strokeWidth="1.5"/>
          <circle cx="12" cy="9" r="2.5" stroke="#7a9ab5" strokeWidth="1.5"/>
        </svg>
        <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', textAlign: 'center', padding: '0 16px' }}>
          Selecciona una planta en el mapa
        </div>
      </div>
    );
  }

  const ultimaMedicion = mediciones[0] ?? null;
  const nivel = ultimaMedicion?.nivel_corrosion ?? -1;
  const color = nivel >= 0 ? nivelColor(nivel) : 'var(--text-muted)';
  const bg = nivel >= 0 ? nivelBg(nivel) : 'transparent';

  // Datos del trend: últimas 20 mediciones ordenadas cronológicamente
  const trendData = [...mediciones]
    .filter(m => m.area_corroida_pct != null)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-20)
    .map(m => ({
      fecha: new Date(m.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
      corrosion: parseFloat((m.area_corroida_pct ?? 0).toFixed(1)),
    }));

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header del punto */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
        background: bg, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 16,
              color, letterSpacing: '0.04em', lineHeight: 1,
            }}>
              {(punto.sede ?? punto.id_punto).toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.08em' }}>
              {punto.ciudad} · {punto.departamento} · {punto.empresa}
            </div>
          </div>
          {nivel >= 0 && (
            <div style={{
              padding: '4px 10px',
              background: `${color}15`,
              border: `1px solid ${color}50`,
              fontSize: 10, fontWeight: 700, color,
              letterSpacing: '0.1em',
              animation: nivel === 3 ? 'blink 1.2s ease-in-out infinite' : 'none',
            }}>
              {nivelLabel(nivel).toUpperCase()}
            </div>
          )}
        </div>

        {/* Meta info */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {[
            { l: 'Estructura', v: punto.tipo_estructura || '—' },
            { l: 'Espesor', v: punto.grosor_mm != null ? `${punto.grosor_mm} mm` : '—' },
            { l: 'Mediciones', v: mediciones.length },
          ].map(({ l, v }) => (
            <div key={l} style={{ textAlign: 'center', minWidth: 50 }}>
              <div style={{ fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 2 }}>{l.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Clima de la última medición */}
        {ultimaMedicion?.clima && (
          <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            {[
              { icon: '🌡', label: 'Temp.', v: ultimaMedicion.clima.temperatura_c != null ? `${ultimaMedicion.clima.temperatura_c}°C` : null },
              { icon: '💧', label: 'Humedad', v: ultimaMedicion.clima.humedad_pct != null ? `${ultimaMedicion.clima.humedad_pct}%` : null },
              { icon: '🌧', label: 'Precip.', v: ultimaMedicion.clima.precipitacion_mm != null ? `${ultimaMedicion.clima.precipitacion_mm} mm` : null },
              { icon: '💨', label: 'Viento', v: ultimaMedicion.clima.velocidad_viento_kmh != null ? `${ultimaMedicion.clima.velocidad_viento_kmh} km/h` : null },
            ].filter(x => x.v).map(({ icon, label, v }) => (
              <div key={label} style={{ textAlign: 'center', minWidth: 44 }}>
                <div style={{ fontSize: 12, lineHeight: 1 }}>{icon}</div>
                <div style={{ fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 11, color: 'var(--text-primary)', marginTop: 2 }}>{v}</div>
                <div style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{label.toUpperCase()}</div>
              </div>
            ))}
            <div style={{ alignSelf: 'flex-end', fontSize: 8, color: 'var(--text-faint)', letterSpacing: '0.08em', marginLeft: 'auto' }}>
              ÚLTIMA MEDICIÓN
            </div>
          </div>
        )}
      </div>

      {/* Gráfica de tendencia */}
      {trendData.length > 1 && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 8 }}>
            TENDENCIA — ÁREA CORROÍDA (%)
          </div>
          <ResponsiveContainer width="100%" height={70}>
            <AreaChart data={trendData} margin={{ top: 2, right: 0, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${punto.id_punto}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1432A3" stopOpacity={0.4}/>
                  <stop offset="100%" stopColor="#1432A3" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="fecha" tick={{ fill: '#3d5a72', fontSize: 8 }} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fill: '#3d5a72', fontSize: 8 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="corrosion" stroke="#1432A3" strokeWidth={1.5} fill={`url(#grad-${punto.id_punto})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Historial de mediciones */}
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', padding: '4px 8px 8px' }}>
          HISTORIAL DE MEDICIONES
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 11, color: 'var(--text-muted)' }}>
            Cargando…
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--accent-red)' }}>Error: {error}</div>
        )}
        {!loading && !error && mediciones.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            Sin mediciones registradas para esta planta.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {mediciones.slice(0, 15).map((m, i) => (
            <MedicionRow key={m.id_medicion ?? i} medicion={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MedicionRow({ medicion }) {
  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const fecha = medicion.timestamp
    ? new Date(medicion.timestamp).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div style={{
      padding: '8px 10px',
      background: 'var(--bg-section)',
      border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 8,
      borderLeft: `3px solid ${color}`,
    }}>
      {/* Miniatura */}
      {medicion.url_imagen ? (
        <img
          src={medicion.url_imagen}
          alt=""
          style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--border)' }}
        />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: 4, flexShrink: 0,
          background: `${color}15`, border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16,
        }}>
          📷
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color, fontFamily: 'var(--font-data)' }}>
            {nivelLabel(nivel)}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{fecha}</span>
        </div>
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, (medicion.area_corroida_pct ?? 0) * 2)}%`,
            background: color, borderRadius: 2,
          }} />
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
          <span>Área: {(medicion.area_corroida_pct ?? 0).toFixed(1)}%</span>
          {medicion.notas && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{medicion.notas}</span>}
        </div>
      </div>
    </div>
  );
}
