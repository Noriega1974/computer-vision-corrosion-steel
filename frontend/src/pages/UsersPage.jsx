import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus, Edit2, X, AlertCircle, Check,
  RefreshCw, UserX, Trash2, ChevronUp, ChevronDown, Clock,
} from 'lucide-react';
import { useGestionUsuarios } from '../hooks/useUsuarios';
import { useAuth } from '../auth/AuthContext';

// ─── Skeleton ────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[70, 85, 55, 60, 50].map((w, i) => (
        <td key={i} style={{ padding: '10px 14px' }}>
          <div style={{ height: 13, borderRadius: 4, background: 'var(--border)', width: `${w}%`, animation: 'shimmer 1.5s infinite' }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Role badge ──────────────────────────────────────────────────────────────
const ROL_STYLES = {
  admin:   { bg: 'rgba(37,99,235,0.12)',  color: '#2563eb',  label: 'Administrador' },
  tecnico: { bg: 'rgba(59,130,246,0.10)', color: '#3b82f6',  label: 'Técnico' },
  cliente: { bg: 'rgba(100,116,139,0.1)', color: '#64748b',  label: 'Cliente' },
};

function RolBadge({ rol }) {
  const s = ROL_STYLES[rol] ?? ROL_STYLES.cliente;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 5,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 600,
      fontFamily: 'var(--font-data)',
    }}>
      {s.label}
    </span>
  );
}

// ─── Header de columna ordenable ─────────────────────────────────────────────
function SortableHeader({ label, col, sortCol, sortDir, onSort }) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        padding: '9px 14px', textAlign: 'left',
        fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.1em',
        color: active ? 'var(--accent-amber)' : 'var(--text-faint)',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {active && sortDir === 'asc'  && <ChevronUp   size={11} />}
        {active && sortDir === 'desc' && <ChevronDown  size={11} />}
      </span>
    </th>
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
        borderRadius: 12, width: '100%', maxWidth: 500,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-page)',
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 13,
  boxSizing: 'border-box',
};

// ─── Formulario de usuario ────────────────────────────────────────────────────
function UsuarioForm({ initial = {}, isEdit, onSubmit, saving, error }) {
  const [form, setForm] = useState({
    email: initial.email ?? '',
    nombre: initial.nombre ?? initial.name ?? '',
    rol: initial.rol ?? initial.role ?? 'tecnico',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    // Al crear, el backend genera y envía la contraseña temporal automáticamente
    onSubmit({ ...form });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 5 }}>
          Correo electrónico *
        </label>
        <input
          type="email" required value={form.email} onChange={set('email')}
          disabled={isEdit} style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1, cursor: isEdit ? 'not-allowed' : 'text' }}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 5 }}>
          Nombre completo
        </label>
        <input value={form.nombre} onChange={set('nombre')} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 5 }}>
          Rol *
        </label>
        <select value={form.rol} onChange={set('rol')} style={inputStyle}>
          <option value="admin">Administrador</option>
          <option value="tecnico">Técnico</option>
          <option value="cliente">Cliente</option>
        </select>
      </div>
      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626', fontSize: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={saving} style={{
          padding: '8px 20px', background: 'var(--accent-amber)', border: 'none',
          borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'white',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
        </button>
      </div>
    </form>
  );
}

// ─── Confirm dialog ──────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel, loading, confirmLabel = 'Confirmar', danger = false }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, maxWidth: 400, width: '100%', padding: '24px 20px',
      }}>
        <div style={{ fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', marginBottom: 20, lineHeight: 1.6 }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onCancel} disabled={loading} style={{
            padding: '7px 16px', background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)',
          }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading} style={{
            padding: '7px 16px', background: danger ? '#dc2626' : 'var(--accent-amber)', border: 'none',
            borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'white',
            opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast simple ─────────────────────────────────────────────────────────────
function Toast({ message, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 600,
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 16px',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderLeft: '3px solid #16a34a', borderRadius: 8,
      boxShadow: 'var(--shadow-lg)',
      fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-primary)',
    }}>
      <Check size={14} color="#16a34a" />
      {message}
    </div>
  );
}

// ─── Derivar si un usuario está activo según los campos del backend ──────────
// El backend envía activo: false y fecha_deshabilitacion cuando está deshabilitado
function esActivo(u) {
  if (u.activo === false) return false;
  if (u.fecha_deshabilitacion) return false;
  return true;
}

