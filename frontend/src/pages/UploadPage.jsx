import { AvisoEnLinea } from '../components/Aviso';
import React, { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconoAgregarImagen, IconoCamara, IconoCheck, IconoEnfocar, IconoUbicacion, IconoVolver } from '../components/Iconos';
import exifr from 'exifr';
import { useBloques } from '../hooks/useBloques';
import { useUploadMedicion, MAX_FOTO_MB } from '../hooks/useUploadMedicion';
import { useUploadLote, clasificarArchivos, generarLoteId, sugerirNombreLote, LOTE_MAX, NOMBRE_MAX } from '../hooks/useUploadLote';
import UploadCola from '../components/UploadCola';
import BarraProgresoSubida from '../components/BarraProgresoSubida';
import { nivelColor, nivelColorTexto, nivelBg, nivelLabel } from '../lib/statusUtils';
import SearchableSelect from '../components/SearchableSelect';
import NivelIcon from '../components/NivelIcon';
import NivelInfo from '../components/NivelInfo';
import NotaPctAproximado from '../components/NotaPctAproximado';
import DatePicker from '../components/DatePicker';
import { formatoPct, formatoMB, etiquetaBase } from '../lib/textUtils';
import { hoyColombiaISO, esFechaISOValida, esFechaFutura } from '../lib/fechas';

// ─── Componente: resultado del análisis ─────────────────────────────────────

