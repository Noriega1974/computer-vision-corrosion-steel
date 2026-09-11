import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import exifr from 'exifr';
import { useBloques } from '../hooks/useBloques';
import { useUploadMedicion } from '../hooks/useUploadMedicion';
import { nivelColor, nivelLabel } from '../lib/statusUtils';
import SearchableSelect from '../components/SearchableSelect';

// ─── Componente: resultado del análisis ─────────────────────────────────────
function ResultadoAnalisis({ result, onReset, onDashboard }) {
  const nivel = result.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const bloque = result.bloque_info ?? {};

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', animation: 'fade-in-up 0.4s ease' }}>
      {/* Banner de resultado */}
      <div style={{
        textAlign: 'center', padding: '28px 24px 20px',
        background: `${color}10`, border: `1px solid ${color}40`,
        borderRadius: 12, marginBottom: 20,
      }}>
        <div style={{ fontSize: 40, marginBottom: 'var(--space-2)' }}>
          {nivel === 0 ? '✅' : nivel === 1 ? '⚠️' : nivel === 2 ? '🔶' : '🚨'}
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-xl)', color, marginBottom: 'var(--space-1)' }}>
          {nivelLabel(nivel)}
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Análisis completado — {bloque.nombre ?? '—'}{bloque.ciudad ? ` · ${bloque.ciudad}` : ''}
        </div>
      </div>

      {/* Imagen analizada */}
      {result.url_imagen && (
        <img
          src={result.url_imagen}
          alt="Resultado"
          style={{ width: '100%', borderRadius: 10, marginBottom: 'var(--space-4)', border: `2px solid ${color}40`, maxHeight: 280, objectFit: 'cover' }}
        />
      )}

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2-5)', marginBottom: 20 }}>
        {[
          { label: 'Área corroída', value: `${(result.area_corroida_pct ?? 0).toFixed(1)}%`, color },
          { label: 'Confianza IA', value: result.confianza_promedio ? `${(result.confianza_promedio * 100).toFixed(0)}%` : '—', color: 'var(--accent-blue)' },
          { label: 'Nivel', value: `${nivel}/3`, color },
        ].map(({ label, value, color: c }) => (
          <div key={label} style={{
            background: 'var(--bg-inset)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 14px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 'var(--text-xl)', color: c }}>{value}</div>
            <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.06em' }}>{label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Info del punto */}
      <div style={{ background: 'var(--bg-inset)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', letterSpacing: '0.08em' }}>PUNTO DE MEDICIÓN</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            ['Punto', bloque.nombre ?? '—'],
            ['Ciudad', bloque.ciudad ?? '—'],
          ].map(([l, v]) => (
            <div key={l}>
              <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)' }}>{l}: </span>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2-5)' }}>
        <button onClick={onReset} style={btnSecondaryStyle}>
          Subir otra imagen
        </button>
        <button onClick={onDashboard} style={btnPrimaryStyle}>
          Ver en galería →
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
  const { upload, loading: uploading, error: uploadError, result, reset } = useUploadMedicion();

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

  // Detalles opcionales
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
      alert('Solo se aceptan imágenes JPG o PNG.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen no puede superar 10 MB.');
      return;
    }
    setImagen(file);
    // Preview
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(file);
    // EXIF GPS -- metadata informativa de la foto (dónde se tomó exactamente),
    // independiente de la ubicación fija del punto elegido abajo.
    try {
      const gps = await exifr.gps(file);
      if (gps?.latitude && gps?.longitude) setExifGps(gps);
    } catch { /* sin EXIF */ }
  }, []);

  // Drag & drop
  const handleDrop = useCallback(e => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) procesarImagen(file);
  }, [procesarImagen]);

  const handleFileInput = useCallback(e => {
    const file = e.target.files[0];
    if (file) procesarImagen(file);
  }, [procesarImagen]);

  // Convertir imagen a base64 (sin el prefijo data:...)
  async function imagenABase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Enviar formulario
  //
  // bloque_id viaja en la RAÍZ del body y es obligatorio -- el punto ya
  // existe de antes (se crea/edita desde la página Puntos, no acá) y trae
  // sus propias coordenadas fijas, así que este formulario ya no arma
  // `ubicacion` ni pide lat/lng.
  async function handleSubmit(e) {
    e.preventDefault();
    if (!imagen) { alert('Selecciona una imagen primero.'); return; }
    if (!bloqueSeleccionado) { alert('Selecciona el punto donde se tomó la medición.'); return; }

    const imagen_base64 = await imagenABase64(imagen);

    const body = {
      imagen_base64,
      fuente: 'movil',
      bloque_id: bloqueSeleccionado.id_bloque,
      ...(notas && { notas }),
      ...(exifGps && {
        latitud_real: exifGps.latitude,
        longitud_real: exifGps.longitude,
      }),
      ...(esMedicionPasada && { timestamp_medicion: fechaMedicion }),
    };

    try {
      await upload(body);
    } catch { /* error ya en state */ }
  }

  // Si hay resultado, mostrar pantalla de resultado
  if (result) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: '32px 20px' }}>
        <ResultadoAnalisis
          result={result}
          onReset={() => { reset(); setImagen(null); setPreview(null); setExifGps(null); setBloqueSeleccionado(null); }}
          onDashboard={() => navigate('/galeria')}
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
            onClick={() => navigate('/dashboard')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, padding: 0 }}
          >←</button>
          <div>
            <h2 style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', margin: 0 }}>
              Nueva Medición
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-ui)' }}>
              Sube una foto y el modelo de IA detectará el nivel de corrosión
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>

          {/* ─── SECCIÓN 1: Imagen ─── */}
          <Section title="1. Imagen" accent="var(--accent-amber)">
            {!preview ? (
              // Era un <div onClick>: se podia usar con el mouse pero no con el
              // teclado, asi que subir una foto era imposible navegando con Tab.
              // role + tabIndex + onKeyDown lo devuelven al orden de foco sin
              // perder el arrastrar-y-soltar, que un <button> real complicaria.
              <div
                role="button"
                tabIndex={0}
                aria-label="Seleccionar imagen: JPG o PNG, máximo 10 MB"
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--accent-amber)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '36px 20px', textAlign: 'center',
                  background: dragOver ? 'var(--bg-card-hover)' : 'var(--bg-inset)',
                  cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                }}
                onClick={() => document.getElementById('file-input').click()}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    document.getElementById('file-input').click();
                  }
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 'var(--space-2-5)' }} aria-hidden="true">📸</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
                  Arrastra una imagen aquí o haz clic para seleccionar
                </div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>JPG o PNG · Máximo 10 MB</div>
                <input
                  id="file-input" name="imagen" type="file"
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
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    onClick={() => { setImagen(null); setPreview(null); setExifGps(null); }}
                    style={{ ...btnSecondaryStyle, flex: 'none', padding: '8px 16px', fontSize: 'var(--text-xs)' }}
                  >
                    Cambiar imagen
                  </button>
                  {exifGps && (
                    <div style={{
                      flex: 1, padding: '8px 12px', background: 'rgba(22,163,74,0.08)',
                      border: '1px solid rgba(22,163,74,0.3)', borderRadius: 7,
                      fontSize: 'var(--text-2xs)', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span>📍</span>
                      <span>GPS detectado en la foto: {exifGps.latitude.toFixed(5)}, {exifGps.longitude.toFixed(5)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Section>

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
              disabled={bloques.length === 0}
            />
            {bloqueSeleccionado && (
              <div style={{
                marginTop: 'var(--space-2-5)', padding: '10px 14px',
                background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)',
                borderRadius: 7, fontSize: 'var(--text-xs)', color: 'var(--accent-green)',
              }}>
                ✓ Punto seleccionado: <strong>{bloqueSeleccionado.nombre}</strong>{bloqueSeleccionado.ciudad ? ` — ${bloqueSeleccionado.ciudad}` : ''}
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
                    transition: 'color 0.13s, background-color 0.13s, border-color 0.13s',
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
            {exifGps && (
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

          {/* Error de upload */}
          {uploadError && (
            <div style={{
              padding: '12px 16px', marginBottom: 'var(--space-4)',
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
              borderLeft: '3px solid var(--accent-red)', borderRadius: '0 8px 8px 0',
              fontSize: 'var(--text-sm)', color: 'var(--accent-red)',
            }}>
              {uploadError}
            </div>
          )}

          {/* Botón submit */}
          <button
            type="submit"
            disabled={uploading || !imagen}
            style={{
              ...btnPrimaryStyle,
              width: '100%', opacity: uploading || !imagen ? 0.7 : 1,
              cursor: uploading || !imagen ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2-5)',
            }}
          >
            {uploading ? (
              <>
                <div style={{
                  width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                Analizando con IA… (puede tomar 15-30s)
              </>
            ) : (
              '🔬 Analizar imagen'
            )}
          </button>
        </form>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