// ─── Ciclo de ordenamiento: null → asc → desc → null ─────────────────────────
function nextDir(col, sortCol, sortDir) {
  if (sortCol !== col) return 'asc';
  if (sortDir === 'asc') return 'desc';
  return null; // desc → resetear
}

// ─── Formulario de colaborador temporal ──────────────────────────────────────
function ColaboradorForm({ onSubmit, saving, error }) {
  const [form, setForm] = useState({ nickname: '', password: '', dias: 7, rol: 'tecnico' });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, dias: Number(form.dias) }); }}>
      <div style={{ padding: '10px 14px', background: 'rgba(20,50,163,0.08)', border: '1px solid rgba(20,50,163,0.2)', borderRadius: 8, marginBottom: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        El acceso del colaborador se revoca automáticamente al vencer el plazo.
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 5 }}>
          Nickname *
        </label>
        <input required value={form.nickname} onChange={set('nickname')} placeholder="ej: CorpAcero-tecnico" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 5 }}>
          Rol *
        </label>
        <select value={form.rol} onChange={set('rol')} style={inputStyle}>
          <option value="admin">Administrador</option>
          <option value="tecnico">Técnico</option>
          <option value="cliente">Cliente</option>
        </select>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 5 }}>
          Contraseña *
        </label>
        <input required type="password" value={form.password} onChange={set('password')} placeholder="ej: Admin1507!" style={inputStyle} />
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
          Debe tener mayúscula, minúscula, número y símbolo (ej: <code>Admin1507!</code>)
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 5 }}>
          Duración: <span style={{ color: 'var(--accent-amber)' }}>{form.dias} días</span>
        </label>
        <input type="range" min={1} max={30} value={form.dias} onChange={set('dias')} style={{ width: '100%', accentColor: 'var(--accent-amber)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>
          <span>1 día</span><span>30 días</span>
        </div>
      </div>
      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626', fontSize: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={saving} style={{
          padding: '8px 20px', background: 'var(--accent-amber)', border: 'none',
          borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'white',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Creando…' : 'Crear colaborador'}
        </button>
      </div>
    </form>
  );
}