function ResultadoAnalisis({ result, onReset, onDashboard }) {
  const nivel = result.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const colorTexto = nivelColorTexto(nivel);
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
          <span>{bloque.nombre ?? 'Sin nombre'}{bloque.ciudad ? ` · ${bloque.ciudad}` : ''}</span>
        </div>

        <div style={{
          background: nivelBg(nivel), border: `1px solid ${color}45`, borderRadius: 12,
          padding: '22px 18px', textAlign: 'center',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-2)' }}>
            <NivelIcon nivel={nivel} size={44} color={color} />
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 20, color: colorTexto, letterSpacing: '-0.01em' }}>
            Tipo de corrosión: <span style={{ fontWeight: 800, fontSize: 28 }}>{nivelLabel(nivel)}</span>{' '}
            <NivelInfo nivel={nivel} color={color} />
          </div>
          {/* Fuente de interfaz con cifras tabulares: la monoespaciada dejaba
              un hueco visible alrededor de la coma decimal. */}
          <div style={{ fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 52, color: colorTexto, letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: 10 }}>
            {formatoPct(areaPct)}
          </div>
          <NotaPctAproximado align="center" style={{ marginTop: 6 }} />
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

  // Cola de varias fotos (gestor de subida en segundo plano). `modo` es la elección de
  // arriba: 'individual' guarda cada foto como medición propia; 'lote' las agrupa bajo un
  // nombre. Cambiar de modo conserva las fotos y solo cambia cómo se guardarán.
  const lote = useUploadLote();
  const [modo, setModo] = useState('individual');
  const [nombreLote, setNombreLote] = useState('');
  const [loteIdActivo, setLoteIdActivo] = useState(null);
  // La cola se muestra mientras tenga fotos; una sola foto individual usa el flujo de una foto.
  const modoLote = lote.iniciado || lote.items.length > 0;
  // Cola (varias fotos o carga por lotes) frente al flujo de una sola foto.
  const usaCola = modoLote || modo === 'lote';
  // Una sesión ya iniciada conserva su lote (o la falta de él).
  const agrupar = lote.iniciado ? Boolean(loteIdActivo) : modo === 'lote';
  const cambioDeModoBloqueado = lote.iniciado || uploading;
  const [avisoArchivos, setAvisoArchivos] = useState(null);  // {rechazados: string[], excedidos: number}

  // Detalles opcionales
  const [nombre, setNombre] = useState('');           // nombre de la foto (para buscarla luego)
  const [notas, setNotas] = useState('');
  const [esMedicionPasada, setEsMedicionPasada] = useState(false);
  const [fechaMedicion, setFechaMedicion] = useState(() => hoyColombiaISO());
  const fechaInvalida = esMedicionPasada && (!esFechaISOValida(fechaMedicion) || esFechaFutura(fechaMedicion));

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
  // individually; in batch mode, files go to the batch queue (capped at LOTE_MAX).
  const procesarArchivos = useCallback((files) => {
    const lista = Array.from(files ?? []);
    if (lista.length === 0) return;
    const { validos, rechazados } = clasificarArchivos(lista);
    setErrorLocal(null);
    let excedidos = 0;
    if (modoLote) {
      excedidos = lote.agregar(validos);
    } else if (validos.length === 1 && modo === 'individual') {
      procesarImagen(validos[0]);
    } else if (validos.length >= 1) {
      excedidos = lote.agregar(validos);
    }
    setAvisoArchivos(rechazados.length || excedidos ? { rechazados, excedidos } : null);
  }, [modoLote, modo, lote, procesarImagen]);

  const limpiarFotoUnica = useCallback(() => {
    setImagen(null); setNombre(''); setPreview(null); setExifGps(null);
  }, []);

  // Cambiar de modo conserva las fotos. Una foto suelta pasa a la cola al agrupar; en la
  // cola, una sola foto individual vuelve al flujo de una foto (efecto de abajo).
  const cambiarModo = useCallback((nuevo) => {
    if (cambioDeModoBloqueado || nuevo === modo) return;
    if (nuevo === 'lote' && imagen) {
      lote.agregar([imagen]);
      limpiarFotoUnica();
    }
    setModo(nuevo);
  }, [cambioDeModoBloqueado, modo, imagen, lote, limpiarFotoUnica]);

  useEffect(() => {
    if (modo !== 'individual' || lote.iniciado || lote.items.length !== 1) return;
    const archivo = lote.items[0].file;
    lote.limpiar();
    procesarImagen(archivo);
  }, [modo, lote, procesarImagen]);

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

  // Removing a row in batch mode keeps the user in batch mode.
  const quitarDeLote = useCallback((id) => {
    lote.quitar(id);
  }, [lote]);

  const reiniciarLote = useCallback(() => {
    lote.limpiar();
    setNombreLote('');
    setLoteIdActivo(null);
    setAvisoArchivos(null);
    setErrorLocal(null);
  }, [lote]);

  const faltaAlgo = (usaCola ? (!bloqueSeleccionado || lote.items.length === 0) : (!imagen || !bloqueSeleccionado)) || fechaInvalida;

  // Body of one /medicion request in batch mode: shared fields plus the row's
  // own name and EXIF GPS, and the batch folder identity (lote_id + lote_nombre).
  const construirBodyLote = (it, idLote = loteIdActivo, nombreLoteFinal = (nombreLote.trim() || sugerirNombreLote(esMedicionPasada ? fechaMedicion : hoyColombiaISO()))) => ({
    fuente: 'movil',
    bloque_id: bloqueSeleccionado.id_bloque,
    ...(idLote && { lote_id: idLote }),
    ...(nombreLoteFinal && { lote_nombre: nombreLoteFinal }),
    ...(it.nombre?.trim() && { nombre: it.nombre.trim() }),
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
    if (esMedicionPasada) {
      if (!esFechaISOValida(fechaMedicion)) {
        setErrorLocal('La fecha de la medición no es válida. Elige una fecha del calendario.');
        return;
      }
      if (esFechaFutura(fechaMedicion)) {
        setErrorLocal('La fecha de la medición no puede ser futura. Elige la fecha de hoy o una anterior.');
        return;
      }
    }
    if (usaCola) {
      if (!bloqueSeleccionado || lote.running || lote.items.length === 0) return;
      setErrorLocal(null);
      const loteId = agrupar ? (loteIdActivo || generarLoteId()) : null;
      // With the default date (upload day) the local day is captured ONCE here and sent
      // for every photo: a batch that crosses midnight must not split across two days.
      const fechaLote = esMedicionPasada ? fechaMedicion : hoyColombiaISO();
      const nombreLoteFinal = agrupar ? (nombreLote.trim() || sugerirNombreLote(fechaLote)) : null;
      setLoteIdActivo(loteId);
      if (agrupar && !nombreLote.trim()) setNombreLote(nombreLoteFinal);
      lote.iniciar({
        loteId,
        loteNombre: nombreLoteFinal,
        bloqueId: bloqueSeleccionado.id_bloque,
        bloqueNombre: bloqueSeleccionado.nombre,
        empresaId: bloqueSeleccionado.empresa_id,
        timestampMedicion: fechaLote,
        notas,
      });
      return;
    }
    // Defensive guard: the submit button is disabled until both exist.
    if (!imagen || !bloqueSeleccionado) return;

    // El tiempo de análisis cuenta desde este clic, antes de subir la foto.
    const inicio = performance.now();
    if (imagen.size > MAX_FOTO_MB * 1024 * 1024) {
      setErrorLocal(`La foto pesa ${formatoMB(imagen.size)}; el máximo es ${MAX_FOTO_MB} MB.`);
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
          onReset={() => {
            reset();
            setImagen(null);
            setNombre('');
            setPreview(null);
            setExifGps(null);
            setEsMedicionPasada(false);
            setFechaMedicion(hoyColombiaISO());
          }}
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
              Sube fotos y la IA estima la corrosión
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>

          {/* ─── SECCIÓN 1: Imagen ─── */}
          <Section title={!modoLote && preview ? '1. Foto' : '1. Imágenes'} accent="var(--accent-amber)">
            <p
              role="note"
              style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 8px',
                margin: '0 0 var(--space-3)', fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', lineHeight: 1.4,
              }}
            >
              <IconoEnfocar size={15} color="var(--accent-amber)" aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>Placa completa, de frente, con buena luz y enfocada.</span>
              <Link
                to="/que-es-pixelrust#como-se-calcula"
                style={{ color: 'var(--accent-amber)', fontWeight: 600, textUnderlineOffset: 3, whiteSpace: 'nowrap' }}
              >
                ¿Cómo se calcula?
              </Link>
            </p>

            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div
                role="radiogroup"
                aria-label="Tipo de carga"
                style={{
                  display: 'inline-flex', padding: 3, gap: 2, borderRadius: 9, maxWidth: '100%',
                  background: 'var(--bg-inset)', border: '1px solid var(--border)',
                  opacity: cambioDeModoBloqueado ? 0.6 : 1,
                }}
              >
                {[
                  { valor: 'individual', titulo: 'Muestras individuales' },
                  { valor: 'lote', titulo: 'Carga por lotes' },
                ].map((op) => {
                  const activo = modo === op.valor;
                  return (
                    <button
                      key={op.valor}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      disabled={cambioDeModoBloqueado}
                      onClick={() => cambiarModo(op.valor)}
                      style={{
                        padding: '6px 14px', borderRadius: 7, border: 'none',
                        cursor: cambioDeModoBloqueado ? 'not-allowed' : 'pointer',
                        background: activo ? 'var(--accent-amber)' : 'transparent',
                        color: activo ? 'white' : 'var(--text-secondary)',
                        fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)',
                        transition: 'background-color var(--dur-fast), color var(--dur-fast)',
                      }}
                    >
                      {op.titulo}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 6, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                {agrupar ? 'Se agrupan bajo un nombre en la galería.' : 'Cada imagen se guarda como una medición independiente.'}
              </div>
            </div>

            {!lote.iniciado && agrupar && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <label htmlFor="upload-nombre-lote" style={labelStyle}>
                  Nombre del lote
                </label>
                <input
                  id="upload-nombre-lote"
                  name="nombre-lote"
                  type="text"
                  value={nombreLote}
                  onChange={(e) => setNombreLote(e.target.value)}
                  maxLength={NOMBRE_MAX}
                  autoComplete="off"
                  placeholder={sugerirNombreLote(esMedicionPasada ? fechaMedicion : hoyColombiaISO())}
                  style={inputStyle}
                />
              </div>
            )}

            {modoLote ? (
              <>
                {lote.iniciado && <BarraProgresoSubida style={{ marginBottom: 'var(--space-3)' }} />}
                <UploadCola
                  lote={lote}
                  onQuitar={quitarDeLote}
                  onQuitarVarias={lote.quitarVarias}
                  onReintentar={(id) => lote.reintentar(id)}
                  onAgregar={procesarArchivos}
                  onVerGaleria={irAGaleria}
                  onSubirMas={reiniciarLote}
                  agrupado={agrupar}
                />
              </>
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
                  Arrastra imágenes o haz clic para elegir
                </div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>JPG o PNG · hasta {MAX_FOTO_MB} MB · hasta {LOTE_MAX.toLocaleString('es-CO')} por carga</div>
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
                  <label htmlFor="upload-nombre" style={labelStyle}>Nombre (opcional)</label>
                  <span id="upload-nombre-ayuda" style={{ display: 'none' }}>Sirve para encontrar la foto en la galería</span>
                  <input
                    id="upload-nombre" name="nombre-foto" type="text"
                    value={nombre} onChange={e => setNombre(e.target.value)}
                    maxLength={NOMBRE_MAX} autoComplete="off"
                    placeholder="Ej.: Placa 12, lado norte"
                    aria-describedby="upload-nombre-ayuda"
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    onClick={limpiarFotoUnica}
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
                      <span>GPS detectado en la foto</span>
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
                      Se omitieron por no ser JPG ni PNG: {avisoArchivos.rechazados.join(', ')}.
                    </div>
                  )}
                  {avisoArchivos.excedidos > 0 && (
                    <div>
                      Máximo {LOTE_MAX.toLocaleString('es-CO')} imágenes; se omitieron {avisoArchivos.excedidos}.
                    </div>
                  )}
                </div>
              </AvisoEnLinea>
            )}
          </Section>

          {/* Shared fields: locked once the batch starts so retries use the same values. */}
          <fieldset disabled={lote.iniciado} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>

          {/* ─── SECCIÓN 2: Punto de medición ─── */}
          <Section title="2. Punto" accent="var(--accent-blue)">
            <label htmlFor="upload-buscar-punto" style={labelStyle}>Punto de medición</label>
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
                marginTop: 'var(--space-2-5)', padding: '6px 12px',
                background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)',
                borderRadius: 7, fontSize: 'var(--text-xs)', color: 'var(--accent-green)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <IconoCheck size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span><strong>{bloqueSeleccionado.nombre}</strong>{bloqueSeleccionado.ciudad ? ` · ${bloqueSeleccionado.ciudad}` : ''}</span>
              </div>
            )}
            {bloques.length === 0 && (
              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                Aún no hay puntos. Crea uno en la sección Puntos.
              </div>
            )}
          </Section>

          {/* ─── SECCIÓN 3: Fecha de la medición ─── */}
          <Section title="3. Fecha" accent="var(--accent-blue)">
            <div
              role="group"
              aria-label="Fecha de la medición"
              style={{ display: 'inline-flex', padding: 3, gap: 2, borderRadius: 9, background: 'var(--bg-inset)', border: '1px solid var(--border)', marginBottom: esMedicionPasada ? 12 : 0 }}
            >
              {[
                { val: false, label: 'Hoy' },
                { val: true,  label: 'Otra fecha' },
              ].map(({ val, label }) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setEsMedicionPasada(val)}
                  aria-pressed={esMedicionPasada === val}
                  style={{
                    padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: esMedicionPasada === val ? 'var(--accent-amber)' : 'transparent',
                    color: esMedicionPasada === val ? 'white' : 'var(--text-secondary)',
                    fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)',
                    transition: 'color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {esMedicionPasada && (
              <div>
                <label htmlFor="upload-fecha" style={labelStyle}>Fecha</label>
                <DatePicker
                  id="upload-fecha"
                  mode="single"
                  allowModeSwitch={false}
                  value={fechaMedicion}
                  onChange={setFechaMedicion}
                  maxISO={hoyColombiaISO()}
                  clearLabel="Restablecer a hoy"
                  futureTitle="No puedes elegir una fecha futura"
                  align="left"
                />
                {fechaInvalida && (
                  <div role="alert" style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--accent-red)', fontFamily: 'var(--font-ui)' }}>
                    Elige hoy o una fecha anterior.
                  </div>
                )}
              </div>
            )}
            {modo === 'lote' && (
              <div style={{ marginTop: 8, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                Todo el lote usa esta fecha.
              </div>
            )}
          </Section>

          {/* ─── SECCIÓN 4: Detalles opcionales ─── */}
          <Section title="4. Notas (opcional)" accent="var(--accent-green)">
            <div>
              <label htmlFor="upload-notas" style={labelStyle}>Observaciones</label>
              <textarea
                id="upload-notas" name="notas"
                value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Ej.: lluvia reciente, zona soldada"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          </Section>
          </fieldset>

          {/* Error de upload */}
          {(errorLocal || uploadError) && (
            <AvisoEnLinea tone="error" style={{ padding: '12px 16px', marginBottom: 'var(--space-4)' }}>
              {errorLocal || uploadError}
            </AvisoEnLinea>
          )}

          {/* Botón submit (in batch mode it disappears once the batch starts) */}
          {!lote.iniciado && (<>
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
                {usaCola ? `Analizar ${lote.items.length.toLocaleString('es-CO')} ${lote.items.length === 1 ? 'imagen' : 'imágenes'}` : 'Analizar imagen'}
              </>
            )}
          </button>

          {faltaAlgo && !uploading && (
            <p id="upload-falta" style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              {fechaInvalida
                ? 'Falta: una fecha válida (hoy o anterior)'
                : usaCola
                  ? (!bloqueSeleccionado && lote.items.length === 0 ? 'Falta: imágenes y punto' : !bloqueSeleccionado ? 'Falta: elegir el punto de medición' : 'Falta: al menos una imagen')
                  : (!imagen && !bloqueSeleccionado ? 'Falta: foto y punto' : !imagen ? 'Falta: la foto' : 'Falta: el punto')}
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
