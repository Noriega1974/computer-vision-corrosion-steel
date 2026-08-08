import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Upload, AlertCircle } from 'lucide-react';
import { useMediciones } from '../hooks/useMediciones';
import { usePuntos } from '../hooks/usePuntos';
import { nivelColor, nivelLabel, nivelToStatus } from '../lib/statusUtils';

// ─── Helper: tiempo relativo ─────────────────────────────────────────────────
function tiempoRelativo(timestamp) {
  if (!timestamp) return '—';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days} días`;
  return new Date(timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Card de galería ─────────────────────────────────────────────────────────
function MedicionCard({ medicion, puntoInfo, onClick }) {
  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const sede = medicion.punto_info?.sede ?? medicion.sede ?? puntoInfo?.sede ?? medicion.id_punto ?? '—';
  const ciudad = medicion.punto_info?.ciudad ?? medicion.ciudad ?? puntoInfo?.ciudad ?? '';

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      {/* Imagen o placeholder */}
      <div style={{
        height: 170, background: 'var(--bg-inset)',
        position: 'relative', overflow: 'hidden',
      }}>
        {medicion.url_imagen ? (
          <img
            src={medicion.url_imagen}
            alt="Medición"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <AlertCircle size={28} strokeWidth={1.5} style={{ color: 'var(--text-faint)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-data)' }}>
              Sin imagen
            </span>
          </div>
        )}

        {/* Badge de nivel */}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          padding: '3px 8px', borderRadius: 20,
          background: `${color}ee`,
          fontFamily: 'var(--font-data)', fontWeight: 700,
          fontSize: 10, color: 'white',
          letterSpacing: '0.06em',
          boxShadow: `0 2px 8px ${color}50`,
        }}>
          {nivelLabel(nivel).toUpperCase()}
        </div>

        {/* Barra de área corroída en la parte inferior */}
        {medicion.area_corroida_pct != null && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
            background: 'rgba(0,0,0,0.3)',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, medicion.area_corroida_pct)}%`,
              background: color,
              transition: 'width 0.5s',
            }} />
          </div>
        )}
      </div>

      {/* Metadata */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13,
          color: 'var(--text-primary)', marginBottom: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {sede}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          {ciudad || medicion.id_punto}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
            }} />
            <span style={{
              fontFamily: 'var(--font-data)', fontSize: 11, color,
            }}>
              {(medicion.area_corroida_pct ?? 0).toFixed(1)}%
            </span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-data)' }}>
            {tiempoRelativo(medicion.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Página Galería ───────────────────────────────────────────────────────────
export default function GaleriaPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Límite de mediciones cargadas — aumenta con infinite scroll
  const [limit, setLimit] = useState(24);
  const { mediciones, loading } = useMediciones(limit);
  const { puntos } = usePuntos();
  const sentinelRef = useRef(null);
  const isLoadingMore = useRef(false);

  // ─── Filtros ──────────────────────────────────────────────────────────────
  const [nivelFilter, setNivelFilter] = useState('all');
  const [puntoFilter, setPuntoFilter] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [notasQuery, setNotasQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce de la búsqueda por notas
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(notasQuery), 400);
    return () => clearTimeout(t);
  }, [notasQuery]);

  // Infinite scroll con IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loading && !isLoadingMore.current) {
        isLoadingMore.current = true;
        setLimit(l => l + 24);
        // Reset flag cuando loading termina
        setTimeout(() => { isLoadingMore.current = false; }, 1000);
      }
    }, { threshold: 0.1 });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [loading]);

  // ─── Filtrado client-side ─────────────────────────────────────────────────
  const filtered = mediciones.filter(m => {
    if (nivelFilter !== 'all' && (m.nivel_corrosion ?? 0) !== Number(nivelFilter)) return false;
    if (puntoFilter && m.id_punto !== puntoFilter) return false;
    if (fechaInicio && new Date(m.timestamp) < new Date(fechaInicio)) return false;
    if (fechaFin && new Date(m.timestamp) > new Date(fechaFin + 'T23:59:59')) return false;
    if (debouncedQuery && !(m.notas ?? '').toLowerCase().includes(debouncedQuery.toLowerCase())) return false;
    return true;
  });

  // Puntos únicos en las mediciones para el dropdown
  const puntosEnMediciones = puntos.filter(p =>
    mediciones.some(m => m.id_punto === p.id_punto)
  );

  const inputStyle = {
    padding: '7px 12px', background: 'var(--bg-inset)',
    border: '1px solid var(--border)', borderRadius: 7,
    color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
    fontSize: 12, outline: 'none',
  };

  return (
    <div style={{ padding: '24px 24px 40px' }}>

      {/* ── Título + CTA ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 18,
            color: 'var(--text-primary)', margin: 0,
          }}>
            Galería de mediciones
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0', fontFamily: 'var(--font-ui)' }}>
            {loading ? 'Cargando…' : `${filtered.length} mediciones${filtered.length !== mediciones.length ? ` de ${mediciones.length}` : ''}`}
          </p>
        </div>
        <button
          onClick={() => navigate('/upload')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', background: 'var(--accent-amber)',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'white',
            boxShadow: '0 2px 8px rgba(20,50,163,0.3)',
          }}
        >
          <Upload size={15} />
          Subir medición
        </button>
      </div>

      {/* ── Filtros ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '14px 16px', marginBottom: 20,
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        {/* Chips de nivel */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 5, fontFamily: 'var(--font-data)', letterSpacing: '0.1em' }}>NIVEL</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'all', label: 'Todos', color: 'var(--text-muted)' },
              { key: '0', label: 'Sin corrosión', color: '#16a34a' },
              { key: '1', label: 'Leve', color: '#d97706' },
              { key: '2', label: 'Moderada', color: '#ea580c' },
              { key: '3', label: 'Severa', color: '#dc2626' },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setNivelFilter(key)}
                style={{
                  padding: '4px 10px', borderRadius: 20,
                  border: `1px solid ${nivelFilter === key ? color : 'var(--border)'}`,
                  background: nivelFilter === key ? `${color}18` : 'transparent',
                  color: nivelFilter === key ? color : 'var(--text-muted)',
                  fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Dropdown de planta */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 5, fontFamily: 'var(--font-data)', letterSpacing: '0.1em' }}>PLANTA</div>
          <select
            value={puntoFilter}
            onChange={e => setPuntoFilter(e.target.value)}
            style={{ ...inputStyle, appearance: 'none', paddingRight: 24 }}
          >
            <option value="">Todas las plantas</option>
            {puntosEnMediciones.map(p => (
              <option key={p.id_punto} value={p.id_punto}>{p.sede} · {p.ciudad}</option>
            ))}
          </select>
        </div>

        {/* Rango de fechas */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 5, fontFamily: 'var(--font-data)', letterSpacing: '0.1em' }}>DESDE</div>
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 5, fontFamily: 'var(--font-data)', letterSpacing: '0.1em' }}>HASTA</div>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={inputStyle} />
        </div>

        {/* Búsqueda por notas */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 5, fontFamily: 'var(--font-data)', letterSpacing: '0.1em' }}>BUSCAR EN NOTAS</div>
          <input
            type="text" placeholder="Buscar…"
            value={notasQuery} onChange={e => setNotasQuery(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        {/* Botón limpiar filtros */}
        {(nivelFilter !== 'all' || puntoFilter || fechaInicio || fechaFin || notasQuery) && (
          <button
            onClick={() => {
              setNivelFilter('all'); setPuntoFilter('');
              setFechaInicio(''); setFechaFin(''); setNotasQuery('');
            }}
            style={{
              padding: '7px 12px', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 7,
              cursor: 'pointer', color: 'var(--text-muted)',
              fontFamily: 'var(--font-ui)', fontSize: 12,
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Grid ── */}
      {!loading && mediciones.length === 0 ? (
        /* Estado vacío */
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: '60px 20px',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 14,
            background: 'var(--bg-inset)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertCircle size={26} strokeWidth={1.5} style={{ color: 'var(--text-faint)' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>
              Sin mediciones todavía
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Sube tu primera imagen para comenzar el monitoreo de corrosión.
            </div>
            <button
              onClick={() => navigate('/upload')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', background: 'var(--accent-amber)',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'white',
              }}
            >
              <Upload size={15} />
              Subir primera medición
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Grid responsivo */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}>
            {filtered.map(m => (
              <MedicionCard
                key={m.id_medicion}
                medicion={m}
                puntoInfo={puntos.find(p => p.id_punto === m.id_punto)}
                onClick={() => navigate(`/galeria/${m.id_medicion}`, { state: { filters: { nivelFilter, puntoFilter, fechaInicio, fechaFin, notasQuery } } })}
              />
            ))}
          </div>

          {/* Estado vacío con filtros activos */}
          {!loading && filtered.length === 0 && mediciones.length > 0 && (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
            }}>
              No hay mediciones que coincidan con los filtros seleccionados.
            </div>
          )}

          {/* Sentinel para infinite scroll */}
          <div ref={sentinelRef} style={{ height: 40, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-data)', fontSize: 12 }}>
                <div style={{
                  width: 14, height: 14, border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent-amber)', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                Cargando más…
              </div>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
