import React, { useState, useMemo } from 'react';
import { Plus, Edit2, X, AlertCircle, Check, Power, Boxes } from 'lucide-react';
import { useGestionBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';
import { useAuth } from '../auth/AuthContext';

// ─── Skeleton ────────────────────────────────────────────────────────────────
function SkeletonRow({ cols }) {
  const widths = cols === 6 ? [70, 90, 50, 30, 40, 40] : [70, 90, 30, 40, 40];
  return (
    <tr>
      {widths.map((w, i) => (
        <td key={i} style={{ padding: '10px 14px' }}>
          <div style={{ height: 13, borderRadius: 4, background: 'var(--border)', width: `${w}%`, animation: 'shimmer 1.5s infinite' }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Modal wrapper (mismo patrón que UsersPage/PlantsPage) ───────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        // --bg-card es 72% opaco (pensado para ir sobre el blur del
        // dashboard) -- --bg-card-solid es la variante opaca para un modal
        // sin blur propio, igual que en UsersPage/PlantsPage.
        background: 'var(--bg-card-solid)', border: '1px solid var(--border)',
        borderRadius: 12, width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 'var(--space-1)', borderRadius: 6 }}>
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

// ─── Confirm dialog ──────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel, loading, confirmLabel = 'Confirmar', danger = false }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, maxWidth: 400, width: '100%', padding: '24px 20px',
      }}>
        <div style={{ fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', marginBottom: 20, lineHeight: 1.6 }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2-5)' }}>
          <button onClick={onCancel} disabled={loading} style={{
            padding: '7px 16px', background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
          }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading} style={{
            padding: '7px 16px', background: danger ? '#dc2626' : 'var(--accent-amber)', border: 'none',
            borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'white',
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
  React.useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 600,
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      padding: '10px 16px',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderLeft: '3px solid #16a34a', borderRadius: 8,
      boxShadow: 'var(--shadow-lg)',
      fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
    }}>
      <Check size={14} color="#16a34a" />
      {message}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-page)',
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontFamily: 'var(--font-data)', fontSize: 'var(--text-3xs)',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
  color: 'var(--text-faint)', marginBottom: 5,
};

// ─── Formulario de bloque ──────────────────────────────────────────────────
// `empresasDisponibles`/`requiereEmpresa`: solo al CREAR y solo para
// super_admin (mismo motivo que PuntoForm en PlantsPage -- admin ya tiene
// su empresa forzada en el backend, no elige). El backend no acepta cambiar
// la empresa de un bloque ya creado, así que este campo nunca aparece al
// editar.
function BloqueForm({ initial = {}, isEdit, onSubmit, saving, error, empresasDisponibles, requiereEmpresa }) {
  const [form, setForm] = useState({
    nombre: initial.nombre ?? '',
    descripcion: initial.descripcion ?? '',
    empresa_id: initial.empresa_id ?? '',
  });
  const [validationError, setValidationError] = useState(null);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (requiereEmpresa && !form.empresa_id) {
      setValidationError('Selecciona a qué afiliación pertenece este bloque.');
      return;
    }
    setValidationError(null);
    const payload = { nombre: form.nombre, descripcion: form.descripcion };
    if (requiereEmpresa) payload.empresa_id = form.empresa_id;
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <label htmlFor="bloque-nombre" style={labelStyle}>
          Nombre del bloque *
        </label>
        <input
          id="bloque-nombre" name="nombre" autoComplete="off"
          required value={form.nombre} onChange={set('nombre')}
          placeholder="ej: Nave A" style={inputStyle}
        />
      </div>

      {requiereEmpresa && (
        <div style={{ marginBottom: 'var(--space-3-5)' }}>
          <label htmlFor="bloque-empresa" style={labelStyle}>
            Afiliación *
          </label>
          <select
            id="bloque-empresa" name="empresa_id"
            value={form.empresa_id} onChange={set('empresa_id')}
            required style={inputStyle}
          >
            <option value="">Selecciona una afiliación…</option>
            {(empresasDisponibles ?? []).map(e => (
              <option key={e.id_empresa} value={e.id_empresa}>{e.nombre}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <label htmlFor="bloque-descripcion" style={labelStyle}>
          Descripción
        </label>
        <input
          id="bloque-descripcion" name="descripcion" autoComplete="off"
          value={form.descripcion} onChange={set('descripcion')}
          placeholder="ej: Techo y estructura metálica del galpón principal"
          style={inputStyle}
        />
      </div>

      {(validationError || error) && (
        <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3-5)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={13} /> {validationError || error}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={saving} style={{
          padding: '8px 20px', background: 'var(--accent-amber)', border: 'none',
          borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'white',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear bloque'}
        </button>
      </div>
    </form>
  );
}

// ─── BloquesPage ──────────────────────────────────────────────────────────────
// Ruta /bloques -- solo super_admin/admin (ver RoleRoute en App.jsx). Un
// bloque es una carpeta lógica dentro de una empresa para agrupar puntos de
// monitoreo (ej. "Nave A", "Patio de tanques").
export default function BloquesPage() {
  const { user: me } = useAuth();
  const esSuperAdmin = me?.groups?.includes('super_admin');

  const { bloques, loading, mutating, mutError, crearBloque, editarBloque } = useGestionBloques();
  // `enabled=esSuperAdmin`: evita el fetch (y el 403) de /empresas para
  // admin -- solo hace falta la lista completa para el selector y la
  // columna "Empresa" de super_admin.
  const { empresas } = useEmpresas(esSuperAdmin);
  const empresaNombrePorId = useMemo(
    () => Object.fromEntries(empresas.map(e => [e.id_empresa, e.nombre])),
    [empresas]
  );

  const [showCreate, setShowCreate] = useState(false);
  const [editBloque, setEditBloque] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null); // { bloque, activarDespues }
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);

  const handleCrear = async (payload) => {
    setFormError(null);
    try {
      await crearBloque(payload);
      setShowCreate(false);
      setToast('Bloque creado correctamente.');
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleEditar = async (payload) => {
    setFormError(null);
    try {
      await editarBloque(editBloque.id_bloque, payload);
      setEditBloque(null);
      setToast('Bloque actualizado correctamente.');
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleToggle = async () => {
    if (!confirmToggle) return;
    const { bloque, activarDespues } = confirmToggle;
    try {
      await editarBloque(bloque.id_bloque, { activo: activarDespues });
      setToast(activarDespues ? 'Bloque activado correctamente.' : 'Bloque desactivado correctamente.');
    } catch {
      // mutError muestra el error en el banner sobre la tabla; el diálogo se
      // cierra igual para que ese banner no quede tapado por el overlay.
    } finally {
      setConfirmToggle(null);
    }
  };

  const thBase = { padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-data)', fontSize: 'var(--text-3xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' };
  const colCount = esSuperAdmin ? 6 : 5;

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <div style={{ padding: 'var(--space-5)' }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2-5)' }}>
            <span style={{ background: 'var(--accent-amber)', width: 3, height: 20, borderRadius: 2, display: 'inline-block' }} />
            <Boxes size={16} color="var(--text-primary)" />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-sm)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              Bloques
            </span>
          </div>
          <button onClick={() => { setShowCreate(true); setFormError(null); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 14px', background: 'var(--accent-amber)', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'white',
          }}>
            <Plus size={14} /> Nuevo bloque
          </button>
        </div>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: -12, marginBottom: 20, fontFamily: 'var(--font-ui)' }}>
          Un bloque agrupa puntos de monitoreo dentro de una afiliación (ej. una nave, un patio de tanques).
        </p>

        {/* Error de mutación */}
        {mutError && (
          <div style={{ padding: '8px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, color: '#dc2626', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3-5)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} /> {mutError}
          </div>
        )}

        {/* Tabla */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)' }}>
              <thead>
                <tr style={{ background: 'var(--bg-page)' }}>
                  <th style={thBase}>Nombre</th>
                  <th style={thBase}>Descripción</th>
                  {esSuperAdmin && <th style={thBase}>Empresa</th>}
                  <th style={thBase}>Puntos</th>
                  <th style={thBase}>Estado</th>
                  <th style={thBase}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={colCount} />)
                  : bloques.map(b => (
                      <tr key={b.id_bloque} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{b.nombre}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{b.descripcion || '—'}</td>
                        {esSuperAdmin && (
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                            {empresaNombrePorId[b.empresa_id] ?? b.empresa_id}
                          </td>
                        )}
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
                          {b.cantidad_puntos ?? 0}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                            padding: '2px 8px', borderRadius: 5, fontSize: 'var(--text-2xs)', fontWeight: 600,
                            background: b.activo === false ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)',
                            color: b.activo === false ? '#dc2626' : '#16a34a',
                          }}>
                            {b.activo === false ? <X size={11} /> : <Check size={11} />}
                            {b.activo === false ? 'Inactivo' : 'Activo'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => { setEditBloque(b); setFormError(null); }}
                              title="Editar"
                              style={{ padding: '5px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => setConfirmToggle({ bloque: b, activarDespues: b.activo === false })}
                              title={b.activo === false ? 'Activar' : 'Desactivar'}
                              style={{ padding: '5px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: b.activo === false ? '#16a34a' : '#dc2626', display: 'flex' }}
                            >
                              <Power size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                }
                {!loading && bloques.length === 0 && (
                  <tr><td colSpan={colCount} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
                    No hay bloques registrados
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Modal: Crear bloque ── */}
      {showCreate && (
        <Modal title="Nuevo bloque" onClose={() => setShowCreate(false)}>
          <BloqueForm
            onSubmit={handleCrear}
            saving={mutating}
            error={formError}
            empresasDisponibles={empresas}
            requiereEmpresa={esSuperAdmin}
          />
        </Modal>
      )}

      {/* ── Modal: Editar bloque ── */}
      {editBloque && (
        <Modal title={`Editar: ${editBloque.nombre}`} onClose={() => setEditBloque(null)}>
          <BloqueForm initial={editBloque} isEdit onSubmit={handleEditar} saving={mutating} error={formError} />
        </Modal>
      )}

      {/* ── Confirm: activar / desactivar ── */}
      {confirmToggle && (
        <ConfirmDialog
          message={
            confirmToggle.activarDespues
              ? `¿Activar el bloque ${confirmToggle.bloque.nombre}?`
              : `¿Desactivar el bloque ${confirmToggle.bloque.nombre}?`
          }
          confirmLabel={confirmToggle.activarDespues ? 'Activar' : 'Desactivar'}
          danger={!confirmToggle.activarDespues}
          onConfirm={handleToggle}
          onCancel={() => setConfirmToggle(null)}
          loading={mutating}
        />
      )}

      {/* ── Toast de éxito ── */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
