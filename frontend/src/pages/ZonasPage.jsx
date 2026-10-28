import Aviso from '../components/Aviso';
import ErrorEstado from '../components/ErrorEstado';
import React, { useState } from 'react';
import { IconoActivar, IconoAgregar, IconoCerrar, IconoCheck, IconoEditar, IconoError, IconoFlechaAbajo, IconoUbicacion } from '../components/Iconos';
import { useGestionEmpresas } from '../hooks/useEmpresas';
import ZonaMapPicker from '../components/ZonaMapPicker';
import ImagenUploader from '../components/ImagenUploader';
import { aplicarCambioImagen } from '../lib/imagenesApi';
import SearchableSelect from '../components/SearchableSelect';
import colombiaData from '../data/colombia-divipola.json';
import { SkeletonLinea } from '../components/Skeleton';
import { useConteoRecordado } from '../hooks/useConteoRecordado';
import ConfirmDialog from '../components/ConfirmDialog';
import FormModal from '../components/FormModal';

const DEPARTAMENTOS = colombiaData.departamentos.map(d => d.nombre);
const MUNICIPIOS_POR_DEPARTAMENTO = Object.fromEntries(
  colombiaData.departamentos.map(d => [d.nombre, d.municipios])
);

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

// Coordenadas iniciales de referencia: si la empresa ya trae coordenadas se
// usan directo; si solo trae polígonos en `zonas`, se calcula su centroide.
function coordenadasInicialesZona(initial) {
  if (initial.coordenadas?.lat != null && initial.coordenadas?.lng != null) {
    return { lat: initial.coordenadas.lat, lng: initial.coordenadas.lng };
  }
  const puntos = (initial.zonas ?? []).flatMap(z => z.puntos ?? []);
  if (puntos.length === 0) return { lat: '', lng: '' };
  const lat = Number((puntos.reduce((s, p) => s + Number(p.lat), 0) / puntos.length).toFixed(6));
  const lng = Number((puntos.reduce((s, p) => s + Number(p.lng), 0) / puntos.length).toFixed(6));
  return { lat, lng };
}

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
  const [showOptional, setShowOptional] = useState(() => Boolean(materialInicialEsOtro));
  const [tipoMaterial, setTipoMaterial] = useState(materialInicialEsOtro ? 'otro' : 'Galvanizado');
  const [tipoMaterialOtro, setTipoMaterialOtro] = useState(materialInicialEsOtro ? initial.tipo_material : '');

  // Coordenadas del centro de referencia de la zona: los campos manuales se
  // muestran desde el inicio (sin geolocalización automática al abrir) y solo
  // se solicita permiso al navegador cuando se pulsa "Usar ubicación actual".
  const [coordsIniciales] = useState(() => coordenadasInicialesZona(initial));
  const [latitud, setLatitud] = useState(coordsIniciales.lat);
  const [longitud, setLongitud] = useState(coordsIniciales.lng);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [logo, setLogo] = useState({ archivo: null, quitar: false });

  const usarUbicacionActual = () => {
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no permite obtener la ubicación.');
      return;
    }
    setGeoError(null);
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitud(parseFloat(pos.coords.latitude.toFixed(6)));
        setLongitud(parseFloat(pos.coords.longitude.toFixed(6)));
        setGeoLoading(false);
      },
      () => {
        setGeoError('No se pudo obtener la ubicación actual.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const [zonas, setZonas] = useState(initial.zonas ?? []);
  // Coordenadas válidas: numéricas y dentro de rango (lat ±90, lng ±180).
  const hayCoordenadas = latitud !== '' && longitud !== ''
    && Math.abs(Number(latitud)) <= 90 && Math.abs(Number(longitud)) <= 180;
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
      // La sección opcional puede estar colapsada: se expande y se enfoca el
      // campo para que el error sea visible y accionable.
      setShowOptional(true);
      setValidationError('Especifica el tipo de material.');
      setTimeout(() => document.getElementById('zona-tipo-material-otro')?.focus(), 0);
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
    }, logo);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <label htmlFor="zona-nombre" style={labelStyle}>
          Nombre de la zona *
        </label>
        <input
          id="zona-nombre" name="nombre" autoComplete="off"
          required value={nombre} onChange={e => setNombre(e.target.value)}
          placeholder="ej: Zona Industrial Ejemplo" style={inputStyle}
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

      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <ImagenUploader
          id="zona-logo" etiqueta="Logo (opcional)" forma="logo"
          url={initial.logo_url} valor={logo} onChange={setLogo} disabled={saving}
          ayuda="Se muestra en la carpeta de la galería. JPEG, PNG o WebP, máximo 5 MB."
        />
      </div>

      {/* ── Información opcional colapsable ── */}
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <button
          type="button"
          onClick={() => setShowOptional(v => !v)}
          aria-expanded={showOptional}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '9px 12px', borderRadius: 8,
            background: 'var(--bg-inset)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconoFlechaAbajo size={14} style={{ transform: showOptional ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-fast) var(--ease-out)' }} />
            <span>Información adicional (opcional)</span>
          </span>
          <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)' }}>
            {showOptional ? 'Ocultar' : 'Tipo de material'}
          </span>
        </button>

        {showOptional && (
          <div style={{
            marginTop: 8, padding: '12px 14px', borderRadius: 8,
            background: 'var(--bg-page)', border: '1px solid var(--border)',
          }}>
            <div style={{ marginBottom: tipoMaterial === 'otro' ? 'var(--space-2)' : 0 }}>
              <label htmlFor="zona-tipo-material" style={labelStyle}>
                Tipo de material (opcional)
              </label>
              <select
                id="zona-tipo-material" name="tipo_material" style={inputStyle}
                value={tipoMaterial} onChange={e => setTipoMaterial(e.target.value)}
              >
                <option value="Galvanizado">Galvanizado (predeterminado)</option>
                <option value="otro">Otro (especificar)</option>
              </select>
            </div>
            {tipoMaterial === 'otro' && (
              <div style={{ marginTop: 'var(--space-2-5)' }}>
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
          </div>
        )}
      </div>

      {/* Ubicación de referencia -- ingreso manual visible desde el inicio +
          botón explícito para usar la ubicación actual. */}
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: 6 }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Ubicación de referencia</span>
          <button
            type="button"
            onClick={usarUbicacionActual}
            disabled={geoLoading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', padding: 0,
              fontSize: 'var(--text-2xs)', color: 'var(--accent-amber)',
              cursor: geoLoading ? 'wait' : 'pointer',
              fontFamily: 'var(--font-data)', fontWeight: 600, letterSpacing: '0.04em',
              textDecoration: 'underline', textUnderlineOffset: 3,
              opacity: geoLoading ? 0.65 : 1,
            }}
          >
            <IconoUbicacion size={12} aria-hidden="true" />
            {geoLoading ? 'Detectando ubicación…' : 'Usar ubicación actual'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label htmlFor="zona-latitud" style={labelStyle}>Latitud</label>
            <input
              id="zona-latitud" name="latitud" type="number" inputMode="decimal" step="any"
              value={latitud} onChange={e => setLatitud(e.target.value === '' ? '' : Number(e.target.value))}
              style={inputStyle} placeholder="ej: 4.710989"
            />
          </div>
          <div>
            <label htmlFor="zona-longitud" style={labelStyle}>Longitud</label>
            <input
              id="zona-longitud" name="longitud" type="number" inputMode="decimal" step="any"
              value={longitud} onChange={e => setLongitud(e.target.value === '' ? '' : Number(e.target.value))}
              style={inputStyle} placeholder="ej: -74.072092"
            />
          </div>
        </div>

        {geoError && (
          <div style={{ marginTop: 'var(--space-2)', padding: '8px 12px', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, fontSize: 'var(--text-2xs)', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconoError size={12} /> {geoError}
          </div>
        )}
      </div>

      {/* Zona: obligatoria. El mapa se mantiene sincronizado con la ubicación
          de referencia de arriba. */}
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <span style={{ ...labelStyle, display: 'block' }}>Zona en el mapa *</span>
        <ZonaMapPicker
          zonas={zonas}
          onChange={setZonas}
          puntoReferencia={hayCoordenadas ? { lat: Number(latitud), lng: Number(longitud) } : null}
          onReferenciaChange={({ lat, lng }) => {
            setLatitud(lat);
            setLongitud(lng);
          }}
        />
      </div>

      {(validationError || error) && (
        <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3-5)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconoError size={13} /> {validationError || error}
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
  const { empresas, loading, error, mutating, mutError, crearEmpresa, editarEmpresa, refetch } = useGestionEmpresas();
  const filasSkeleton = useConteoRecordado('zonas:lista', empresas, loading);

  const [showCreate, setShowCreate] = useState(false);
  const [editZona, setEditZona] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null); // { zona, activarDespues }
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);

  // El logo se aplica después de guardar la zona. Si falla, la zona ya quedó
  // guardada: se avisa en el aviso final en vez de dejar el formulario abierto.
  const guardarLogo = async (idEmpresa, logo) => {
    if (!logo.archivo && !logo.quitar) return null;
    try {
      await aplicarCambioImagen(`/empresas/${idEmpresa}/logo`, 'logo_key', logo);
      refetch();
      return null;
    } catch (err) {
      return err.message;
    }
  };

  const handleCrear = async (payload, logo) => {
    setFormError(null);
    try {
      const creada = await crearEmpresa(payload);
      const falloLogo = await guardarLogo(creada.id_empresa, logo);
      setShowCreate(false);
      setToast(falloLogo ? `Zona creada, pero no se pudo guardar el logo: ${falloLogo}` : 'Zona creada correctamente.');
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleEditar = async (payload, logo) => {
    setFormError(null);
    try {
      await editarEmpresa(editZona.id_empresa, payload);
      const falloLogo = await guardarLogo(editZona.id_empresa, logo);
      setEditZona(null);
      setToast(falloLogo ? `Zona actualizada, pero no se pudo guardar el logo: ${falloLogo}` : 'Zona actualizada correctamente.');
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

      <div style={{ padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2-5)' }}>
            <span style={{ background: 'var(--accent-amber)', width: 3, height: 20, borderRadius: 2, display: 'inline-block' }} />
            <IconoUbicacion size={16} color="var(--text-primary)" />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-sm)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              Zonas
            </span>
          </div>
          <button onClick={() => { setShowCreate(true); setFormError(null); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 14px', background: 'var(--accent-amber)', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'white',
          }}>
            <IconoAgregar size={14} /> Nueva zona
          </button>
        </div>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: -12, marginBottom: 20, fontFamily: 'var(--font-ui)' }}>
          Una zona es el área geográfica donde se ubican los puntos de monitoreo. Dibújala en el mapa; los puntos se crean adentro, en la sección Puntos. En la gestión de usuarios, la zona aparece como su afiliación.
        </p>

        {mutError && (
          <div style={{ padding: '8px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, color: '#dc2626', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3-5)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconoError size={13} /> {mutError}
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
                  ? Array.from({ length: filasSkeleton }).map((_, i) => (
                      <tr key={i} aria-busy="true" style={{ borderBottom: '1px solid var(--border)' }}>
                        {[70, 60, 40, 40, 30, 40].map((w, j) => (
                          <td key={j} style={{ padding: '10px 14px' }}>
                            <SkeletonLinea width={`${w}%`} />
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
                            {e.activa === false ? <IconoCerrar size={11} /> : <IconoCheck size={11} />}
                            {e.activa === false ? 'Inactiva' : 'Activa'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => { setEditZona(e); setFormError(null); }}
                              title="Editar"
                              aria-label="Editar"
                                className="btn-accion btn-accion--plain"
                            >
                              <IconoEditar size={13} />
                            </button>
                            <button
                              onClick={() => setConfirmToggle({ zona: e, activarDespues: e.activa === false })}
                              title={e.activa === false ? 'Activar' : 'Desactivar'}
                              aria-label={e.activa === false ? 'Activar' : 'Desactivar'}
                              className={e.activa === false ? 'btn-accion btn-accion--ok' : 'btn-accion'}
                            >
                              <IconoActivar size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                }
                {!loading && empresas.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
                    {error
                      ? <ErrorEstado compacto titulo="No se pudieron cargar las zonas." detalle={error} onRetry={refetch} />
                      : 'No hay zonas registradas'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreate && (
        <FormModal title="Nueva zona" onClose={() => setShowCreate(false)} maxWidth={620} saving={mutating}>
          <ZonaForm onSubmit={handleCrear} saving={mutating} error={formError} />
        </FormModal>
      )}

      {editZona && (
        <FormModal title="Editar zona" onClose={() => setEditZona(null)} maxWidth={620} saving={mutating}>
          <ZonaForm initial={editZona} isEdit onSubmit={handleEditar} saving={mutating} error={formError} />
        </FormModal>
      )}

      {confirmToggle && (
        <ConfirmDialog
          message={
            confirmToggle.activarDespues
              ? `¿Activar la zona ${confirmToggle.zona.nombre}?`
              : `¿Desactivar la zona ${confirmToggle.zona.nombre}?`
          }
          confirmLabel={confirmToggle.activarDespues ? 'Activar' : 'Desactivar'}
          tone={confirmToggle.activarDespues ? 'default' : 'warning'}
          onConfirm={handleToggle}
          onCancel={() => setConfirmToggle(null)}
          loading={mutating}
        />
      )}

      {toast && <Aviso message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
