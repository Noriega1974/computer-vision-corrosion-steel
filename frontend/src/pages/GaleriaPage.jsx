import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Upload, AlertCircle, Search, Plus, X, ChevronDown, Check } from 'lucide-react';
import { useMediciones } from '../hooks/useMediciones';
import { useEmpresas } from '../hooks/useEmpresas';
import { useAuth } from '../auth/AuthContext';
import { NIVELES, nivelColor, nivelLabel } from '../lib/statusUtils';
import { formatFecha } from '../utils/dateFormat';

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
  return formatFecha(timestamp);
}

// ─── Card de galería ─────────────────────────────────────────────────────────
function MedicionCard({ medicion, to, state }) {
  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  // sede/ciudad ya no viajan denormalizadas en la medición -- el nombre del
  // punto (bloque) sí, resuelto y congelado al momento de subir la medición.
  const nombrePunto = medicion.bloque_nombre ?? 'Sin punto asignado';

  return (
    // Link y no <div onClick>: esto navega a la ficha de la medicion, asi que
    // corresponde un ancla real. Ademas de ser accesible por teclado, habilita
    // Cmd/Ctrl+click y click del medio para abrir en otra pestaña, que en un
    // listado de mediciones se usa todo el tiempo.
    <Link
      to={to}
      state={state}
      className="medicion-card"
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Imagen o placeholder */}
      <div style={{
        height: 170, background: 'var(--bg-inset)',
        position: 'relative', overflow: 'hidden',
      }}>
        {medicion.url_imagen ? (
          <img
            // Miniatura (~400px, unos 40KB) en vez de la foto original
            // (hasta 4032x3024, 2-4MB) -- acá solo se muestra en un
            // cuadrito de 170px. `url_thumbnail` cae a `url_imagen` para
            // mediciones de antes de que existiera la miniatura.
            src={medicion.url_thumbnail || medicion.url_imagen}
            alt="Medición"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
          }}>
            <AlertCircle size={28} strokeWidth={1.5} style={{ color: 'var(--text-faint)' }} />
            <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-data)' }}>
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
          fontSize: 'var(--text-3xs)', color: 'white',
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
              width: '100%',
              transformOrigin: 'left center',
              transform: `scaleX(${Math.min(100, medicion.area_corroida_pct) / 100})`,
              background: color,
              transition: 'transform 0.28s ease-out',
            }} />
          </div>
        )}
      </div>

      {/* Metadata */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)', marginBottom: 'var(--space-2)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {nombrePunto}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
            }} />
            <span style={{
              fontFamily: 'var(--font-data)', fontSize: 'var(--text-2xs)', color,
            }}>
              {(medicion.area_corroida_pct ?? 0).toFixed(1)}%
            </span>
          </div>
          <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-data)' }}>
            {tiempoRelativo(medicion.timestamp)}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Página Galería ───────────────────────────────────────────────────────────
