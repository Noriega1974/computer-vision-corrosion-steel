import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, X, AlertCircle, Check, Power, Trash2, MapPin, Building2 } from 'lucide-react';
import { useGestionBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth } from '../auth/AuthContext';
import SearchableSelect from '../components/SearchableSelect';
import colombiaData from '../data/colombia-divipola.json';

const DEPARTAMENTOS = colombiaData.departamentos.map(d => d.nombre);
const MUNICIPIOS_POR_DEPARTAMENTO = Object.fromEntries(
  colombiaData.departamentos.map(d => [d.nombre, d.municipios])
);

// ─── Skeleton ────────────────────────────────────────────────────────────────
function SkeletonRow({ cols }) {
  // Placeholder cosmético: recorta el set de 7 anchuras a las `cols` que
  // haya (5 para tecnico, 6 para admin, 7 para super_admin) -- no hace
  // falta que cada ancho calce exacto con su columna real, es un shimmer.
  const widths = [70, 90, 50, 60, 30, 40, 40].slice(0, cols);
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
        borderRadius: 12, width: '100%', maxWidth: 560,
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

// ─── Formulario de punto de monitoreo ───────────────────────────────────────
// Internamente sigue siendo "bloque" (identificadores, endpoint /bloques):
// el "Punto" viejo (PlantsPage/PuntoForm, ya retirado) fue absorbido por el
// "Bloque", que pasa a ser la única entidad de ubicación.
//
// El formulario cambia según quién lo usa:
// - super_admin administra TODO: nombre, afiliación (cualquiera), departamento
//   y ciudad (editables), ubicación (detección automática + "ser más
//   específico" manual).
// - admin/tecnico solo cambian nombre y ubicación. Afiliación/departamento/
//   ciudad ya no son campos editables: se toman de SU PROPIA afiliación
//   (`perfil.empresa_nombre/departamento/ciudad`, resuelto por el backend en
//   GET /usuarios/me) y se muestran como dato informativo, nunca como
//   selector -- no tiene sentido pedírselo si solo pueden pertenecer a una.
// `tipo_material` NO va acá -- es propiedad de la zona/empresa completa (ver
// ZonasPage), no de cada punto individual.
function BloqueForm({ initial = {}, isEdit, onSubmit, saving, error, esSuperAdmin, empresasDisponibles, perfil }) {
  const [form, setForm] = useState({
    nombre: initial.nombre ?? '',
    descripcion: initial.descripcion ?? '',
    empresa_id: initial.empresa_id ?? '',
    ciudad: initial.ciudad ?? '',
    departamento: initial.departamento ?? '',
    tipo_estructura: initial.tipo_estructura ?? '',
    grosor_mm: initial.grosor_mm ?? '',
  });

  // admin/tecnico: departamento/ciudad/empresa se completan solos desde su
  // propia afiliación, una sola vez al crear (nunca al editar un punto ya
  // existente, para no pisar lo que ya tenía guardado).
  useEffect(() => {
    if (esSuperAdmin || isEdit || !perfil) return;
    setForm(f => ({
      ...f,
      empresa_id: perfil.empresa_id ?? f.empresa_id,
      departamento: perfil.empresa_departamento ?? f.departamento,
      ciudad: perfil.empresa_ciudad ?? f.ciudad,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, esSuperAdmin, isEdit]);

  // Ubicación -- detección automática al abrir el formulario, con toggle
  // "Ser más específico" para tipear lat/lng a mano. Mismo patrón para
  // super_admin y para admin/tecnico: el nombre y la ubicación son "lo único
  // que cambiarían con seguridad" según lo pedido.
  const [latitud, setLatitud] = useState(initial.coordenadas?.lat ?? '');
  const [longitud, setLongitud] = useState(initial.coordenadas?.lng ?? '');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const hayCoordenadas = latitud !== '' && longitud !== '';

  useEffect(() => {
    const yaHayCoordenadas = initial.coordenadas?.lat;
    if (yaHayCoordenadas || !navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitud(parseFloat(pos.coords.latitude.toFixed(6)));
        setLongitud(parseFloat(pos.coords.longitude.toFixed(6)));
        setGeoLoading(false);
      },
      () => {
        setGeoError('No se pudo detectar la ubicación automáticamente.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [validationError, setValidationError] = useState(null);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setField = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const municipiosDisponibles = MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] ?? [];

  const handleSubmit = (e) => {
    e.preventDefault();

    if (esSuperAdmin && !form.empresa_id) {
      setValidationError('Selecciona a qué afiliación pertenece este punto.');
      return;
    }
    if (esSuperAdmin && !DEPARTAMENTOS.includes(form.departamento)) {
      setValidationError('Selecciona un departamento válido de la lista.');
      return;
    }
    if (esSuperAdmin && !municipiosDisponibles.includes(form.ciudad)) {
      setValidationError('Selecciona una ciudad válida del departamento elegido.');
      return;
    }
    if (!esSuperAdmin && (!form.departamento || !form.ciudad)) {
      setValidationError('Tu afiliación todavía no tiene departamento/ciudad. Pedile a un super_admin que la complete en Zonas.');
      return;
    }
    if (!hayCoordenadas) {
      setValidationError('Marca la ubicación (detectala o ingresá las coordenadas a mano).');
      return;
    }

    setValidationError(null);

    const payload = {
      nombre: form.nombre,
      descripcion: form.descripcion,
      ciudad: form.ciudad,
      departamento: form.departamento,
      coordenadas: { lat: Number(latitud), lng: Number(longitud) },
      ...(form.tipo_estructura && { tipo_estructura: form.tipo_estructura }),
      ...(form.grosor_mm !== '' && { grosor_mm: Number(form.grosor_mm) }),
    };
    if (esSuperAdmin) payload.empresa_id = form.empresa_id;

    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <label htmlFor="punto-nombre" style={labelStyle}>
          Nombre del punto *
        </label>
        <input
          id="punto-nombre" name="nombre" autoComplete="off"
          required value={form.nombre} onChange={set('nombre')}
          placeholder="ej: Nave A" style={inputStyle}
        />
      </div>

      {esSuperAdmin ? (
        <>
          <div style={{ marginBottom: 'var(--space-3-5)' }}>
            <label htmlFor="punto-empresa" style={labelStyle}>
              Afiliación *
            </label>
            <select
              id="punto-empresa" name="empresa_id"
              value={form.empresa_id} onChange={set('empresa_id')}
              required style={inputStyle}
            >
              <option value="">Selecciona una afiliación…</option>
              {(empresasDisponibles ?? []).map(e => (
                <option key={e.id_empresa} value={e.id_empresa}>{e.nombre}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 'var(--space-3-5)' }}>
            <label htmlFor="punto-departamento" style={labelStyle}>
              Departamento *
            </label>
            <SearchableSelect
              id="punto-departamento"
              options={DEPARTAMENTOS}
              value={form.departamento}
              onChange={(v) =>
                setForm(f => ({
                  ...f,
                  departamento: v,
                  ciudad: v === f.departamento ? f.ciudad : '',
                }))
              }
              placeholder="Buscar departamento"
              emptyMessage="Sin coincidencias"
            />
          </div>

          <div style={{ marginBottom: 'var(--space-3-5)' }}>
            <label htmlFor="punto-ciudad" style={labelStyle}>
              Ciudad *
            </label>
            <SearchableSelect
              id="punto-ciudad"
              options={municipiosDisponibles}
              value={form.ciudad}
              onChange={setField('ciudad')}
              placeholder={form.departamento ? 'Buscar ciudad' : 'Selecciona un departamento primero'}
              disabled={!form.departamento}
              emptyMessage="Sin coincidencias"
            />
          </div>
        </>
      ) : (
        // admin/tecnico: informativo, no editable -- ya viene de su propia
        // afiliación (perfil, resuelto por el backend).
        <div style={{ marginBottom: 'var(--space-3-5)', padding: '10px 14px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          <Building2 size={14} />
          <span>
            {perfil?.empresa_nombre ?? 'Tu afiliación'}
            {form.ciudad && ` · ${form.ciudad}`}{form.departamento && `, ${form.departamento}`}
          </span>
        </div>
      )}

      {/* Ubicación -- detección automática + toggle manual, igual para
          todos los roles. No es <label>: encabeza el bloque entero. */}
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <span style={{ ...labelStyle, display: 'block' }}>Ubicación *</span>

        {geoLoading && (
          <div style={{ padding: '8px 12px', background: 'rgba(156,54,16,0.05)', border: '1px solid rgba(156,54,16,0.15)', borderRadius: 7, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
            Detectando ubicación…
          </div>
        )}
        {!geoLoading && hayCoordenadas && (
          <div style={{ padding: '8px 12px', background: 'rgba(156,54,16,0.05)', border: '1px solid rgba(156,54,16,0.15)', borderRadius: 7, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
            📍 {latitud}, {longitud}
          </div>
        )}
        {geoError && (
          <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, fontSize: 'var(--text-2xs)', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertCircle size={12} /> {geoError}
          </div>
        )}

        <button
          type="button" onClick={() => setShowManual(v => !v)}
          style={{
            marginTop: 'var(--space-2)', background: 'none', border: 'none', padding: 0,
            fontSize: 'var(--text-2xs)', color: 'var(--accent-amber)', cursor: 'pointer',
            fontFamily: 'var(--font-data)', fontWeight: 600, letterSpacing: '0.04em',
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          {showManual ? 'Ocultar coordenadas' : 'Ser más específico con la ubicación'}
        </button>

        {showManual && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-2-5)' }}>
            <div>
              <label htmlFor="punto-latitud" style={labelStyle}>Latitud</label>
              <input
                id="punto-latitud" name="latitud" type="number" inputMode="decimal" step="any"
                value={latitud} onChange={e => setLatitud(e.target.value === '' ? '' : Number(e.target.value))}
                style={inputStyle} placeholder="Ej: 4.710989"
              />
            </div>
            <div>
              <label htmlFor="punto-longitud" style={labelStyle}>Longitud</label>
              <input
                id="punto-longitud" name="longitud" type="number" inputMode="decimal" step="any"
                value={longitud} onChange={e => setLongitud(e.target.value === '' ? '' : Number(e.target.value))}
                style={inputStyle} placeholder="Ej: -74.072092"
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <label htmlFor="punto-tipo-estructura" style={labelStyle}>
          Tipo de estructura (opcional)
        </label>
        <input
          id="punto-tipo-estructura" name="tipo_estructura" autoComplete="off"
          value={form.tipo_estructura} onChange={set('tipo_estructura')}
          placeholder="ej: Tubería" style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <label htmlFor="punto-grosor" style={labelStyle}>
          Grosor del material en mm (opcional)
        </label>
        <input
          id="punto-grosor" name="grosor_mm" type="number" inputMode="decimal" step="any" min="0"
          value={form.grosor_mm} onChange={set('grosor_mm')}
          placeholder="ej: 2.5" style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <label htmlFor="punto-descripcion" style={labelStyle}>
          Descripción (opcional)
        </label>
        <input
          id="punto-descripcion" name="descripcion" autoComplete="off"
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
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear punto'}
        </button>
      </div>
    </form>
  );
}

// ─── BloquesPage ──────────────────────────────────────────────────────────────
// Ruta /puntos -- super_admin/admin/tecnico entran y pueden crear (el
// backend abre POST /bloques a los 3); editar/desactivar/eliminar sigue
// exclusivo de admin/super_admin (ver `puedeGestionar` abajo, y PUT/DELETE
// /bloques en el backend). cliente no entra. Página "Puntos": el "Punto"
// viejo (PlantsPage, retirado) fue absorbido por el "Bloque" -- esta es
// ahora la única entidad de ubicación, y agrupa además las mediciones
// tomadas ahí.
export default function BloquesPage() {
  const { user: me } = useAuth();
  const esSuperAdmin = me?.groups?.includes('super_admin');
  // tecnico puede entrar y CREAR puntos (el backend abre POST /bloques a
  // los 3 roles), pero no editar/desactivar/eliminar -- eso sigue exclusivo
  // de admin/super_admin (PUT/DELETE /bloques los rechaza con 403).
  const puedeGestionar = me?.groups?.includes('super_admin') || me?.groups?.includes('admin');
  // admin/tecnico: departamento/ciudad/afiliación del punto se auto-completan
  // desde acá (GET /usuarios/me), nunca los elige la persona.
  const { perfil } = useUsuarioPerfil();

  const { bloques, loading, mutating, mutError, crearBloque, editarBloque, eliminarBloque } = useGestionBloques();
  // `enabled=esSuperAdmin`: evita el fetch (y el 403) de /empresas para
  // admin -- solo hace falta la lista completa para el selector y la
  // columna "Afiliación" de super_admin.
  const { empresas } = useEmpresas(esSuperAdmin);
  const empresaNombrePorId = useMemo(
    () => Object.fromEntries(empresas.map(e => [e.id_empresa, e.nombre])),
    [empresas]
  );

  const [showCreate, setShowCreate] = useState(false);
  const [editBloque, setEditBloque] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null); // { bloque, activarDespues }
  const [confirmEliminar, setConfirmEliminar] = useState(null); // { bloque }
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);

  const handleCrear = async (payload) => {
    setFormError(null);
    try {
      await crearBloque(payload);
      setShowCreate(false);
      setToast('Punto creado correctamente.');
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleEditar = async (payload) => {
    setFormError(null);
    try {
      await editarBloque(editBloque.id_bloque, payload);
      setEditBloque(null);
      setToast('Punto actualizado correctamente.');
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleToggle = async () => {
    if (!confirmToggle) return;
    const { bloque, activarDespues } = confirmToggle;
    try {
      await editarBloque(bloque.id_bloque, { activo: activarDespues });
      setToast(activarDespues ? 'Punto activado correctamente.' : 'Punto desactivado correctamente.');
    } catch {
      // mutError muestra el error en el banner sobre la tabla; el diálogo se
      // cierra igual para que ese banner no quede tapado por el overlay.
    } finally {
      setConfirmToggle(null);
    }
  };

  // 409 si el punto (bloque) tiene mediciones asociadas -- el mensaje real
  // del backend viaja tal cual en mutError (ver useBloques.eliminarBloque),
  // se muestra sin reescribirlo en el banner sobre la tabla.
  const handleEliminar = async () => {
    if (!confirmEliminar) return;
    try {
      await eliminarBloque(confirmEliminar.bloque.id_bloque);
      setToast('Punto eliminado correctamente.');
    } catch {
      // idem handleToggle: el error real queda en mutError.
    } finally {
      setConfirmEliminar(null);
    }
  };

  const thBase = { padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-data)', fontSize: 'var(--text-3xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' };
  // Punto, Descripción, [Afiliación], Ubicación, Mediciones, Estado, [Acciones]
  const colCount = 5 + (esSuperAdmin ? 1 : 0) + (puedeGestionar ? 1 : 0);

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
            <MapPin size={16} color="var(--text-primary)" />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-sm)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              Puntos
            </span>
          </div>
          <button onClick={() => { setShowCreate(true); setFormError(null); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 14px', background: 'var(--accent-amber)', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'white',
          }}>
            <Plus size={14} /> Nuevo punto
          </button>
        </div>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: -12, marginBottom: 20, fontFamily: 'var(--font-ui)' }}>
          Un punto de monitoreo pertenece a una afiliación y agrupa las mediciones tomadas en un mismo lugar.
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
                  <th style={thBase}>Punto</th>
                  <th style={thBase}>Descripción</th>
                  {esSuperAdmin && <th style={thBase}>Afiliación</th>}
                  <th style={thBase}>Ubicación</th>
                  <th style={thBase}>Mediciones</th>
                  <th style={thBase}>Estado</th>
                  {puedeGestionar && <th style={thBase}>Acciones</th>}
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
                            {empresaNombrePorId[b.empresa_id] ?? '—'}
                          </td>
                        )}
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                          {b.ciudad ? `${b.ciudad}${b.departamento ? ` · ${b.departamento}` : ''}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
                          {b.cantidad_mediciones ?? 0}
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
                        {puedeGestionar && (
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
                              <button
                                onClick={() => setConfirmEliminar({ bloque: b })}
                                title="Eliminar"
                                style={{ padding: '5px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: '#dc2626', display: 'flex' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                }
                {!loading && bloques.length === 0 && (
                  <tr><td colSpan={colCount} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
                    No hay puntos registrados
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Modal: Crear punto ── */}
      {showCreate && (
        <Modal title="Nuevo punto" onClose={() => setShowCreate(false)}>
          <BloqueForm
            onSubmit={handleCrear}
            saving={mutating}
            error={formError}
            esSuperAdmin={esSuperAdmin}
            empresasDisponibles={empresas}
            perfil={perfil}
          />
        </Modal>
      )}

      {/* ── Modal: Editar punto ── */}
      {editBloque && (
        <Modal title={`Editar: ${editBloque.nombre}`} onClose={() => setEditBloque(null)}>
          <BloqueForm
            initial={editBloque} isEdit onSubmit={handleEditar} saving={mutating} error={formError}
            esSuperAdmin={esSuperAdmin} empresasDisponibles={empresas} perfil={perfil}
          />
        </Modal>
      )}

      {/* ── Confirm: activar / desactivar ── */}
      {confirmToggle && (
        <ConfirmDialog
          message={
            confirmToggle.activarDespues
              ? `¿Activar el punto ${confirmToggle.bloque.nombre}?`
              : `¿Desactivar el punto ${confirmToggle.bloque.nombre}?`
          }
          confirmLabel={confirmToggle.activarDespues ? 'Activar' : 'Desactivar'}
          danger={!confirmToggle.activarDespues}
          onConfirm={handleToggle}
          onCancel={() => setConfirmToggle(null)}
          loading={mutating}
        />
      )}

      {/* ── Confirm: eliminar ── */}
      {confirmEliminar && (
        <ConfirmDialog
          message={`¿Eliminar permanentemente el punto ${confirmEliminar.bloque.nombre}? Esta acción no se puede deshacer.`}
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
