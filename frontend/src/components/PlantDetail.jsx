import React from 'react';
import { useMedicionesPunto } from '../hooks/useMedicionesPunto';
import {
  nivelColor, nivelBg, nivelLabel,
} from '../lib/statusUtils';
import { formatFecha } from '../utils/dateFormat';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, Thermometer, Droplets, CloudRain, Wind } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-section)', border: '1px solid var(--border)',
      padding: '8px 12px', fontFamily: 'var(--font-data)', fontSize: 'var(--text-2xs)',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>{label}</div>
      <div style={{ color: 'var(--accent-amber)' }}>
        Área: <strong>{payload[0]?.value?.toFixed(1)}%</strong>
      </div>
    </div>
  );
};

// ─── Tarjeta Flashcard de Ubicación (Dashboard) ─────────────────────────────
export default function PlantDetail({ punto }) {
  const { mediciones, loading, error } = useMedicionesPunto(punto?.id_bloque);

  if (!punto) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', gap: 'var(--space-3)',
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" opacity="0.3">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="#7a9ab5" strokeWidth="1.5"/>
          <circle cx="12" cy="9" r="2.5" stroke="#7a9ab5" strokeWidth="1.5"/>
        </svg>
        <div style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.02em', textTransform: 'uppercase', textAlign: 'center', padding: '0 16px', fontWeight: 500 }}>
          Selecciona un punto en el mapa
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

  const clima = ultimaMedicion?.clima;
  const stats = [
    ...(clima ? [
      { Icon: Thermometer, label: 'Temp.', v: clima.temperatura_c != null ? `${clima.temperatura_c}°C` : null },
      { Icon: Droplets, label: 'Humedad', v: clima.humedad_pct != null ? `${clima.humedad_pct}%` : null },
      { Icon: CloudRain, label: 'Precip.', v: clima.precipitacion_mm != null ? `${clima.precipitacion_mm} mm` : null },
      { Icon: Wind, label: 'Viento', v: clima.velocidad_viento_kmh != null ? `${clima.velocidad_viento_kmh} km/h` : null },
    ] : []),
  ].filter(x => x.v);

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Flashcard superior del punto: 1) Título + subtítulo, 2) Caja encuadrada
          de clima en el centro, 3) Pie con total de mediciones y píldora de estado */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        background: bg, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* 1. Título y subtítulo con pesos diferenciados */}
        <div>
          <div style={{
            fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 17,
            color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.15,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {punto.nombre ?? 'Punto sin nombre'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
            {punto.ciudad ?? '—'}{punto.departamento ? ` · ${punto.departamento}` : ''}
          </div>
        </div>

        {/* 2. Bloque central encuadrado: datos meteorológicos con iconos y textos grandes */}
        {stats.length > 0 && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 10px',
            display: 'grid',
            gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
            gap: 6,
          }}>
            {stats.map(({ Icon, label, v }) => (
              <div key={label} style={{ textAlign: 'center', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Icon size={16} strokeWidth={2} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
                  <span style={{
                    fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 15,
                    color: 'var(--text-primary)', lineHeight: 1.1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {v}
                  </span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3. Pie de la flashcard: métrica clave a la izquierda + píldora a la derecha */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-data)', fontWeight: 800, fontSize: 16,
              color: 'var(--text-primary)', lineHeight: 1.1,
            }}>
              {mediciones.length} {mediciones.length === 1 ? 'medición' : 'mediciones'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {ultimaMedicion?.area_corroida_pct != null
                ? `Última área: ${ultimaMedicion.area_corroida_pct.toFixed(1)}%`
                : 'Sin lecturas registradas'}
            </div>
          </div>

          {nivel >= 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 999,
              background: 'var(--bg-card)', border: `1px solid ${color}60`,
              fontSize: 12, fontWeight: 700, color,
              animation: nivel === 3 ? 'blink 1.2s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
              {nivelLabel(nivel)}
            </div>
          )}
        </div>
      </div>

      {/* Gráfica de tendencia */}
      {trendData.length > 1 && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 'var(--space-2)', fontWeight: 600 }}>
            TENDENCIA — ÁREA CORROÍDA (%)
          </div>
          <ResponsiveContainer width="100%" height={70}>
            <AreaChart data={trendData} margin={{ top: 2, right: 0, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${punto.id_bloque}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C1460B" stopOpacity={0.4}/>
                  <stop offset="100%" stopColor="#C1460B" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="fecha" tick={{ fill: '#3d5a72', fontSize: 8 }} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fill: '#3d5a72', fontSize: 8 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="corrosion" stroke="#C1460B" strokeWidth={1.5} fill={`url(#grad-${punto.id_bloque})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Historial de mediciones */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-2)' }}>
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', letterSpacing: '0.04em', padding: '4px 8px 8px', fontWeight: 600 }}>
          HISTORIAL DE MEDICIONES
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
            Cargando…
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 'var(--space-3)', fontSize: 'var(--text-2xs)', color: 'var(--accent-red)' }}>Error: {error}</div>
        )}
        {!loading && !error && mediciones.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            Sin mediciones registradas para este punto.
          </div>
        )}
        {/* Antes esta lista crecia con la cantidad real de fotos: una planta
            con 10 mediciones estiraba toda la seccion, y como el grid del
            Dashboard reparte una sola fila entre plantas/mapa/detalle, el
            mapa se estiraba con ella. `height: 100%` mas arriba solo funciona
            si un ancestro tiene un alto DEFINIDO — la seccion solo tenia
            minHeight (un piso, no un techo), asi que "100%" no tenia contra
            que resolver y el contenido crecia libre. Ahora el visor queda
            fijo en ~5 filas (280px, medido sobre MedicionRow real) y el
            resto se recorre con la rueda del mouse ahi adentro, sin mover el
            alto de nada mas alrededor. */}
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
            maxHeight: 280, overflowY: 'auto', overscrollBehavior: 'contain',
            paddingRight: 2,
          }}
        >
          {mediciones.slice(0, 50).map((m, i) => (
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
  const fecha = formatFecha(medicion.timestamp, { conHora: true });

  return (
    <div style={{
      padding: '8px 10px',
      background: 'var(--bg-section)',
      border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      borderLeft: `3px solid ${color}`,
    }}>
      {/* Miniatura -- 36px, así que usa url_thumbnail (~400px) en vez de
          bajar la foto original completa para mostrar un cuadrito */}
      {medicion.url_imagen ? (
        <img
          src={medicion.url_thumbnail || medicion.url_imagen}
          alt=""
          loading="lazy"
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
          <span style={{ fontSize: 'var(--text-3xs)', fontWeight: 600, color, fontFamily: 'var(--font-data)' }}>
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
