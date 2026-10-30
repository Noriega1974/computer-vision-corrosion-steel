import { AvisoEnLinea } from '../components/Aviso';
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconoAgregarImagen, IconoCamara, IconoCheck, IconoUbicacion, IconoVolver } from '../components/Iconos';
import exifr from 'exifr';
import { useBloques } from '../hooks/useBloques';
import { useUploadMedicion, MAX_FOTO_MB } from '../hooks/useUploadMedicion';
import { useUploadLote, clasificarArchivos, LOTE_MAX } from '../hooks/useUploadLote';
import UploadCola from '../components/UploadCola';
import { nivelColor, nivelBg, nivelLabel } from '../lib/statusUtils';
import SearchableSelect from '../components/SearchableSelect';
import NivelIcon from '../components/NivelIcon';
import NivelInfo from '../components/NivelInfo';
import { formatoPct, etiquetaBase } from '../lib/textUtils';

// ─── Componente: resultado del análisis ─────────────────────────────────────
const NOMBRE_MAX = 80;

function ResultadoAnalisis({ result, onReset, onDashboard }) {
  const nivel = result.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const bloque = result.bloque_info ?? {};
  const areaPct = result.area_corroida_pct ?? 0;

  return (
    <div className="fade-in-up" style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Tarjeta única de resultado */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '24px 22px', marginBottom: 20,
        boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {result.nombre && (
          <div style={{
            fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 20, lineHeight: 1.2,
            color: 'var(--text-primary)', letterSpacing: '-0.01em', overflowWrap: 'anywhere',
          }}>
            {result.nombre}
          </div>
        )}
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)', marginTop: result.nombre ? -10 : 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconoUbicacion size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>{bloque.nombre ?? '—'}{bloque.ciudad ? ` · ${bloque.ciudad}` : ''}</span>
        </div>

        <div style={{
          background: nivelBg(nivel), border: `1px solid ${color}45`, borderRadius: 12,
          padding: '22px 18px', textAlign: 'center',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-2)' }}>
            <NivelIcon nivel={nivel} size={44} color={color} />
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 20, color, letterSpacing: '-0.01em' }}>
            Tipo de corrosión: <span style={{ fontWeight: 800, fontSize: 28 }}>{nivelLabel(nivel)}</span>{' '}
            <NivelInfo nivel={nivel} color={color} />
          </div>
          {/* Fuente de interfaz con cifras tabulares: la monoespaciada dejaba
              un hueco visible alrededor de la coma decimal. */}
          <div style={{ fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 52, color, letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: 10 }}>
            {formatoPct(areaPct)}
          </div>
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.08em', fontWeight: 600 }}>
            ÁREA CORROÍDA {etiquetaBase(result).toUpperCase()}
          </div>
        </div>

        {/* Imagen analizada */}
        {result.url_imagen && (
          <img
            src={result.url_imagen}
            alt="Resultado"
            style={{ width: '100%', borderRadius: 10, border: `2px solid ${color}40`, maxHeight: 280, objectFit: 'cover' }}
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2-5)' }}>
        <button onClick={onReset} style={btnSecondaryStyle}>
          Subir otra imagen
        </button>
        <button onClick={onDashboard} style={btnPrimaryStyle}>
          Ver en galería
        </button>
      </div>
    </div>
  );
}

// ─── Estilos reutilizables ────────────────────────────────────────────────────
const btnPrimaryStyle = {
  flex: 1, padding: 'var(--space-3)', background: 'var(--accent-amber)', border: 'none',
  borderRadius: 8, color: 'white', fontFamily: 'var(--font-ui)',
  fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
const btnSecondaryStyle = {
  flex: 1, padding: 'var(--space-3)', background: 'var(--bg-inset)',
  border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)',
  fontWeight: 500, fontSize: 14, cursor: 'pointer',
};
const labelStyle = {
  display: 'block', fontFamily: 'var(--font-data)', fontSize: 'var(--text-2xs)',
  fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em',
  textTransform: 'uppercase', marginBottom: 6,
};
const inputStyle = {
  width: '100%', padding: '10px 14px', background: 'var(--bg-inset)',
  border: '1px solid var(--border)', borderRadius: 7,
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
  fontSize: 14,
};

