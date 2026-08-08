import React, { useState, useMemo, useEffect } from 'react';
import { Factory, Plus, Edit2, MapPin, Clock, LayoutGrid, X, Check, AlertCircle } from 'lucide-react';
import { useGestionPuntos } from '../hooks/usePunto';
import { useMedicionesPunto } from '../hooks/useMedicionesPunto';
import { useAuth } from '../auth/AuthContext';
import { nivelLabel, nivelColor, nivelBg } from '../lib/statusUtils';

// ─── Skeleton ────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[80, 60, 90, 70, 60].map((w, i) => (
        <td key={i} style={{ padding: '10px 14px' }}>
          <div style={{ height: 13, borderRadius: 4, background: 'var(--border)', width: `${w}%`, animation: 'shimmer 1.5s infinite' }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Modal wrapper ───────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, width: '100%', maxWidth: 620,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Tab bar ────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', flexShrink: 0 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: '10px 14px', border: 'none', background: 'transparent',
          cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: active === t.key ? 700 : 400,
          color: active === t.key ? 'var(--accent-amber)' : 'var(--text-muted)',
          borderBottom: active === t.key ? '2px solid var(--accent-amber)' : '2px solid transparent',
          marginBottom: -1, transition: 'color 0.13s',
        }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-page)',
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 13,
  boxSizing: 'border-box',
};

// ─── Formulario de planta (crear / editar) ───────────────────────────────────
const LABEL_STYLE = { display: 'block', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 5 };