// ─── UsersPage ────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.groups?.includes('admin');

  const { usuarios, loading, mutating, mutError, crearUsuario, crearColaborador, editarUsuario, deshabilitarUsuario, habilitarUsuario, eliminarUsuario } = useGestionUsuarios();

  const [search, setSearch] = useState('');
  const [editUsuario, setEditUsuario] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showColaborador, setShowColaborador] = useState(false);
  const [colaboradorResult, setColaboradorResult] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null);   // { usuario, activarDespues }
  const [confirmEliminar, setConfirmEliminar] = useState(null); // { usuario }
  const [eliminarError, setEliminarError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);

  // Columna y dirección de ordenamiento activos
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(null);

  // Filtra y ordena la lista en el cliente
  const displayList = useMemo(() => {
    const q = search.toLowerCase();
    let list = usuarios.filter(u =>
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.nombre ?? u.name ?? '').toLowerCase().includes(q)
    );

    if (sortCol && sortDir) {
      list = [...list].sort((a, b) => {
        let va, vb;
        if (sortCol === 'nombre') {
          va = (a.nombre ?? a.name ?? '').toLowerCase();
          vb = (b.nombre ?? b.name ?? '').toLowerCase();
        } else if (sortCol === 'email') {
          va = (a.email ?? '').toLowerCase();
          vb = (b.email ?? '').toLowerCase();
        } else if (sortCol === 'rol') {
          va = (a.rol ?? a.role ?? a.grupos?.[0] ?? '').toLowerCase();
          vb = (b.rol ?? b.role ?? b.grupos?.[0] ?? '').toLowerCase();
        } else if (sortCol === 'estado') {
          // activos (0) antes que deshabilitados (1) en orden ascendente
          va = esActivo(a) ? 0 : 1;
          vb = esActivo(b) ? 0 : 1;
        }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ?  1 : -1;
        return 0;
      });
    }

    return list;
  }, [usuarios, search, sortCol, sortDir]);

  function handleSort(col) {
    const dir = nextDir(col, sortCol, sortDir);
    setSortCol(dir ? col : null);
    setSortDir(dir);
  }

  const handleCrearColaborador = async (payload) => {
    setFormError(null);
    try {
      const res = await crearColaborador(payload);
      setColaboradorResult(res);
      setShowColaborador(false);
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleCreate = async (payload) => {
    setFormError(null);
    try {
      await crearUsuario(payload);
      setShowCreate(false);
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleEdit = async (payload) => {
    setFormError(null);
    try {
      await editarUsuario(editUsuario.id_usuario ?? editUsuario.email, payload);
      setEditUsuario(null);
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleToggle = async () => {
    if (!confirmToggle) return;
    const id = confirmToggle.usuario.id_usuario ?? confirmToggle.usuario.email;
    try {
      if (confirmToggle.activarDespues) {
        await habilitarUsuario(id);
        setToast('Usuario reactivado correctamente.');
      } else {
        await deshabilitarUsuario(id);
        setToast('Usuario deshabilitado correctamente.');
      }
      setConfirmToggle(null);
    } catch { /* mutError maneja la visualización del error */ }
  };

  const handleEliminar = async () => {
    if (!confirmEliminar) return;
    setEliminarError(null);
    const id = confirmEliminar.usuario.id_usuario ?? confirmEliminar.usuario.email;
    try {
      await eliminarUsuario(id);
      setConfirmEliminar(null);
      setToast('Usuario eliminado permanentemente.');
    } catch (err) {
      setEliminarError(err.message);
    }
  };

  // Columnas con y sin ordenamiento
  const thBase = { padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' };
  // Número de columnas para el colspan del mensaje vacío
  const colCount = isAdmin ? 5 : 4;

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
              Gestión de usuarios
            </span>
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowColaborador(true); setFormError(null); }} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', background: 'transparent',
                border: '1px solid var(--accent-amber)', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12,
                color: 'var(--accent-amber)',
              }}>
                <Clock size={14} /> Añadir colaborador
              </button>
              <button onClick={() => { setShowCreate(true); setFormError(null); }} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', background: 'var(--accent-amber)', border: 'none',
                borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'white',
              }}>
                <Plus size={14} /> Nuevo usuario
              </button>
            </div>
          )}
        </div>

        {/* Buscador */}
        <div style={{ marginBottom: 16 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o correo…"
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)', fontSize: 13, width: '100%',
              maxWidth: 340, boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Error de mutación */}
        {mutError && (
          <div style={{ padding: '8px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, color: '#dc2626', fontSize: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} /> {mutError}
          </div>
        )}

        {/* Tabla */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-ui)' }}>
              <thead>
                <tr style={{ background: 'var(--bg-page)' }}>
                  <SortableHeader label="Usuario"  col="nombre" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Correo"   col="email"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Rol"      col="rol"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Estado"   col="estado" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  {isAdmin && <th style={thBase}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : displayList.map(u => {
                      const activo = esActivo(u);
                      const rolKey = u.rol ?? u.role ?? u.grupos?.[0] ?? 'cliente';
                      const esSelf = me?.email === u.email;
                      const esColab = !!u.es_colaborador;
                      const diasRestantes = esColab && u.vence_en
                        ? Math.max(0, Math.ceil((new Date(u.vence_en) - Date.now()) / 86400000))
                        : null;
                      return (
                        <tr key={u.id_usuario ?? u.email} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {esColab ? u.nickname : (u.nombre ?? u.name ?? '—')}
                            </div>
                            {esColab && (
                              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2, fontFamily: 'var(--font-data)' }}>
                                COLABORADOR TEMPORAL
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                            {esColab
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: diasRestantes === 0 ? '#dc2626' : diasRestantes <= 3 ? '#d97706' : 'var(--text-muted)' }}>
                                  <Clock size={11} />
                                  {diasRestantes === 0 ? 'Vencido' : `${diasRestantes}d restantes`}
                                </span>
                              : u.email
                            }
                          </td>
                          <td style={{ padding: '10px 14px' }}><RolBadge rol={rolKey} /></td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                              background: activo ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                              color: activo ? '#16a34a' : '#dc2626',
                            }}>
                              {activo ? <Check size={11} /> : <X size={11} />}
                              {activo ? 'Activo' : 'Deshabilitado'}
                            </span>
                          </td>
                          {isAdmin && (
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {/* Editar */}
                                <button
                                  onClick={() => { setEditUsuario(u); setFormError(null); }}
                                  title="Editar"
                                  style={{ padding: '5px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                                >
                                  <Edit2 size={13} />
                                </button>
                                {/* Deshabilitar / Reactivar */}
                                <button
                                  onClick={() => setConfirmToggle({ usuario: u, activarDespues: !activo })}
                                  title={activo ? 'Deshabilitar' : 'Reactivar'}
                                  style={{ padding: '5px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: activo ? '#dc2626' : '#16a34a', display: 'flex' }}
                                >
                                  {activo ? <UserX size={13} /> : <RefreshCw size={13} />}
                                </button>
                                {/* Eliminar permanentemente — oculto para el propio usuario */}
                                {!esSelf && (
                                  <button
                                    onClick={() => { setConfirmEliminar({ usuario: u }); setEliminarError(null); }}
                                    title="Eliminar permanentemente"
                                    style={{ padding: '5px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: '#dc2626', display: 'flex' }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                }
                {!loading && displayList.length === 0 && (
                  <tr><td colSpan={colCount} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                    {search ? 'Sin resultados para la búsqueda' : 'No hay usuarios registrados'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Modal: Editar usuario ── */}
      {editUsuario && (
        <Modal title="Editar usuario" onClose={() => setEditUsuario(null)}>
          <UsuarioForm initial={editUsuario} isEdit onSubmit={handleEdit} saving={mutating} error={formError} />
        </Modal>
      )}

      {/* ── Modal: Crear usuario ── */}
      {showCreate && (
        <Modal title="Nuevo usuario" onClose={() => setShowCreate(false)}>
          <UsuarioForm onSubmit={handleCreate} saving={mutating} error={formError} />
        </Modal>
      )}

      {/* ── Modal: Añadir colaborador ── */}
      {showColaborador && (
        <Modal title="Añadir colaborador temporal" onClose={() => setShowColaborador(false)}>
          <ColaboradorForm onSubmit={handleCrearColaborador} saving={mutating} error={formError} />
        </Modal>
      )}

      {/* ── Modal: Resultado colaborador creado ── */}
      {colaboradorResult && (
        <Modal title="Colaborador creado" onClose={() => setColaboradorResult(null)}>
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>
              {colaboradorResult.nickname}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              Vence el {new Date(colaboradorResult.vence_en).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
            <div style={{ background: 'var(--bg-inset)', borderRadius: 8, padding: '14px 20px', textAlign: 'left', marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-data)', letterSpacing: '0.1em', marginBottom: 8 }}>CREDENCIALES DE ACCESO</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Usuario</span>
                <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-amber)' }}>{colaboradorResult.nickname}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Contraseña</span>
                <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-amber)' }}>{colaboradorResult.password}</code>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>
              Compartí estas credenciales de forma segura. El acceso se revoca automáticamente al vencer.
            </div>
          </div>
        </Modal>
      )}

      {/* ── Confirm: deshabilitar / reactivar ── */}
      {confirmToggle && (
        <ConfirmDialog
          message={
            confirmToggle.activarDespues
              ? `¿Reactivar a ${confirmToggle.usuario.email}?`
              : `¿Deshabilitar a ${confirmToggle.usuario.email}?`
          }
          confirmLabel={confirmToggle.activarDespues ? 'Reactivar' : 'Deshabilitar'}
          danger={!confirmToggle.activarDespues}
          onConfirm={handleToggle}
          onCancel={() => setConfirmToggle(null)}
          loading={mutating}
        />
      )}

      {/* ── Confirm: eliminar permanentemente ── */}
      {confirmEliminar && (
        <ConfirmDialog
          message={
            <>
              <span>¿Eliminar permanentemente a <strong>{confirmEliminar.usuario.email}</strong>?</span>
              <br /><br />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Esta acción no se puede deshacer. El usuario perderá acceso inmediatamente y todos sus datos serán eliminados.
              </span>
              {eliminarError && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={13} /> {eliminarError}
                </div>
              )}
            </>
          }
          confirmLabel="Eliminar"
          danger
          onConfirm={handleEliminar}
          onCancel={() => setConfirmEliminar(null)}
          loading={mutating}
        />
      )}

      {/* ── Toast de éxito ── */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
