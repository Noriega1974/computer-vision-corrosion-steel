import Aviso from '../components/Aviso';
import ErrorEstado from '../components/ErrorEstado';
import React, { useState, useEffect, useMemo } from 'react';
import { IconoActivar, IconoAgregar, IconoCerrar, IconoCheck, IconoEditar, IconoEliminar, IconoEmpresa, IconoError, IconoFlechaAbajo, IconoUbicacion } from '../components/Iconos';
import { useGestionBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth } from '../auth/AuthContext';
import SearchableSelect from '../components/SearchableSelect';
import ImagenUploader from '../components/ImagenUploader';
import { aplicarCambioImagen } from '../lib/imagenesApi';
import colombiaData from '../data/colombia-divipola.json';
import { SkeletonLinea } from '../components/Skeleton';
import { useConteoRecordado } from '../hooks/useConteoRecordado';
import ConfirmDialog from '../components/ConfirmDialog';
import FormModal from '../components/FormModal';

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
    <tr aria-busy="true" style={{ borderBottom: '1px solid var(--border)' }}>
      {widths.map((w, i) => (
        <td key={i} style={{ padding: '10px 14px' }}>
          <SkeletonLinea width={`${w}%`} />
        </td>
      ))}
    </tr>
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
  const [showOptional, setShowOptional] = useState(() => Boolean(initial.tipo_estructura || initial.grosor_mm || initial.descripcion));
  const [portada, setPortada] = useState({ archivo: null, quitar: false });
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

  // Ubicación -- campos de latitud y longitud visibles desde el inicio (sin
  // geolocalización automática al abrir). Solo se solicita la ubicación al
  // navegador cuando se pulsa "Usar ubicación actual".
  const [latitud, setLatitud] = useState(initial.coordenadas?.lat ?? '');
  const [longitud, setLongitud] = useState(initial.coordenadas?.lng ?? '');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState(null);
  // Coordenadas válidas: numéricas y dentro de rango (lat ±90, lng ±180).
  const hayCoordenadas = latitud !== '' && longitud !== ''
    && Math.abs(Number(latitud)) <= 90 && Math.abs(Number(longitud)) <= 180;

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

  const [validationError, setValidationError] = useState(null);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setField = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const municipiosDisponibles = MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] ?? [];

  const handleSubmit = (e) => {
    e.preventDefault();

    if (esSuperAdmin && !form.empresa_id) {
      setValidationError('Selecciona a qué zona pertenece este punto.');
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
      setValidationError('Tu zona todavía no tiene departamento/ciudad. Pide a un superadministrador que la complete en la sección Zonas.');
      return;
    }
    if (!hayCoordenadas) {
      setValidationError('Ingresa coordenadas válidas (latitud entre -90 y 90, longitud entre -180 y 180) o usa tu ubicación actual.');
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

    onSubmit(payload, portada);
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

      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <ImagenUploader
          id="punto-portada" etiqueta="Foto del punto (opcional)" forma="foto"
          url={initial.portada_url} valor={portada} onChange={setPortada} disabled={saving}
          ayuda="Es la portada de la carpeta del punto en la galería. JPEG, PNG o WebP, máximo 5 MB."
        />
      </div>

      {esSuperAdmin ? (
        <>
          <div style={{ marginBottom: 'var(--space-3-5)' }}>
            <label htmlFor="punto-empresa" style={labelStyle}>
              Zona *
            </label>
            <select
              id="punto-empresa" name="empresa_id"
              value={form.empresa_id} onChange={set('empresa_id')}
              required style={inputStyle}
            >
              <option value="">Selecciona una zona…</option>
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
          <IconoEmpresa size={14} />
          <span>
            {perfil?.empresa_nombre ?? 'Tu zona'}
            {form.ciudad && ` · ${form.ciudad}`}{form.departamento && `, ${form.departamento}`}
          </span>
        </div>
      )}

      {/* Ubicación -- ingreso manual visible desde el inicio + botón explícito
          para usar la ubicación actual. */}
      <div style={{ marginBottom: 'var(--space-3-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: 6 }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Ubicación *</span>
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
            <label htmlFor="punto-latitud" style={labelStyle}>Latitud</label>
            <input
              id="punto-latitud" name="latitud" type="number" inputMode="decimal" step="any"
              value={latitud} onChange={e => setLatitud(e.target.value === '' ? '' : Number(e.target.value))}
              style={inputStyle} placeholder="ej: 4.710989"
            />
          </div>
          <div>
            <label htmlFor="punto-longitud" style={labelStyle}>Longitud</label>
            <input
              id="punto-longitud" name="longitud" type="number" inputMode="decimal" step="any"
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
            {showOptional ? 'Ocultar' : 'Estructura, grosor y notas'}
          </span>
        </button>

        {showOptional && (
          <div style={{
            marginTop: 8, padding: '12px 14px', borderRadius: 8,
            background: 'var(--bg-page)', border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
          }}>
            <div>
              <label htmlFor="punto-tipo-estructura" style={labelStyle}>
                Tipo de estructura (opcional)
              </label>
              <input
                id="punto-tipo-estructura" name="tipo_estructura" autoComplete="off"
                value={form.tipo_estructura} onChange={set('tipo_estructura')}
                placeholder="ej: Tubería" style={inputStyle}
              />
            </div>

            <div>
              <label htmlFor="punto-grosor" style={labelStyle}>
                Grosor del material en mm (opcional)
              </label>
              <input
                id="punto-grosor" name="grosor_mm" type="number" inputMode="decimal" step="any" min="0"
                value={form.grosor_mm} onChange={set('grosor_mm')}
                placeholder="ej: 2.5" style={inputStyle}
              />
            </div>

            <div>
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
          </div>
        )}
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

  const { bloques, loading, error, mutating, mutError, crearBloque, editarBloque, eliminarBloque, refetch } = useGestionBloques();
  const filasSkeleton = useConteoRecordado('bloques:lista', bloques, loading);
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
  const [avisoConMediciones, setAvisoConMediciones] = useState(null); // { bloque }
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);

  // La foto se aplica después de guardar el punto (la clave lleva su id). Si
  // falla, el punto ya quedó guardado: se avisa en el aviso final.
  const guardarPortada = async (idBloque, portada) => {
    if (!portada.archivo && !portada.quitar) return null;
    try {
      await aplicarCambioImagen(`/bloques/${idBloque}/portada`, 'portada_key', portada);
      refetch();
      return null;
    } catch (err) {
      return err.message;
    }
  };

  const handleCrear = async (payload, portada) => {
    setFormError(null);
    try {
      const creado = await crearBloque(payload);
      const falloFoto = await guardarPortada(creado.id_bloque, portada);
      setShowCreate(false);
      setToast(falloFoto ? `Punto creado, pero no se pudo guardar la foto: ${falloFoto}` : 'Punto creado correctamente.');
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleEditar = async (payload, portada) => {
    setFormError(null);
    try {
      await editarBloque(editBloque.id_bloque, payload);
      const falloFoto = await guardarPortada(editBloque.id_bloque, portada);
      setEditBloque(null);
      setToast(falloFoto ? `Punto actualizado, pero no se pudo guardar la foto: ${falloFoto}` : 'Punto actualizado correctamente.');
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

      <div style={{ padding: 'var(--space-5)' }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2-5)' }}>
            <span style={{ background: 'var(--accent-amber)', width: 3, height: 20, borderRadius: 2, display: 'inline-block' }} />
            <IconoUbicacion size={16} color="var(--text-primary)" />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-sm)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              Puntos
            </span>
          </div>
          <button onClick={() => { setShowCreate(true); setFormError(null); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 14px', background: 'var(--accent-amber)', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'white',
          }}>
            <IconoAgregar size={14} /> Nuevo punto
          </button>
        </div>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: -12, marginBottom: 20, fontFamily: 'var(--font-ui)' }}>
          Un punto de monitoreo pertenece a una zona y agrupa las mediciones tomadas en un mismo lugar.
        </p>

        {/* Error de mutación */}
        {mutError && (
          <div style={{ padding: '8px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, color: '#dc2626', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3-5)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconoError size={13} /> {mutError}
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
                  {esSuperAdmin && <th style={thBase}>Zona</th>}
                  <th style={thBase}>Ubicación</th>
                  <th style={thBase}>Mediciones</th>
                  <th style={thBase}>Estado</th>
                  {puedeGestionar && <th style={thBase}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: filasSkeleton }).map((_, i) => <SkeletonRow key={i} cols={colCount} />)
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
                            {b.activo === false ? <IconoCerrar size={11} /> : <IconoCheck size={11} />}
                            {b.activo === false ? 'Inactivo' : 'Activo'}
                          </span>
                        </td>
                        {puedeGestionar && (
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => { setEditBloque(b); setFormError(null); }}
                                title="Editar"
                                aria-label="Editar"
                                className="btn-accion btn-accion--plain"
                              >
                                <IconoEditar size={13} />
                              </button>
                              <button
                                onClick={() => setConfirmToggle({ bloque: b, activarDespues: b.activo === false })}
                                title={b.activo === false ? 'Activar' : 'Desactivar'}
                                aria-label={b.activo === false ? 'Activar' : 'Desactivar'}
                                className={b.activo === false ? 'btn-accion btn-accion--ok' : 'btn-accion'}
                              >
                                <IconoActivar size={13} />
                              </button>
                              <button
                                onClick={() => {
                                  // A point with measurements cannot be deleted (backend 409): explain instead of confirming.
                                  if ((b.cantidad_mediciones ?? 0) > 0) setAvisoConMediciones({ bloque: b });
                                  else setConfirmEliminar({ bloque: b });
                                }}
                                title="Eliminar"
                                aria-label="Eliminar"
                                className="btn-accion btn-accion--danger"
                              >
                                <IconoEliminar size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                }
                {!loading && bloques.length === 0 && (
                  <tr><td colSpan={colCount} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
                    {error
                      ? <ErrorEstado compacto titulo="No se pudieron cargar los puntos." detalle={error} onRetry={refetch} />
                      : 'No hay puntos registrados'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Modal: Crear punto ── */}
      {showCreate && (
        <FormModal title="Nuevo punto" onClose={() => setShowCreate(false)} maxWidth={560} saving={mutating}>
          <BloqueForm
            onSubmit={handleCrear}
            saving={mutating}
            error={formError}
            esSuperAdmin={esSuperAdmin}
            empresasDisponibles={empresas}
            perfil={perfil}
          />
        </FormModal>
      )}

      {/* ── Modal: Editar punto ── */}
      {editBloque && (
        <FormModal title={`Editar: ${editBloque.nombre}`} onClose={() => setEditBloque(null)} maxWidth={560} saving={mutating}>
          <BloqueForm
            initial={editBloque} isEdit onSubmit={handleEditar} saving={mutating} error={formError}
            esSuperAdmin={esSuperAdmin} empresasDisponibles={empresas} perfil={perfil}
          />
        </FormModal>
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
          tone={confirmToggle.activarDespues ? 'default' : 'warning'}
          onConfirm={handleToggle}
          onCancel={() => setConfirmToggle(null)}
          loading={mutating}
        />
      )}

      {/* ── Aviso: punto con mediciones no se puede eliminar ── */}
      {avisoConMediciones && (() => {
        const { bloque } = avisoConMediciones;
        const n = bloque.cantidad_mediciones ?? 0;
        const activo = bloque.activo !== false;
        return (
          <ConfirmDialog
            message={
              <>
                <strong style={{ display: 'block', marginBottom: 6 }}>
                  Este punto tiene {n} {n === 1 ? 'medición' : 'mediciones'}
                </strong>
                Para eliminarlo, primero mueve o elimina sus mediciones desde la galería. Si solo quieres dejar de usarlo, puedes desactivarlo.
              </>
            }
            cancelLabel="Cerrar"
            hideConfirm={!activo}
            confirmLabel="Desactivar punto"
            tone="warning"
            onConfirm={() => {
              setAvisoConMediciones(null);
              setConfirmToggle({ bloque, activarDespues: false });
            }}
            onCancel={() => setAvisoConMediciones(null)}
          />
        );
      })()}

      {/* ── Confirm: eliminar ── */}
      {confirmEliminar && (
        <ConfirmDialog
          message={`¿Eliminar permanentemente el punto ${confirmEliminar.bloque.nombre}? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          tone="danger"
          onConfirm={handleEliminar}
          onCancel={() => setConfirmEliminar(null)}
          loading={mutating}
        />
      )}

      {/* ── Toast de éxito ── */}
      {toast && <Aviso message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