export default function GaleriaPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Límite de mediciones cargadas — aumenta con infinite scroll
  const [limit, setLimit] = useState(24);
  const { mediciones, loading } = useMediciones(limit);
  const sentinelRef = useRef(null);
  const isLoadingMore = useRef(false);

  // Filtro de afiliación: solo tiene sentido para super_admin, que es el
  // único que ve mediciones de más de una afiliación a la vez (el backend
  // ya scopea a los demás roles a la suya propia).
  const { user } = useAuth();
  const esSuperAdmin = user?.groups?.includes('super_admin');
  const { empresas } = useEmpresas(esSuperAdmin);

  // ─── Filtros ──────────────────────────────────────────────────────────────
  // Al volver desde la ficha de una medición, los filtros llegan por el state
  // de navegación (ver handleBack en MedicionDetailPage). Se leen una sola vez.
  const [restored] = useState(() => location.state ?? {});
  const [nivelFilter, setNivelFilter] = useState(restored.nivelFilter ?? 'all');
  const [bloqueFilter, setBloqueFilter] = useState(restored.bloqueFilter ?? '');
  const [empresaFilter, setEmpresaFilter] = useState(esSuperAdmin ? (restored.empresaFilter ?? '') : '');
  const [fechaInicio, setFechaInicio] = useState(restored.fechaInicio ?? '');
  const [fechaFin, setFechaFin] = useState(restored.fechaFin ?? '');
  const [notasQuery, setNotasQuery] = useState(restored.notasQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(restored.notasQuery ?? '');

  // Filtros activos visibles como pestañas dinámicas a la izquierda. Los
  // filtros restaurados deben tener su pill para poder verlos y quitarlos.
  const [activeFilters, setActiveFilters] = useState(() => {
    // Por defecto no hay ningún filtro preseleccionado; solo se restaura la
    // pill de nivel si se volvió con un nivel concreto elegido.
    const set = new Set();
    if (restored.nivelFilter && restored.nivelFilter !== 'all') set.add('nivel');
    if (restored.bloqueFilter) set.add('punto');
    if (esSuperAdmin && restored.empresaFilter) set.add('empresa');
    if (restored.fechaInicio || restored.fechaFin) set.add('fechas');
    return set;
  });
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef(null);
  const addMenuButtonRef = useRef(null);

  // Cierra el menú con clic fuera o Esc (Esc devuelve el foco al botón).
  useEffect(() => {
    if (!showAddMenu) return;
    function handleClickOutside(e) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setShowAddMenu(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setShowAddMenu(false);
        addMenuButtonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAddMenu]);

  // Desde el menú solo se agregan filtros; quitarlos es con la X de su pill.
  const addFilter = (key) => {
    setActiveFilters(prev => (prev.has(key) ? prev : new Set(prev).add(key)));
    setShowAddMenu(false);
    addMenuButtonRef.current?.focus();
  };

  const removeFilter = (key) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (key === 'nivel') setNivelFilter('all');
    if (key === 'punto') setBloqueFilter('');
    if (key === 'empresa') setEmpresaFilter('');
    if (key === 'fechas') { setFechaInicio(''); setFechaFin(''); }
  };

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
    if (bloqueFilter && m.bloque_id !== bloqueFilter) return false;
    if (empresaFilter && m.empresa_id !== empresaFilter) return false;
    if (fechaInicio && new Date(m.timestamp) < new Date(fechaInicio)) return false;
    if (fechaFin && new Date(m.timestamp) > new Date(fechaFin + 'T23:59:59')) return false;
    if (debouncedQuery && !(m.notas ?? '').toLowerCase().includes(debouncedQuery.toLowerCase())) return false;
    return true;
  });

  // Puntos (bloques) únicos entre las mediciones ya traídas -- no hace falta
  // pedir /bloques, bloque_id/bloque_nombre ya vienen resueltos en cada
  // medición (congelados al momento de subirla).
  const bloquesEnMediciones = Array.from(
    mediciones.reduce((map, m) => {
      if (m.bloque_id && !map.has(m.bloque_id)) {
        map.set(m.bloque_id, m.bloque_nombre ?? m.bloque_id);
      }
      return map;
    }, new Map())
  ).map(([id, nombre]) => ({ id, nombre }));

  const inputStyle = {
    padding: '7px 12px', background: 'var(--bg-inset)',
    border: '1px solid var(--border)', borderRadius: 7,
    color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
    fontSize: 'var(--text-xs)',
  };

  // Mismo aspecto que tenian los <div> que reemplazo, ahora sobre un <label>
  // real. `display: block` conserva el salto de linea que daba el div.
  const FILTRO_LABEL_STYLE = {
    display: 'block', fontSize: 'var(--text-3xs)', color: 'var(--text-faint)',
    marginBottom: 5, fontFamily: 'var(--font-data)', letterSpacing: '0.1em',
  };

  return (
    <div style={{ padding: '24px 24px 40px' }}>

      {/* ── Título + CTA ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 'var(--space-3)',
      }}>
        <div>
          <h2 style={{
            fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-lg)',
            color: 'var(--text-primary)', margin: 0,
          }}>
            Galería de mediciones
          </h2>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '3px 0 0', fontFamily: 'var(--font-ui)' }}>
            {loading ? 'Cargando…' : `${filtered.length} mediciones${filtered.length !== mediciones.length ? ` de ${mediciones.length}` : ''}`}
          </p>
        </div>
        <button
          onClick={() => navigate('/upload')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', background: 'var(--accent-amber)',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'white',
            boxShadow: '0 2px 8px rgba(156,54,16,0.3)',
          }}
        >
          <Upload size={15} />
          Subir medición
        </button>
      </div>

      {/* ── Barra de búsqueda y filtros ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 16px', marginBottom: 20,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Fila principal: Buscador compacto a la izquierda + Filtros dinámicos a la derecha */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          flexWrap: 'wrap', gap: 12,
        }}>
          {/* Lado izquierdo: Buscador compacto con icono de lupa */}
          <div style={{ position: 'relative', minWidth: 200, maxWidth: 280, flex: '0 1 280px' }}>
            <Search
              size={13}
              style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-faint)', pointerEvents: 'none',
              }}
            />
            <input
              id="filtro-notas"
              name="buscar-notas"
              type="search"
              spellCheck={false}
              placeholder="Buscar en notas…"
              value={notasQuery}
              onChange={e => setNotasQuery(e.target.value)}
              style={{
                width: '100%', height: 32, boxSizing: 'border-box',
                padding: '0 26px 0 28px', background: 'var(--bg-card-solid)',
                border: '1px solid var(--border-strong)', borderRadius: 7,
                fontSize: 'var(--text-xs)', color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)', outline: 'none',
              }}
            />
            {notasQuery && (
              <button
                type="button"
                onClick={() => setNotasQuery('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  display: 'flex', color: 'var(--text-faint)',
                }}
                title="Borrar búsqueda"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {/* A la derecha del buscador: Botón desplegable [+ Agregar filtro] + Filtros activos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: '1 1 320px' }}>
            {/* Menú desplegable para agregar filtros */}
            <div style={{ position: 'relative' }} ref={addMenuRef}>
              <button
                type="button"
                ref={addMenuButtonRef}
                onClick={() => setShowAddMenu(v => !v)}
                aria-haspopup="menu"
                aria-expanded={showAddMenu}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 7,
                  background: 'var(--bg-inset)', border: '1px solid var(--border-strong)',
                  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
                  transition: 'background-color 0.15s, border-color 0.15s',
                }}
              >
                <Plus size={13} style={{ color: 'var(--accent-amber)' }} />
                <span>Agregar filtro</span>
                <ChevronDown size={13} style={{ color: 'var(--text-faint)', transform: showAddMenu ? 'rotate(180deg)' : 'none' }} />
              </button>

              {showAddMenu && (
                <div role="menu" aria-label="Agregar filtro" style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 60,
                  minWidth: 190, background: 'var(--bg-card-solid)', border: '1px solid var(--border-strong)',
                  borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.22)', padding: '4px 0',
                }}>
                  {[
                    { key: 'nivel', label: 'Nivel de corrosión' },
                    ...(bloquesEnMediciones.length > 0 ? [{ key: 'punto', label: 'Punto de medición' }] : []),
                    ...(esSuperAdmin ? [{ key: 'empresa', label: 'Afiliación' }] : []),
                    { key: 'fechas', label: 'Rango de fechas' },
                  ].map(opt => {
                    const isAdded = activeFilters.has(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        role="menuitem"
                        onClick={() => addFilter(opt.key)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '8px 12px', background: 'transparent',
                          border: 'none', textAlign: 'left', cursor: 'pointer',
                          fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)',
                          color: isAdded ? 'var(--accent-amber)' : 'var(--text-primary)',
                          fontWeight: isAdded ? 600 : 400,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--nav-active-bg, rgba(193,70,11,0.08))'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span>{opt.label}</span>
                        {isAdded && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-3xs)', color: 'var(--accent-amber)' }}>
                            <Check size={11} aria-hidden="true" /> Activo
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pestaña / pill activa de punto */}
            {activeFilters.has('punto') && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 8px 3px 10px', borderRadius: 20,
                background: 'var(--bg-card-solid)', border: '1px solid var(--border-strong)',
                fontSize: 'var(--text-2xs)', color: 'var(--text-primary)',
              }}>
                <span style={{ fontFamily: 'var(--font-data)', letterSpacing: '0.05em', color: 'var(--text-faint)' }}>PUNTO:</span>
                <select
                  value={bloqueFilter}
                  onChange={e => setBloqueFilter(e.target.value)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-primary)',
                    fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', cursor: 'pointer',
                    outline: 'none', padding: '2px 4px', fontWeight: 500,
                  }}
                >
                  <option value="">Todos los puntos</option>
                  {bloqueFilter && !bloquesEnMediciones.some(b => b.id === bloqueFilter) && (
                    <option value={bloqueFilter}>Punto seleccionado</option>
                  )}
                  {bloquesEnMediciones.map(b => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeFilter('punto')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-faint)' }}
                  title="Quitar filtro de punto"
                  aria-label="Quitar filtro de punto"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Pestaña / pill activa de afiliación */}
            {activeFilters.has('empresa') && esSuperAdmin && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 8px 3px 10px', borderRadius: 20,
                background: 'var(--bg-card-solid)', border: '1px solid var(--border-strong)',
                fontSize: 'var(--text-2xs)', color: 'var(--text-primary)',
              }}>
                <span style={{ fontFamily: 'var(--font-data)', letterSpacing: '0.05em', color: 'var(--text-faint)' }}>AFILIACIÓN:</span>
                <select
                  value={empresaFilter}
                  onChange={e => setEmpresaFilter(e.target.value)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-primary)',
                    fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', cursor: 'pointer',
                    outline: 'none', padding: '2px 4px', fontWeight: 500,
                  }}
                >
                  <option value="">Todas las afiliaciones</option>
                  {empresas.map(e => (
                    <option key={e.id_empresa} value={e.id_empresa}>{e.nombre}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeFilter('empresa')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-faint)' }}
                  title="Quitar filtro de afiliación"
                  aria-label="Quitar filtro de afiliación"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Pestaña / pill activa de fechas */}
            {activeFilters.has('fechas') && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 8px 3px 10px', borderRadius: 20,
                background: 'var(--bg-card-solid)', border: '1px solid var(--border-strong)',
                fontSize: 'var(--text-2xs)', color: 'var(--text-primary)',
              }}>
                <span style={{ fontFamily: 'var(--font-data)', letterSpacing: '0.05em', color: 'var(--text-faint)' }}>DESDE:</span>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={e => setFechaInicio(e.target.value)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-primary)',
                    fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', outline: 'none',
                  }}
                />
                <span style={{ fontFamily: 'var(--font-data)', letterSpacing: '0.05em', color: 'var(--text-faint)' }}>HASTA:</span>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={e => setFechaFin(e.target.value)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-primary)',
                    fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeFilter('fechas')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-faint)' }}
                  title="Quitar filtro de fecha"
                  aria-label="Quitar filtro de fecha"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Botón limpiar filtros */}
            {(nivelFilter !== 'all' || bloqueFilter || empresaFilter || fechaInicio || fechaFin || notasQuery) && (
              <button
                type="button"
                onClick={() => {
                  setNivelFilter('all'); setBloqueFilter(''); setEmpresaFilter('');
                  setFechaInicio(''); setFechaFin(''); setNotasQuery('');
                }}
                style={{
                  padding: '4px 9px', background: 'transparent',
                  border: '1px dashed var(--border-strong)', borderRadius: 6,
                  cursor: 'pointer', color: 'var(--text-muted)',
                  fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)',
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>

        </div>

        {/* Fila secundaria: Chips de Nivel (cuando está activo) */}
        {activeFilters.has('nivel') && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            paddingTop: 8, borderTop: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-data)', letterSpacing: '0.1em' }}>
              NIVEL:
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { key: 'all', label: 'Todos', color: 'var(--text-muted)' },
                ...NIVELES.map((_, n) => ({ key: String(n), label: nivelLabel(n), color: nivelColor(n) })),
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNivelFilter(key)}
                  style={{
                    padding: '3px 9px', borderRadius: 20,
                    border: `1px solid ${nivelFilter === key ? color : 'var(--border)'}`,
                    background: nivelFilter === key ? `${color}18` : 'transparent',
                    color: nivelFilter === key ? color : 'var(--text-muted)',
                    fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', cursor: 'pointer',
                    fontWeight: nivelFilter === key ? 600 : 400,
                    transition: 'color 0.12s, background-color 0.12s, border-color 0.12s',
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => removeFilter('nivel')}
                style={{
                  background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
                  display: 'flex', color: 'var(--text-faint)', marginLeft: 4,
                }}
                title="Quitar filtro de nivel"
                aria-label="Quitar filtro de nivel"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Grid ── */}
      {!loading && mediciones.length === 0 ? (
        /* Estado vacío */
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 'var(--space-4)', padding: '60px 20px',
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
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
              Sube tu primera imagen para comenzar el monitoreo de corrosión.
            </div>
            <button
              onClick={() => navigate('/upload')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', background: 'var(--accent-amber)',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'white',
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
            gap: 'var(--space-4)',
          }}>
            {filtered.map(m => (
              <MedicionCard
                key={m.id_medicion}
                medicion={m}
                to={`/galeria/${m.id_medicion}`}
                state={{ filters: { nivelFilter, bloqueFilter, empresaFilter, fechaInicio, fechaFin, notasQuery } }}
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
          <div ref={sentinelRef} style={{ height: 40, marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--text-muted)', fontFamily: 'var(--font-data)', fontSize: 'var(--text-xs)' }}>
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
