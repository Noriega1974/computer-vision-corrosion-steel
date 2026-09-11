import React, { useState, useEffect } from 'react';
import { Plus, Edit2, X, AlertCircle, Check, Power, MapPin } from 'lucide-react';
import { useGestionEmpresas } from '../hooks/useEmpresas';
import ZonaMapPicker from '../components/ZonaMapPicker';
import SearchableSelect from '../components/SearchableSelect';
import colombiaData from '../data/colombia-divipola.json';

const DEPARTAMENTOS = colombiaData.departamentos.map(d => d.nombre);
const MUNICIPIOS_POR_DEPARTAMENTO = Object.fromEntries(
  colombiaData.departamentos.map(d => [d.nombre, d.municipios])
);

// ─── Modal wrapper (mismo patrón que BloquesPage/UsersPage) ─────────────────
function Modal({ title, onClose, children, maxWidth = 500 }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-card-solid)', border: '1px solid var(--border)',
        borderRadius: 12, width: '100%', maxWidth,
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
  useEffect(() => {
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

// ─── Formulario de zona (=empresa/afiliación) ────────────────────────────────
// `initial`/`isEdit`: mismo patrón que el resto de la app, reusa el mismo
// formulario en creación (POST /empresas) y edición (PUT /empresas/{id}).
function ZonaForm({ initial = {}, isEdit, onSubmit, saving, error }) {
  const [nombre, setNombre] = useState(initial.nombre ?? '');
  const [departamento, setDepartamento] = useState(initial.departamento ?? '');
  const [ciudad, setCiudad] = useState(initial.ciudad ?? '');
  const municipiosDisponibles = MUNICIPIOS_POR_DEPARTAMENTO[departamento] ?? [];

  // Tipo de material: es propiedad del SITIO completo (todos los puntos de
  // una zona suelen compartir el mismo material) -- por eso se pregunta acá
  // y no en cada Punto. Casi todo lo que se trabaja es galvanizado, así que
  // arranca preseleccionado; "Otro" revela texto libre.
  const materialInicialEsOtro = initial.tipo_material && initial.tipo_material !== 'Galvanizado';
  const [tipoMaterial, setTipoMaterial] = useState(materialInicialEsOtro ? 'otro' : 'Galvanizado');
  const [tipoMaterialOtro, setTipoMaterialOtro] = useState(materialInicialEsOtro ? initial.tipo_material : '');

  // Coordenadas del "centro" de la zona (dónde arranca a mirar el mapa al
  // dibujarla) -- detecta la ubicación del dispositivo sola al abrir el
  // formulario, con un toggle "Ser más específico" para tipearla a mano.
  const [latitud, setLatitud] = useState(initial.coordenadas?.lat ?? '');
  const [longitud, setLongitud] = useState(initial.coordenadas?.lng ?? '');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [showManual, setShowManual] = useState(false);

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

  const [zonas, setZonas] = useState(initial.zonas ?? []);
  const hayCoordenadas = latitud !== '' && longitud !== '';
  const [validationError, setValidationError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!DEPARTAMENTOS.includes(departamento)) {
      setValidationError('Selecciona un departamento válido de la lista.');
      return;
    }
    if (!municipiosDisponibles.includes(ciudad)) {
      setValidationError('Selecciona una ciudad válida del departamento elegido.');
      return;
    }
    if (tipoMaterial === 'otro' && !tipoMaterialOtro.trim()) {
      setValidationError('Especifica el tipo de material.');
      return;
    }
    if (zonas.length === 0) {
      setValidationError('Dibuja al menos una zona en el mapa.');
      return;
    }
    setValidationError(null);
    // `latitud`/`longitud` son solo el punto de referencia para centrar el
    // mapa al dibujar zonas -- no se guardan aparte en la empresa, el
    // backend no tiene ese campo. Lo único persistente es `zonas`.
    onSubmit({
      nombre,
      departamento,
      ciudad,
      tipo_material: tipoMaterial === 'otro' ? tipoMaterialOtro.trim() : tipoMaterial,
      zonas,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <label htmlFor="zona-nombre" style={labelStyle}>
          Nombre de la afiliación *
        </label>
        <input
          id="zona-nombre" name="nombre" autoComplete="off"
          required value={nombre} onChange={e => setNombre(e.target.value)}
          placeholder="ej: Universidad del Norte" style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <label htmlFor="zona-departamento" style={labelStyle}>
          Departamento *
        </label>
        <SearchableSelect
          id="zona-departamento"
          options={DEPARTAMENTOS}
          value={departamento}
          onChange={(v) => { setDepartamento(v); setCiudad(''); }}
          placeholder="Buscar departamento"
          emptyMessage="Sin coincidencias"
        />
      </div>

      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <label htmlFor="zona-ciudad" style={labelStyle}>
          Ciudad *
        </label>
        <SearchableSelect
          id="zona-ciudad"
          options={municipiosDisponibles}
          value={ciudad}
          onChange={setCiudad}
          placeholder={departamento ? 'Buscar ciudad' : 'Selecciona un departamento primero'}
          disabled={!departamento}
          emptyMessage="Sin coincidencias"
        />
      </div>

      <div style={{ marginBottom: tipoMaterial === 'otro' ? 'var(--space-2)' : 'var(--space-3-5)' }}>
        <label htmlFor="zona-tipo-material" style={labelStyle}>
          Tipo de material (opcional)
        </label>
        <select
          id="zona-tipo-material" name="tipo_material" style={inputStyle}
          value={tipoMaterial} onChange={e => setTipoMaterial(e.target.value)}
        >
          <option value="Galvanizado">Galvanizado</option>
          <option value="otro">Otro (especificar)</option>
        </select>
      </div>
      {tipoMaterial === 'otro' && (
        <div style={{ marginBottom: 'var(--space-3-5)' }}>
          <label htmlFor="zona-tipo-material-otro" style={labelStyle}>
            Especifica el material *
          </label>
          <input
            id="zona-tipo-material-otro" name="tipo_material_otro" autoComplete="off"
            required value={tipoMaterialOtro} onChange={e => setTipoMaterialOtro(e.target.value)}
            placeholder="ej: A588" style={inputStyle}
          />
        </div>
      )}

      {/* Ubicación de referencia -- detección automática + toggle manual.
          No es <label>: encabeza el bloque entero, no un solo control. */}
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <span style={{ ...labelStyle, display: 'block' }}>Ubicación de referencia</span>

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
              <label htmlFor="zona-latitud" style={labelStyle}>Latitud</label>
              <input
                id="zona-latitud" name="latitud" type="number" inputMode="decimal" step="any"
                value={latitud} onChange={e => setLatitud(e.target.value === '' ? '' : Number(e.target.value))}
                style={inputStyle} placeholder="Ej: 4.710989"
              />
            </div>
            <div>
              <label htmlFor="zona-longitud" style={labelStyle}>Longitud</label>
              <input
                id="zona-longitud" name="longitud" type="number" inputMode="decimal" step="any"
                value={longitud} onChange={e => setLongitud(e.target.value === '' ? '' : Number(e.target.value))}
                style={inputStyle} placeholder="Ej: -74.072092"
              />
            </div>
          </div>
        )}
      </div>

      {/* Zona: obligatoria. El mapa arranca centrado en la ubicación de
          referencia de arriba. */}
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <span style={{ ...labelStyle, display: 'block' }}>Zona en el mapa *</span>
        {hayCoordenadas ? (
          <ZonaMapPicker
            zonas={zonas} onChange={setZonas}
            puntoReferencia={{ lat: Number(latitud), lng: Number(longitud) }}
          />
        ) : (
          <div style={{ padding: '10px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
            Marca una ubicación de referencia arriba para dibujar la zona.
          </div>
        )}
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
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear zona'}
        </button>
      </div>
    </form>
  );
}

// ─── ZonasPage ──────────────────────────────────────────────────────────────
// Ruta /zonas -- exclusiva de super_admin (mismo backend que ya exigía
// GET/POST/PUT /empresas solo para ese rol). Una Zona ES una Empresa/
// Afiliación (misma entidad, back a back): el "cuadrado grande" con
// departamento/ciudad/tipo de material/área dibujada en el mapa. Los
// Puntos (antes Bloques) viven DENTRO de una zona y se administran aparte,
// en /puntos.
export default function ZonasPage() {
  const { empresas, loading, mutating, mutError, crearEmpresa, editarEmpresa } = useGestionEmpresas();

  const [showCreate, setShowCreate] = useState(false);
  const [editZona, setEditZona] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null); // { zona, activarDespues }
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);

  const handleCrear = async (payload) => {
    setFormError(null);
    try {
      await crearEmpresa(payload);
      setShowCreate(false);
      setToast('Zona creada correctamente.');
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleEditar = async (payload) => {
    setFormError(null);
    try {
      await editarEmpresa(editZona.id_empresa, payload);
      setEditZona(null);
      setToast('Zona actualizada correctamente.');
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleToggle = async () => {
    if (!confirmToggle) return;
    const { zona, activarDespues } = confirmToggle;
    try {
      await editarEmpresa(zona.id_empresa, { activa: activarDespues });
      setToast(activarDespues ? 'Zona activada correctamente.' : 'Zona desactivada correctamente.');
    } catch {
      // mutError muestra el error en el banner sobre la tabla; el diálogo
      // se cierra igual para que ese banner no quede tapado por el overlay.
    } finally {
      setConfirmToggle(null);
    }
  };

  const thBase = { padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-data)', fontSize: 'var(--text-3xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' };

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <div style={{ padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2-5)' }}>
            <span style={{ background: 'var(--accent-amber)', width: 3, height: 20, borderRadius: 2, display: 'inline-block' }} />
            <MapPin size={16} color="var(--text-primary)" />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-sm)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              Zonas
            </span>
          </div>
          <button onClick={() => { setShowCreate(true); setFormError(null); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 14px', background: 'var(--accent-amber)', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'white',
          }}>
            <Plus size={14} /> Nueva zona
          </button>
        </div>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: -12, marginBottom: 20, fontFamily: 'var(--font-ui)' }}>
          Una zona es una afiliación: el área completa sobre la que una empresa tiene jurisdicción. Los puntos de monitoreo se crean adentro, en la sección Puntos.
        </p>

        {mutError && (
          <div style={{ padding: '8px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, color: '#dc2626', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3-5)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} /> {mutError}
          </div>
        )}

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)' }}>
              <thead>
                <tr style={{ background: 'var(--bg-page)' }}>
                  <th style={thBase}>Zona</th>
                  <th style={thBase}>Ubicación</th>
                  <th style={thBase}>Material</th>
                  <th style={thBase}>Área dibujada</th>
                  <th style={thBase}>Estado</th>
                  <th style={thBase}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <tr key={i}>
                        {[70, 60, 40, 40, 30, 40].map((w, j) => (
                          <td key={j} style={{ padding: '10px 14px' }}>
                            <div style={{ height: 13, borderRadius: 4, background: 'var(--border)', width: `${w}%`, animation: 'shimmer 1.5s infinite' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : empresas.map(e => (
                      <tr key={e.id_empresa} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{e.nombre}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                          {e.ciudad ? `${e.ciudad}${e.departamento ? ` · ${e.departamento}` : ''}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{e.tipo_material ?? '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
                          {(e.zonas ?? []).length > 0 ? `${e.zonas.length} zona${e.zonas.length > 1 ? 's' : ''}` : 'Sin dibujar'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                            padding: '2px 8px', borderRadius: 5, fontSize: 'var(--text-2xs)', fontWeight: 600,
                            background: e.activa === false ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)',
                            color: e.activa === false ? '#dc2626' : '#16a34a',
                          }}>
                            {e.activa === false ? <X size={11} /> : <Check size={11} />}
                            {e.activa === false ? 'Inactiva' : 'Activa'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => { setEditZona(e); setFormError(null); }}
                              title="Editar"
                              style={{ padding: '5px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => setConfirmToggle({ zona: e, activarDespues: e.activa === false })}
                              title={e.activa === false ? 'Activar' : 'Desactivar'}
                              style={{ padding: '5px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: e.activa === false ? '#16a34a' : '#dc2626', display: 'flex' }}
                            >
                              <Power size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                }
                {!loading && empresas.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
                    No hay zonas registradas
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreate && (
        <Modal title="Nueva zona" onClose={() => setShowCreate(false)} maxWidth={620}>
          <ZonaForm onSubmit={handleCrear} saving={mutating} error={formError} />
        </Modal>
      )}

      {editZona && (
        <Modal title="Editar zona" onClose={() => setEditZona(null)} maxWidth={620}>
          <ZonaForm initial={editZona} isEdit onSubmit={handleEditar} saving={mutating} error={formError} />
        </Modal>
      )}

      {confirmToggle && (
        <ConfirmDialog
          message={
            confirmToggle.activarDespues
              ? `¿Activar la zona ${confirmToggle.zona.nombre}?`
              : `¿Desactivar la zona ${confirmToggle.zona.nombre}?`
          }
          confirmLabel={confirmToggle.activarDespues ? 'Activar' : 'Desactivar'}
          danger={!confirmToggle.activarDespues}
          onConfirm={handleToggle}
          onCancel={() => setConfirmToggle(null)}
          loading={mutating}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