// ─── Página principal ─────────────────────────────────────────────────────────
export default function UploadPage() {
  const navigate = useNavigate();
  const { upload, loading: uploading, fase, progreso, error: uploadError, result, reset } = useUploadMedicion();
  const [errorLocal, setErrorLocal] = useState(null);  // validación previa a la subida

  // Lista de puntos (bloques) para elegir dónde se tomó la medición -- ya
  // scopeada por el backend a la empresa de quien sube (admin/tecnico).
  // super_admin ve todos los bloques sin filtrar.
  const { bloques } = useBloques(true);
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState(null);

  // Estado del formulario
  const [imagen, setImagen] = useState(null);         // File object
  const [preview, setPreview] = useState(null);       // data URL
  const [exifGps, setExifGps] = useState(null);       // {latitude, longitude}
  const [dragOver, setDragOver] = useState(false);

  // Multi-photo mode (2+ files): sequential queue handled by useUploadLote.
  const lote = useUploadLote();
  const modoLote = lote.items.length > 0;
  const [avisoArchivos, setAvisoArchivos] = useState(null);  // {rechazados: string[], excedidos: number}

  // Detalles opcionales
  const [nombre, setNombre] = useState('');           // nombre de la foto (para buscarla luego)
  const [notas, setNotas] = useState('');
  const [esMedicionPasada, setEsMedicionPasada] = useState(false);
  const [fechaMedicion, setFechaMedicion] = useState(() => new Date().toISOString().slice(0, 10));

  // El combobox de puntos trabaja con strings (mismo componente que usan
  // BloquesPage/GaleriaPage para búsquedas, no un <select> suelto): arma una
  // etiqueta legible por punto y un mapa para volver del string elegido al
  // objeto bloque real. Muestra solo el nombre -- nunca el id_bloque.
  const bloqueLabel = b => b.nombre;
  const bloqueOpciones = bloques.map(bloqueLabel);
  const bloquePorLabel = Object.fromEntries(bloques.map(b => [bloqueLabel(b), b]));

  // Procesar archivo de imagen
  const procesarImagen = useCallback(async (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setErrorLocal('Solo se aceptan imágenes JPG o PNG.');
      return;
    }
    setErrorLocal(null);
    setImagen(file);
    // El nombre arranca con el del archivo (sin extensión); el usuario lo edita.
    setNombre(file.name.replace(/\.[^.]+$/, '').slice(0, NOMBRE_MAX));
    // Preview
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(file);
    // EXIF GPS -- metadata informativa de la foto (dónde se tomó exactamente),
    // independiente de la ubicación fija del punto elegido abajo.
    // Clear any GPS from a previous photo first so a new photo without GPS
    // never inherits stale coordinates.
    setExifGps(null);
    try {
      const gps = await exifr.gps(file);
      if (gps?.latitude && gps?.longitude) setExifGps(gps);
    } catch { /* sin EXIF */ }
  }, []);

  // Entry point for the file input and the drop zone. Each file is validated
  // individually; exactly one valid file keeps the single-photo flow, 2+ go to
  // the batch queue (capped at LOTE_MAX).
  const procesarArchivos = useCallback((files) => {
    const lista = Array.from(files ?? []);
    if (lista.length === 0) return;
    const { validos, rechazados } = clasificarArchivos(lista);
    setErrorLocal(null);
    let excedidos = 0;
    if (modoLote) {
      excedidos = lote.agregar(validos);
    } else if (validos.length === 1) {
      procesarImagen(validos[0]);
    } else if (validos.length >= 2) {
      excedidos = lote.agregar(validos);
    }
    setAvisoArchivos(rechazados.length || excedidos ? { rechazados, excedidos } : null);
  }, [modoLote, lote, procesarImagen]);

  // Drag & drop
  const handleDrop = useCallback(e => {
    e.preventDefault();
    setDragOver(false);
    procesarArchivos(e.dataTransfer.files);
  }, [procesarArchivos]);

  const handleFileInput = useCallback(e => {
    procesarArchivos(e.target.files);
    e.target.value = '';
  }, [procesarArchivos]);

  // Removing a row until a single photo remains hands it back to the single flow.
  const quitarDeLote = useCallback((id) => {
    const resto = lote.items.filter(x => x.id !== id);
    if (resto.length === 1) {
      const unica = resto[0];
      lote.limpiar();
      procesarImagen(unica.file);
      setNombre(unica.nombre);
    } else {
      lote.quitar(id);
    }
  }, [lote, procesarImagen]);

  const faltaAlgo = modoLote ? !bloqueSeleccionado : (!imagen || !bloqueSeleccionado);

  // Body of one /medicion request in batch mode: shared fields plus the row's
  // own name and EXIF GPS.
  const construirBodyLote = (it) => ({
    fuente: 'movil',
    bloque_id: bloqueSeleccionado.id_bloque,
    ...(it.nombre.trim() && { nombre: it.nombre.trim() }),
    ...(notas && { notas }),
    ...(it.gps && { latitud_real: it.gps.latitude, longitud_real: it.gps.longitude }),
    ...(esMedicionPasada && { timestamp_medicion: fechaMedicion }),
  });

  const irAGaleria = () => navigate(
    bloqueSeleccionado?.empresa_id && bloqueSeleccionado?.id_bloque
      ? `/galeria/zona/${bloqueSeleccionado.empresa_id}/${bloqueSeleccionado.id_bloque}`
      : '/galeria'
  );

  // Enviar formulario
  //
  // bloque_id viaja en la RAÍZ del body y es obligatorio -- el punto ya
  // existe de antes (se crea/edita desde la página Puntos, no acá) y trae
  // sus propias coordenadas fijas, así que este formulario ya no arma
  // `ubicacion` ni pide lat/lng.
  async function handleSubmit(e) {
    e.preventDefault();
    if (modoLote) {
      if (!bloqueSeleccionado || lote.running) return;
      setErrorLocal(null);
      lote.iniciar(construirBodyLote);
      return;
    }
    // Defensive guard: the submit button is disabled until both exist.
    if (!imagen || !bloqueSeleccionado) return;

    // El tiempo de análisis cuenta desde este clic, antes de subir la foto.
    const inicio = performance.now();
    if (imagen.size > MAX_FOTO_MB * 1024 * 1024) {
      const mb = (imagen.size / (1024 * 1024)).toFixed(1).replace('.', ',');
      setErrorLocal(`La foto pesa ${mb} MB; el máximo es ${MAX_FOTO_MB} MB.`);
      return;
    }
    setErrorLocal(null);

    // La foto NO viaja en este body: el hook la sube a S3 y agrega `imagen_key`.
    const body = {
      fuente: 'movil',
      bloque_id: bloqueSeleccionado.id_bloque,
      ...(nombre.trim() && { nombre: nombre.trim() }),
      ...(notas && { notas }),
      ...(exifGps && {
        latitud_real: exifGps.latitude,
        longitud_real: exifGps.longitude,
      }),
      ...(esMedicionPasada && { timestamp_medicion: fechaMedicion }),
    };

    try {
      await upload(imagen, body, inicio);
    } catch { /* error ya en state */ }
  }

  // Si hay resultado, mostrar pantalla de resultado
  if (result) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: '32px 20px' }}>
        <ResultadoAnalisis
          result={result}
          onReset={() => { reset(); setImagen(null); setNombre(''); setPreview(null); setExifGps(null); }}
          onDashboard={irAGaleria}
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: '24px 20px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>

        {/* Header de página */}
        <div style={{ marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            aria-label="Volver al panel"
            style={{ display: 'flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
          ><IconoVolver size={20} /></button>
          <div>
            <h2 style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', margin: 0 }}>
              Nueva medición
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-ui)' }}>
              Sube una foto y el modelo de IA detectará el nivel de corrosión
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>

          {/* ─── SECCIÓN 1: Imagen ─── */}
          <Section title={modoLote ? '1. Imágenes' : '1. Imagen'} accent="var(--accent-amber)">
            {modoLote ? (
              <UploadCola
                lote={lote}
                onQuitar={quitarDeLote}
                onReintentar={(id) => lote.reintentar(id, construirBodyLote)}
                onAgregar={procesarArchivos}
                onVerGaleria={irAGaleria}
                onSubirMas={() => { lote.limpiar(); setAvisoArchivos(null); setErrorLocal(null); }}
              />
            ) : !preview ? (
              // Era un <div onClick>: se podia usar con el mouse pero no con el
              // teclado, asi que subir una foto era imposible navegando con Tab.
              // role + tabIndex + onKeyDown lo devuelven al orden de foco sin
              // perder el arrastrar-y-soltar, que un <button> real complicaria.
              <div
                role="button"
                tabIndex={0}
                aria-label={`Seleccionar imágenes: JPG o PNG, máximo ${MAX_FOTO_MB} MB cada una, hasta ${LOTE_MAX} por tanda`}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--accent-amber)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '36px 20px', textAlign: 'center',
                  background: dragOver ? 'var(--bg-card-hover)' : 'var(--bg-inset)',
                  cursor: 'pointer', transition: 'border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)',
                }}
                onClick={() => document.getElementById('file-input').click()}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    document.getElementById('file-input').click();
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)', marginBottom: 'var(--space-2-5)' }}>
                  <IconoAgregarImagen size={36} aria-hidden="true" />
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
                  Arrastra una o varias imágenes aquí o haz clic para seleccionar
                </div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>JPG o PNG · Máximo 50 MB cada una · Hasta {LOTE_MAX} por tanda</div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
                  Para un mejor resultado, encuadra la placa completa, con poco fondo y de frente.
                </div>
                <input
                  id="file-input" name="imagen" type="file" multiple
                  accept="image/jpeg,image/png" tabIndex={-1}
                  onChange={handleFileInput} style={{ display: 'none' }}
                />
              </div>
            ) : (
              <div>
                <img src={preview} alt="Preview" style={{
                  width: '100%', maxHeight: 280, objectFit: 'cover',
                  borderRadius: 8, border: '1px solid var(--border)', marginBottom: 'var(--space-2-5)',
                }} />
                <div style={{ marginBottom: 'var(--space-2-5)' }}>
                  <label htmlFor="upload-nombre" style={labelStyle}>Nombre de la foto (opcional)</label>
                  <input
                    id="upload-nombre" name="nombre-foto" type="text"
                    value={nombre} onChange={e => setNombre(e.target.value)}
                    maxLength={NOMBRE_MAX} autoComplete="off"
                    placeholder="Ej.: Placa 12, lado norte"
                    style={inputStyle}
                  />
                  <div style={{ marginTop: 4, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    Con este nombre podrás encontrar la foto en la galería.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    onClick={() => { setImagen(null); setNombre(''); setPreview(null); setExifGps(null); }}
                    style={{ ...btnSecondaryStyle, flex: 'none', padding: '8px 16px', fontSize: 'var(--text-xs)' }}
                  >
                    Cambiar imagen
                  </button>
                  {exifGps && (
                    <div role="status" style={{
                      flex: 1, padding: '8px 12px', background: 'rgba(22,163,74,0.08)',
                      border: '1px solid rgba(22,163,74,0.3)', borderRadius: 7,
                      fontSize: 'var(--text-2xs)', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <IconoUbicacion size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                      <span>GPS detectado en la foto: {exifGps.latitude.toFixed(5)}, {exifGps.longitude.toFixed(5)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {avisoArchivos && (
              <AvisoEnLinea tone="error" style={{ padding: '10px 14px', marginTop: 'var(--space-3)' }}>
                <div>
                  {avisoArchivos.rechazados.length > 0 && (
                    <div>
                      No se subirán estos archivos porque no son JPG ni PNG: {avisoArchivos.rechazados.join(', ')}.
                    </div>
                  )}
                  {avisoArchivos.excedidos > 0 && (
                    <div>
                      El máximo es {LOTE_MAX} imágenes por tanda; se omitieron {avisoArchivos.excedidos}.
                    </div>
                  )}
                </div>
              </AvisoEnLinea>
            )}
          </Section>

          {/* Shared fields: locked once the batch starts so retries use the same values. */}
          <fieldset disabled={lote.iniciado} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>

          {/* ─── SECCIÓN 2: Punto de medición ─── */}
          <Section title="2. Punto de medición" accent="var(--accent-blue)">
            <label htmlFor="upload-buscar-punto" style={labelStyle}>Buscar punto</label>
            <SearchableSelect
              id="upload-buscar-punto"
              options={bloqueOpciones}
              value={bloqueSeleccionado ? bloqueLabel(bloqueSeleccionado) : ''}
              onChange={label => setBloqueSeleccionado(bloquePorLabel[label] ?? null)}
              placeholder="Nombre del punto"
              emptyMessage="Sin puntos que coincidan"
              disabled={bloques.length === 0 || lote.iniciado}
            />
            {bloqueSeleccionado && (
              <div role="status" style={{
                marginTop: 'var(--space-2-5)', padding: '10px 14px',
                background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)',
                borderRadius: 7, fontSize: 'var(--text-xs)', color: 'var(--accent-green)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <IconoCheck size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span>Punto seleccionado: <strong>{bloqueSeleccionado.nombre}</strong>{bloqueSeleccionado.ciudad ? ` — ${bloqueSeleccionado.ciudad}` : ''}</span>
              </div>
            )}
            {bloques.length === 0 && (
              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                No hay puntos registrados aún. Crea uno primero desde la sección "Puntos".
              </div>
            )}
          </Section>

          {/* ─── SECCIÓN 3: Fecha de la medición ─── */}
          <Section title="3. Fecha de la medición" accent="var(--accent-blue)">
            <p style={{ margin: '0 0 14px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
              ¿Es una medición tomada en el pasado?
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2-5)', marginBottom: esMedicionPasada ? 16 : 0 }}>
              {[
                { val: false, label: 'No' },
                { val: true,  label: 'Sí' },
              ].map(({ val, label }) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setEsMedicionPasada(val)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 8,
                    border: `1px solid ${esMedicionPasada === val ? 'var(--accent-amber)' : 'var(--border)'}`,
                    background: esMedicionPasada === val ? 'rgba(156,54,16,0.1)' : 'var(--bg-inset)',
                    color: esMedicionPasada === val ? 'var(--accent-amber)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer',
                    transition: 'color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {esMedicionPasada && (
              <div>
                <label htmlFor="upload-fecha" style={labelStyle}>Fecha de la medición</label>
                <input
                  id="upload-fecha"
                  name="fecha-medicion"
                  type="date"
                  value={fechaMedicion}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setFechaMedicion(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}
          </Section>

          {/* ─── SECCIÓN 4: Detalles opcionales ─── */}
          <Section title="4. Detalles (opcional)" accent="var(--accent-green)">
            <div>
              <label htmlFor="upload-notas" style={labelStyle}>Notas</label>
              <textarea
                id="upload-notas" name="notas"
                value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Observaciones adicionales sobre esta medición…"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            {!modoLote && exifGps && (
              <div style={{
                marginTop: 'var(--space-2-5)', padding: '10px 12px', fontSize: 'var(--text-2xs)',
                background: 'var(--bg-inset)', borderRadius: 7, border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}>
                Las coordenadas exactas de la foto (GPS: {exifGps.latitude.toFixed(5)}, {exifGps.longitude.toFixed(5)})
                se enviarán automáticamente como referencia.
              </div>
            )}
          </Section>
          </fieldset>

          {/* Error de upload */}
          {(errorLocal || uploadError) && (
            <AvisoEnLinea tone="error" style={{ padding: '12px 16px', marginBottom: 'var(--space-4)' }}>
              {errorLocal || uploadError}
            </AvisoEnLinea>
          )}

          {/* Botón submit (in batch mode it disappears once the batch starts) */}
          {!(modoLote && lote.iniciado) && (<>
          <button
            type="submit"
            disabled={faltaAlgo || uploading}
            aria-describedby={faltaAlgo && !uploading ? 'upload-falta' : undefined}
            style={{
              ...btnPrimaryStyle,
              width: '100%', opacity: faltaAlgo || uploading ? 0.7 : 1,
              cursor: faltaAlgo || uploading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2-5)',
            }}
          >
            {uploading ? (
              <>
                <div className="upload-spinner" aria-hidden="true" style={{
                  width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                Procesando…
              </>
            ) : (
              <>
                <IconoCamara size={18} aria-hidden="true" />
                {modoLote ? `Analizar ${lote.items.length} imágenes` : 'Analizar imagen'}
              </>
            )}
          </button>

          {faltaAlgo && !uploading && (
            <p id="upload-falta" style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              Falta: elegir {modoLote ? 'el punto' : !imagen && !bloqueSeleccionado ? 'la foto y el punto' : !imagen ? 'la foto' : 'el punto'}
            </p>
          )}
          </>)}

          {uploading && <PasosEspera fase={fase} progreso={progreso} />}
        </form>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .upload-spinner { animation: none !important; } }
      `}</style>
    </div>
  );
}

// ─── Indicador de dos pasos mientras se sube y analiza ───────────────────────
const SEGUNDOS_LENTO = 45;

function PasosEspera({ fase, progreso }) {
  const analizando = fase === 'analizando';
  const [segundos, setSegundos] = useState(0);

  // Elapsed seconds are measured from the start of the analysis phase and
  // tick once per second; the interval only exists while analyzing.
  useEffect(() => {
    if (!analizando) return undefined;
    const t0 = Date.now();
    setSegundos(0);
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [analizando]);

  const lineaStyle = (activo) => ({
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    color: activo ? 'var(--text-muted)' : 'var(--text-faint)',
  });
  const numStyle = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{
      marginTop: 'var(--space-3)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)',
      display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
    }}>
      {/* Visual indicator: hidden from assistive tech because it changes every second. */}
      <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div style={lineaStyle(!analizando)}>
          {analizando
            ? <IconoCheck size={14} color="var(--accent-green)" />
            : <span style={numStyle}>1.</span>}
          <span>
            Subiendo foto
            {!analizando && <> · <span style={numStyle}>{progreso} %</span></>}
          </span>
        </div>
        <div style={lineaStyle(analizando)}>
          <span style={numStyle}>2.</span>
          <span>
            Analizando con IA
            {analizando && <> · <span style={numStyle}>{segundos} s</span></>}
          </span>
        </div>
        {analizando && segundos > SEGUNDOS_LENTO && (
          <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
            Está tardando más de lo normal. Puedes seguir esperando.
          </div>
        )}
      </div>

      {/* Screen readers: announce phase changes only, never the ticking numbers. */}
      <span aria-live="polite" role="status" style={{
        position: 'absolute', width: 1, height: 1, overflow: 'hidden',
        clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
      }}>
        {analizando ? 'Foto subida. Analizando con IA.' : 'Subiendo foto.'}
      </span>
    </div>
  );
}

// ─── Tarjeta de sección del formulario ───────────────────────────────────────
function Section({ title, accent, children }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '20px', marginBottom: 'var(--space-4)',
      borderTop: `3px solid ${accent}`,
    }}>
      <div style={{
        fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase',
        marginBottom: 'var(--space-4)',
      }}>{title}</div>
      {children}
    </div>
  );
}
