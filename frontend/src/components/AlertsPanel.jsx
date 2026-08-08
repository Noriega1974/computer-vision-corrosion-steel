import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlertas } from '../hooks/useAlertas';
import { usePuntos } from '../hooks/usePuntos';
import {
  nivelToStatus, nivelColor, nivelBg, nivelLabel,
  getStatusColor, getStatusBg,
} from '../lib/statusUtils';

// Modal con detalle de una alerta/medición
function AlertDetailModal({ alerta, onClose }) {
  const navigate = useNavigate();
  const { puntos } = usePuntos();
  if (!alerta) return null;
  const nivel = alerta.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  // Las mediciones no traen punto_info anidado; se cruza con /puntos para la empresa
  const puntoCompleto = puntos.find(p => p.id_punto === alerta.id_punto) ?? {};
  const punto = {
    sede: alerta.sede ?? puntoCompleto.sede,
    ciudad: alerta.ciudad ?? puntoCompleto.ciudad,
    empresa: puntoCompleto.empresa,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000, padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', border: `1px solid ${color}50`,
        borderRadius: 12, padding: 24, maxWidth: 480, width: '100%',
        boxShadow: 'var(--shadow-lg)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, color }}>
              {nivelLabel(nivel)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {punto.sede ?? alerta.id_punto} · {punto.ciudad ?? ''}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 20, color: 'var(--text-muted)', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Imagen si está disponible */}
        {alerta.url_imagen && (
          <img
            src={alerta.url_imagen}
            alt="Medición"
            style={{ width: '100%', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border)' }}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          {[
            { label: 'Área corroída', value: `${(alerta.area_corroida_pct ?? 0).toFixed(1)}%` },
            { label: 'Confianza', value: alerta.confianza_promedio ? `${(alerta.confianza_promedio * 100).toFixed(0)}%` : '—' },
            { label: 'Empresa', value: punto.empresa ?? '—' },
            { label: 'Ciudad', value: punto.ciudad ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--bg-inset)', padding: '8px 12px', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>

        {alerta.notas && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-inset)', padding: '10px 12px', borderRadius: 6, marginBottom: 12 }}>
            {alerta.notas}
          </div>
        )}

        {alerta.id_medicion && (
          <button
            onClick={() => navigate(`/galeria/${alerta.id_medicion}`)}
            style={{
              width: '100%', padding: '10px', background: color,
              border: 'none', borderRadius: 8, color: 'white',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Ir a la imagen →
          </button>
        )}

        <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-data)' }}>
          {alerta.timestamp ? new Date(alerta.timestamp).toLocaleString('es-CO') : ''}
        </div>
      </div>
    </div>
  );
}

export default function AlertsPanel() {
  const { alertas, loading, error } = useAlertas();
  const [filter, setFilter] = useState('ALL');
  const [detalle, setDetalle] = useState(null);

  const criticas = alertas.filter(a => (a.nivel_corrosion ?? 0) === 3);
  const moderadas = alertas.filter(a => (a.nivel_corrosion ?? 0) === 2);
  const critical = criticas.length;
  const moderate = moderadas.length;

  const filtered = filter === 'ALL' ? alertas
    : filter === 'CRITICAL' ? criticas
    : moderadas;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: critical > 0 ? 'rgba(239,68,68,0.05)' : 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.1em', color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              CENTRO DE ALERTAS
              {critical > 0 && (
                <span style={{
                  background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444',
                  fontSize: 10, color: '#ef4444', padding: '1px 6px',
                  animation: 'blink 1s ease-in-out infinite',
                }}>
                  {critical} CRÍTICO
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 2 }}>
              {loading ? 'Cargando alertas…' : `${alertas.length} ALERTAS ACTIVAS`}
            </div>
          </div>
          {critical > 0 && (
            <div style={{ fontSize: 22, animation: 'blink 0.8s ease-in-out infinite' }}>🚨</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'ALL', label: 'TODOS', count: alertas.length },
            { key: 'CRITICAL', label: 'SEVERO', count: critical, color: '#ef4444' },
            { key: 'MODERATE', label: 'MODERADO', count: moderate, color: '#f97316' },
          ].map(({ key, label, count, color }) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '3px 10px',
              background: filter === key ? (color ? `${color}20` : 'var(--border)') : 'transparent',
              border: `1px solid ${filter === key ? (color || 'var(--border-bright)') : 'var(--border)'}`,
              color: filter === key ? (color || 'var(--text-primary)') : 'var(--text-muted)',
              fontSize: 9, fontFamily: 'var(--font-data)',
              letterSpacing: '0.1em', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>Cargando…</span>
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--accent-red)' }}>Error: {error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8, padding: 20,
          }}>
            <div style={{ fontSize: 24 }}>✓</div>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textAlign: 'center' }}>
              Sin alertas activas.<br />
              Todas las mediciones están dentro de niveles seguros.
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map((alerta, i) => (
            <AlertCard key={alerta.id_medicion ?? i} alerta={alerta} index={i} onClick={() => setDetalle(alerta)} />
          ))}
        </div>
      </div>

      {detalle && <AlertDetailModal alerta={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}

function AlertCard({ alerta, index, onClick }) {
  const nivel = alerta.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const bg = nivelBg(nivel);
  const isSevere = nivel === 3;
  const sede = alerta.sede ?? alerta.id_punto ?? '—';
  const ciudad = alerta.ciudad ?? '';
  const fecha = alerta.timestamp
    ? new Date(alerta.timestamp).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px',
        background: bg,
        border: `1px solid ${color}40`,
        borderLeft: `3px solid ${color}`,
        cursor: 'pointer',
        animation: `fade-in-up 0.3s ease ${index * 0.04}s both`,
        position: 'relative', overflow: 'hidden',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = `${color}15`}
      onMouseLeave={e => e.currentTarget.style.background = bg}
    >
      {isSevere && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          animation: 'shimmer 2s linear infinite', backgroundSize: '200% 100%',
        }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{
          fontWeight: 700, fontSize: 10, color,
          letterSpacing: '0.12em',
          animation: isSevere ? 'blink 1s ease-in-out infinite' : 'none',
        }}>
          ● {nivelLabel(nivel).toUpperCase()}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{fecha}</span>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 4 }}>
        {sede}{ciudad ? ` › ${ciudad}` : ''}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, (alerta.area_corroida_pct ?? 0) * 1.5)}%`,
            background: `linear-gradient(90deg, ${color}80, ${color})`,
            borderRadius: 2,
            boxShadow: isSevere ? `0 0 8px ${color}` : 'none',
          }} />
        </div>
        <span style={{ fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 12, color, flexShrink: 0 }}>
          {(alerta.area_corroida_pct ?? 0).toFixed(1)}%
        </span>
      </div>

      <div style={{ marginTop: 5, fontSize: 9, color: 'var(--text-faint)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{alerta.id_punto}</span>
        <span>Haz clic para detalles →</span>
      </div>
    </div>
  );
}