function PuntoForm({ initial = {}, onSubmit, saving, error }) {
  const [form, setForm] = useState({
    nombre_punto: initial.nombre_punto ?? '',
    ciudad: initial.ciudad ?? '',
    departamento: initial.departamento ?? '',
    descripcion: initial.descripcion ?? '',
    latitud: initial.coordenadas?.lat ?? initial.latitud ?? '',
    longitud: initial.coordenadas?.lng ?? initial.longitud ?? '',
    tipo_estructura: initial.tipo_estructura ?? '',
    grosor_mm: initial.grosor_mm ?? '',
  });
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [showManual, setShowManual] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Auto-detect on mount if no coordinates already set
  useEffect(() => {
    const yaHayCoordenadas = initial.coordenadas?.lat ?? initial.latitud;
    if (yaHayCoordenadas || !navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({
          ...f,
          latitud: parseFloat(pos.coords.latitude.toFixed(6)),
          longitud: parseFloat(pos.coords.longitude.toFixed(6)),
        }));
        setGeoLoading(false);
      },
      () => {
        setGeoError('No se pudo detectar la ubicación automáticamente.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (payload.latitud !== '') payload.latitud = Number(payload.latitud);
    if (payload.longitud !== '') payload.longitud = Number(payload.longitud);
    if (payload.grosor_mm !== '') payload.grosor_mm = Number(payload.grosor_mm);
    if (payload.latitud !== '' && payload.longitud !== '') {
      payload.coordenadas = { lat: payload.latitud, lng: payload.longitud };
    }
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
      {[
        { key: 'nombre_punto', label: 'Nombre de la planta', required: true },
        { key: 'ciudad', label: 'Ciudad', required: true },
        { key: 'departamento', label: 'Departamento' },
        { key: 'descripcion', label: 'Descripción' },
      ].map(f => (
        <div key={f.key} style={{ marginBottom: 14 }}>
          <label style={LABEL_STYLE}>{f.label}{f.required && ' *'}</label>
          <input value={form[f.key]} onChange={set(f.key)} required={f.required} style={inputStyle} />
        </div>
      ))}

      {/* Tipo de estructura */}
      <div style={{ marginBottom: 14 }}>
        <label style={LABEL_STYLE}>Tipo de estructura</label>
        <select value={form.tipo_estructura} onChange={set('tipo_estructura')} style={inputStyle}>
          <option value="">Seleccionar...</option>
          <option value="Láminas">Láminas</option>
          <option value="Tuberías">Tuberías</option>
        </select>
      </div>

      {/* Grosor de lámina/tubería */}
      <div style={{ marginBottom: 14 }}>
        <label style={LABEL_STYLE}>Espesor nominal (mm)</label>
        <input
          type="number" step="0.001" min="0"
          placeholder="Ej: 3.527"
          value={form.grosor_mm}
          onChange={set('grosor_mm')}
          style={inputStyle}
        />
      </div>

      {/* Ubicación */}
      <div style={{ marginBottom: 14 }}>
        <label style={LABEL_STYLE}>Ubicación</label>

        {/* Estado de detección automática */}
        {geoLoading && (
          <div style={{ padding: '8px 12px', background: 'rgba(20,50,163,0.05)', border: '1px solid rgba(20,50,163,0.15)', borderRadius: 7, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
            Detectando ubicación…
          </div>
        )}
        {!geoLoading && form.latitud !== '' && (
          <div style={{ padding: '8px 12px', background: 'rgba(20,50,163,0.05)', border: '1px solid rgba(20,50,163,0.15)', borderRadius: 7, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
            📍 {form.latitud}, {form.longitud}
          </div>
        )}
        {geoError && (
          <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, fontSize: 11, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertCircle size={12} /> {geoError}
          </div>
        )}

        {/* Toggle manual */}
        <button
          type="button"
          onClick={() => setShowManual(v => !v)}
          style={{
            marginTop: 8, background: 'none', border: 'none', padding: 0,
            fontSize: 11, color: 'var(--accent-amber)', cursor: 'pointer',
            fontFamily: 'var(--font-data)', fontWeight: 600, letterSpacing: '0.04em',
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          {showManual ? 'Ocultar coordenadas' : 'Ser más específico con la ubicación'}
        </button>

        {showManual && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            {[['latitud', 'Latitud'], ['longitud', 'Longitud']].map(([k, lbl]) => (
              <div key={k}>
                <label style={LABEL_STYLE}>{lbl}</label>
                <input type="number" step="any" value={form[k]} onChange={set(k)} style={inputStyle} placeholder={k === 'latitud' ? 'Ej: 4.710989' : 'Ej: -74.072092'} />
              </div>
            ))}
          </div>
        )}
      </div>
      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626', fontSize: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="submit" disabled={saving} style={{
          padding: '8px 20px', background: 'var(--accent-amber)', border: 'none',
          borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'white',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

// ─── Panel de detalle de planta ──────────────────────────────────────────────
function PuntoDetail({ punto, onEdit, isAdmin }) {
  const [tab, setTab] = useState('info');
  const { mediciones, loading } = useMedicionesPunto(punto?.id_punto);

  const auditoria = punto?.historial_cambios ?? [];

  return (
    <>
      <TabBar
        tabs={[
          { key: 'info', label: 'Información' },
          { key: 'auditoria', label: 'Historial de cambios' },
          { key: 'mediciones', label: 'Mediciones recientes' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div style={{ padding: '20px' }}>
        {/* ── Info ── */}
        {tab === 'info' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {[
                ['ID', punto.id_punto],
                ['Ciudad', punto.ciudad],
                ['Departamento', punto.departamento],
                ['Tipo de estructura', punto.tipo_estructura || '—'],
                ['Espesor nominal', punto.grosor_mm != null ? `${punto.grosor_mm} mm` : '—'],
                ['Latitud', punto.coordenadas?.lat ?? punto.latitud],
                ['Longitud', punto.coordenadas?.lng ?? punto.longitud],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-data)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>{value ?? '—'}</div>
                </div>
              ))}
              {punto.descripcion && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-data)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 3 }}>Descripción</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>{punto.descripcion}</div>
                </div>
              )}
            </div>
            {isAdmin && (
              <button onClick={onEdit} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 500,
                fontSize: 12, color: 'var(--text-muted)',
              }}>
                <Edit2 size={13} /> Editar planta
              </button>
            )}
          </div>
        )}

        {/* ── Auditoría ── */}
        {tab === 'auditoria' && (
          <div>
            {auditoria.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)', fontSize: 13 }}>Sin historial de cambios</div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 24 }}>
                <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
                {auditoria.map((entry, i) => (
                  <div key={i} style={{ position: 'relative', marginBottom: 18, paddingLeft: 16 }}>
                    <div style={{ position: 'absolute', left: -20, top: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-amber)', border: '2px solid var(--bg-card)' }} />
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-data)', marginBottom: 3 }}>
                      {entry.fecha?.slice(0, 10) ?? '—'} · {entry.usuario ?? '—'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
                      {entry.descripcion ?? JSON.stringify(entry)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Mediciones recientes ── */}
        {tab === 'mediciones' && (
          <div>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 40, borderRadius: 6, background: 'var(--border)', marginBottom: 8, animation: 'shimmer 1.5s infinite' }} />
              ))
            ) : mediciones.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)', fontSize: 13 }}>Sin mediciones registradas</div>
            ) : (
              mediciones.slice(0, 10).map((m, i) => (
                <div key={m.id_medicion ?? i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: 'var(--bg-page)', borderRadius: 8, marginBottom: 6,
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
                    {m.fecha_creacion?.slice(0, 10) ?? '—'}
                  </div>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 5,
                    background: nivelBg(m.nivel_corrosion ?? 0),
                    color: nivelColor(m.nivel_corrosion ?? 0),
                    fontSize: 11, fontWeight: 600,
                  }}>
                    {nivelLabel(m.nivel_corrosion ?? 0)}
                  </span>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
                    {m.area_corroida_pct != null ? `${m.area_corroida_pct.toFixed(1)}%` : '—'}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── PlantsPage ───────────────────────────────────────────────────────────────
export default function PlantsPage() {
  const { user } = useAuth();
  const isAdmin = user?.groups?.includes('admin') || user?.groups?.includes('tecnico');
  const canCreate = user?.groups?.includes('admin');

  const { puntos, loading, mutating, mutError, crearPunto, editarPunto, refetch } = useGestionPuntos();
  const [search, setSearch] = useState('');
  const [selectedPunto, setSelectedPunto] = useState(null);
  const [editPunto, setEditPunto] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return puntos.filter(p =>
      (p.nombre_punto ?? '').toLowerCase().includes(q) ||
      (p.ciudad ?? '').toLowerCase().includes(q) ||
      (p.departamento ?? '').toLowerCase().includes(q)
    );
  }, [puntos, search]);

  const handleCreate = async (payload) => {
    setFormError(null);
    try {
      await crearPunto(payload);
      setShowCreate(false);
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleEdit = async (payload) => {
    setFormError(null);
    try {
      await editarPunto(editPunto.id_punto, payload);
      setEditPunto(null);
      setSelectedPunto(p => p?.id_punto === editPunto.id_punto ? { ...p, ...payload } : p);
    } catch (err) {
      setFormError(err.message);
    }
  };

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <div style={{ padding: 24 }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ background: 'var(--accent-amber)', width: 3, height: 20, borderRadius: 2, display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              Gestión de plantas
            </span>
          </div>
          {canCreate && (
            <button onClick={() => { setShowCreate(true); setFormError(null); }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', background: 'var(--accent-amber)', border: 'none',
              borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'white',
            }}>
              <Plus size={14} /> Nueva planta
            </button>
          )}
        </div>

        {/* Buscador */}
        <div style={{ marginBottom: 16 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, ciudad o departamento…"
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)', fontSize: 13, width: '100%',
              maxWidth: 380, boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Tabla */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-ui)' }}>
              <thead>
                <tr style={{ background: 'var(--bg-page)' }}>
                  {['Planta', 'Ciudad', 'Departamento', 'Coordenadas', 'Ver'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : filtered.map(p => (
                    <tr key={p.id_punto} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-page)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.nombre_punto}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{p.id_punto}</div>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{p.ciudad ?? '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{p.departamento ?? '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'var(--font-data)', fontSize: 11 }}>
                        {p.latitud != null && p.longitud != null ? `${p.latitud.toFixed(4)}, ${p.longitud.toFixed(4)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={() => setSelectedPunto(p)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)',
                          borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11,
                          color: 'var(--text-muted)',
                        }}>
                          <LayoutGrid size={12} /> Detalle
                        </button>
                      </td>
                    </tr>
                  ))
                }
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                    {search ? 'Sin resultados para la búsqueda' : 'No hay plantas registradas'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Modal: Detalle de planta ── */}
      {selectedPunto && (
        <Modal title={selectedPunto.nombre_punto} onClose={() => setSelectedPunto(null)}>
          <PuntoDetail
            punto={selectedPunto}
            isAdmin={isAdmin}
            onEdit={() => { setEditPunto(selectedPunto); setFormError(null); }}
          />
        </Modal>
      )}

      {/* ── Modal: Editar planta ── */}
      {editPunto && (
        <Modal title={`Editar: ${editPunto.nombre_punto}`} onClose={() => setEditPunto(null)}>
          <PuntoForm initial={editPunto} onSubmit={handleEdit} saving={mutating} error={formError} />
        </Modal>
      )}

      {/* ── Modal: Crear planta ── */}
      {showCreate && (
        <Modal title="Nueva planta" onClose={() => setShowCreate(false)}>
          <PuntoForm onSubmit={handleCreate} saving={mutating} error={formError} />
        </Modal>
      )}
    </>
  );
}
