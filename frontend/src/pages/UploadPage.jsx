import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import exifr from 'exifr';
import { usePuntos } from '../hooks/usePuntos';
import { useUploadMedicion } from '../hooks/useUploadMedicion';
import { nivelColor, nivelLabel } from '../lib/statusUtils';

// ─── Carga Leaflet para el picker de mapa ────────────────────────────────────
function useLeaflet() {
  const [ready, setReady] = useState(!!window.L);
  useEffect(() => {
    if (window.L) { setReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);
  return ready;
}

// ─── Componente: picker de coordenadas en mapa Leaflet ───────────────────────
function MapPicker({ lat, lng, onChange }) {
  const mapRef = useRef(null);
  const instanceRef = useRef(null);
  const markerRef = useRef(null);
  const leafletReady = useLeaflet();

  useEffect(() => {
    if (!leafletReady || instanceRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, {
      center: [6.5, -74.5], zoom: 5,
      zoomControl: true, scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18,
    }).addTo(map);
    map.on('click', e => {
      const { lat, lng } = e.latlng;
      onChange(parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6)));
    });
    instanceRef.current = map;
  }, [leafletReady]);

  // Actualizar marcador cuando cambian coordenadas
  useEffect(() => {
    const L = window.L;
    if (!L || !instanceRef.current || !lat || !lng) return;
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#9C3610;border:2px solid white;box-shadow:0 0 8px #9C361080;"></div>`,
        className: '', iconSize: [14, 14], iconAnchor: [7, 7],
      }),
    }).addTo(instanceRef.current);
    instanceRef.current.setView([lat, lng], Math.max(instanceRef.current.getZoom(), 10));
  }, [lat, lng]);

  return (
    <div>
      <div ref={mapRef} style={{
        height: 220, borderRadius: 8, border: '1px solid var(--border)',
        overflow: 'hidden',
      }} />
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
        {lat && lng
          ? `📍 ${lat}, ${lng} — Haz clic para mover`
          : 'Haz clic en el mapa para marcar la ubicación'}
      </div>
    </div>
  );
}

// ─── Componente: resultado del análisis ─────────────────────────────────────
function ResultadoAnalisis({ result, onReset, onDashboard }) {
  const nivel = result.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const punto = result.punto_info ?? {};

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', animation: 'fade-in-up 0.4s ease' }}>
      {/* Banner de resultado */}
      <div style={{
        textAlign: 'center', padding: '28px 24px 20px',
        background: `${color}10`, border: `1px solid ${color}40`,
        borderRadius: 12, marginBottom: 20,
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>
          {nivel === 0 ? '✅' : nivel === 1 ? '⚠️' : nivel === 2 ? '🔶' : '🚨'}
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 22, color, marginBottom: 4 }}>
          {nivelLabel(nivel)}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Análisis completado — {punto.sede ?? result.id_punto} · {punto.ciudad ?? ''}
        </div>
      </div>

      {/* Imagen analizada */}
      {result.url_imagen && (
        <img
          src={result.url_imagen}
          alt="Resultado"
          style={{ width: '100%', borderRadius: 10, marginBottom: 16, border: `2px solid ${color}40`, maxHeight: 280, objectFit: 'cover' }}
        />
      )}

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Área corroída', value: `${(result.area_corroida_pct ?? 0).toFixed(1)}%`, color },
          { label: 'Confianza IA', value: result.confianza_promedio ? `${(result.confianza_promedio * 100).toFixed(0)}%` : '—', color: 'var(--accent-blue)' },
          { label: 'Nivel', value: `${nivel}/3`, color },
        ].map(({ label, value, color: c }) => (
          <div key={label} style={{
            background: 'var(--bg-inset)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 14px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 22, color: c }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.06em' }}>{label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Info del punto */}
      <div style={{ background: 'var(--bg-inset)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.08em' }}>PUNTO DE MEDICIÓN</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            ['Sede', punto.sede ?? '—'],
            ['Ciudad', punto.ciudad ?? '—'],
            ['ID', result.id_punto ?? '—'],
          ].map(([l, v]) => (
            <div key={l}>
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{l}: </span>
              <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
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
  flex: 1, padding: '12px', background: 'var(--accent-amber)', border: 'none',
  borderRadius: 8, color: 'white', fontFamily: 'var(--font-ui)',
  fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
const btnSecondaryStyle = {
  flex: 1, padding: '12px', background: 'var(--bg-inset)',
  border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)',
  fontWeight: 500, fontSize: 14, cursor: 'pointer',
};
const labelStyle = {
  display: 'block', fontFamily: 'var(--font-data)', fontSize: 11,
  fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em',
  textTransform: 'uppercase', marginBottom: 6,
};
const inputStyle = {
  width: '100%', padding: '10px 14px', background: 'var(--bg-inset)',
  border: '1px solid var(--border)', borderRadius: 7,
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
  fontSize: 14,
};
const selectStyle = { ...inputStyle, appearance: 'none', cursor: 'pointer' };

// ─── Página principal ─────────────────────────────────────────────────────────
export default function UploadPage() {
  const navigate = useNavigate();
  const { puntos } = usePuntos();
  const { upload, loading: uploading, error: uploadError, result, reset } = useUploadMedicion();

  // Estado del formulario
  const [imagen, setImagen] = useState(null);         // File object
  const [preview, setPreview] = useState(null);       // data URL
  const [exifGps, setExifGps] = useState(null);       // {latitude, longitude}
  const [dragOver, setDragOver] = useState(false);

  const [modo, setModo] = useState('planta_existente');

  // Modo "planta existente"
  const [puntoSeleccionado, setPuntoSeleccionado] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  // Modo "planta nueva"
  const [sede, setSede] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [tipoMaterial, setTipoMaterial] = useState('galvanizado');
  const [tipoEstructura, setTipoEstructura] = useState('tuberia');
  const [coordNuevaLat, setCoordNuevaLat] = useState(null);
  const [coordNuevaLng, setCoordNuevaLng] = useState(null);

  // Modo "coordenadas libres"
  const [descripcionLibre, setDescripcionLibre] = useState('');
  const [coordLibreLat, setCoordLibreLat] = useState(null);
  const [coordLibreLng, setCoordLibreLng] = useState(null);

  // Detalles opcionales
  const [notas, setNotas] = useState('');
  const [esMedicionPasada, setEsMedicionPasada] = useState(false);
  const [fechaMedicion, setFechaMedicion] = useState(() => new Date().toISOString().slice(0, 10));

  // Filtrado del autocomplete de puntos existentes
  const puntosFiltrados = puntos.filter(p => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (p.sede?.toLowerCase().includes(q) || p.ciudad?.toLowerCase().includes(q));
  }).slice(0, 8);

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
    // EXIF GPS
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
  async function handleSubmit(e) {
    e.preventDefault();
    if (!imagen) { alert('Selecciona una imagen primero.'); return; }

    const imagen_base64 = await imagenABase64(imagen);

    let ubicacion;
    if (modo === 'planta_existente') {
      if (!puntoSeleccionado) { alert('Selecciona una planta existente.'); return; }
      ubicacion = { modo: 'planta_existente', id_punto: puntoSeleccionado.id_punto };
    } else if (modo === 'planta_nueva') {
      if (!sede || !ciudad || !departamento) { alert('Completa los campos de la planta nueva.'); return; }
      if (!coordNuevaLat || !coordNuevaLng) { alert('Marca la ubicación en el mapa.'); return; }
      ubicacion = {
        modo: 'planta_nueva',
        sede, ciudad, departamento,
        tipo_material: tipoMaterial,
        tipo_estructura: tipoEstructura,
        coordenadas: { lat: coordNuevaLat, lng: coordNuevaLng },
      };
    } else {
      if (!coordLibreLat || !coordLibreLng) { alert('Marca la ubicación en el mapa.'); return; }
      ubicacion = {
        modo: 'coordenadas_libres',
        latitud: coordLibreLat,
        longitud: coordLibreLng,
        descripcion: descripcionLibre,
      };
    }

    const body = {
      imagen_base64,
      fuente: 'movil',
      ubicacion,
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
          onReset={() => { reset(); setImagen(null); setPreview(null); setExifGps(null); setPuntoSeleccionado(null); }}
          onDashboard={() => navigate('/galeria')}
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: '24px 20px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>

        {/* Header de página */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, padding: 0 }}
          >←</button>
          <div>
            <h2 style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', margin: 0 }}>
              Nueva Medición
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-ui)' }}>
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
                <div style={{ fontSize: 36, marginBottom: 10 }} aria-hidden="true">📸</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Arrastra una imagen aquí o haz clic para seleccionar
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>JPG o PNG · Máximo 10 MB</div>
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
                  borderRadius: 8, border: '1px solid var(--border)', marginBottom: 10,
                }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => { setImagen(null); setPreview(null); setExifGps(null); }}
                    style={{ ...btnSecondaryStyle, flex: 'none', padding: '8px 16px', fontSize: 12 }}
                  >
                    Cambiar imagen
                  </button>
                  {exifGps && (
                    <div style={{
                      flex: 1, padding: '8px 12px', background: 'rgba(22,163,74,0.08)',
                      border: '1px solid rgba(22,163,74,0.3)', borderRadius: 7,
                      fontSize: 11, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span>📍</span>
                      <span>GPS detectado en la foto: {exifGps.latitude.toFixed(5)}, {exifGps.longitude.toFixed(5)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Section>

          {/* ─── SECCIÓN 2: Ubicación ─── */}
          <Section title="2. Ubicación" accent="var(--accent-blue)">
            {/* Tabs de modo */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
              {[
                { key: 'planta_existente', label: 'Planta existente' },
                { key: 'planta_nueva', label: 'Planta nueva' },
                { key: 'coordenadas_libres', label: 'Ubicación libre' },
              ].map(({ key, label }) => (
                <button
                  key={key} type="button"
                  onClick={() => setModo(key)}
                  style={{
                    flex: 1, padding: '8px 6px', borderRadius: 7,
                    border: `1px solid ${modo === key ? 'var(--accent-amber)' : 'var(--border)'}`,
                    background: modo === key ? 'rgba(156,54,16,0.1)' : 'var(--bg-inset)',
                    color: modo === key ? 'var(--accent-amber)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Planta existente */}
            {modo === 'planta_existente' && (
              <div>
                <label htmlFor="upload-buscar-planta" style={labelStyle}>Buscar planta</label>
                <input
                  id="upload-buscar-planta" name="buscar-planta"
                  type="search" spellCheck={false}
                  placeholder="Nombre o ciudad…" value={busqueda}
                  onChange={e => { setBusqueda(e.target.value); setPuntoSeleccionado(null); }}
                  style={inputStyle}
                />
                {busqueda && puntosFiltrados.length > 0 && !puntoSeleccionado && (
                  <div style={{
                    border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 7px 7px',
                    background: 'var(--bg-card)', maxHeight: 200, overflow: 'auto',
                  }}>
                    {puntosFiltrados.map(p => (
                      <div
                        key={p.id_punto}
                        onClick={() => { setPuntoSeleccionado(p); setBusqueda(`${p.sede} · ${p.ciudad}`); }}
                        style={{
                          padding: '10px 14px', cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex', flexDirection: 'column', gap: 2,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{p.sede}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.ciudad}</span>
                      </div>
                    ))}
                  </div>
                )}
                {puntoSeleccionado && (
                  <div style={{
                    marginTop: 10, padding: '10px 14px',
                    background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)',
                    borderRadius: 7, fontSize: 12, color: 'var(--accent-green)',
                  }}>
                    ✓ Planta seleccionada: <strong>{puntoSeleccionado.sede}</strong> — {puntoSeleccionado.ciudad}
                  </div>
                )}
                {puntos.length === 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    No hay plantas registradas aún. Usa "Planta nueva" para crear la primera.
                  </div>
                )}
              </div>
            )}

            {/* Planta nueva */}
            {modo === 'planta_nueva' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label htmlFor="upload-sede" style={labelStyle}>Sede / Nombre</label>
                    <input id="upload-sede" name="sede" style={inputStyle} value={sede} onChange={e => setSede(e.target.value)} placeholder="Planta Principal" required />
                  </div>
                  <div>
                    <label htmlFor="upload-ciudad" style={labelStyle}>Ciudad</label>
                    <input id="upload-ciudad" name="ciudad" autoComplete="address-level2" style={inputStyle} value={ciudad} onChange={e => setCiudad(e.target.value)} placeholder="Barranquilla" required />
                  </div>
                  <div>
                    <label htmlFor="upload-departamento" style={labelStyle}>Departamento</label>
                    <input id="upload-departamento" name="departamento" autoComplete="address-level1" style={inputStyle} value={departamento} onChange={e => setDepartamento(e.target.value)} placeholder="Atlántico" required />
                  </div>
                  <div>
                    <label htmlFor="upload-material" style={labelStyle}>Tipo de material</label>
                    <select id="upload-material" name="tipo-material" style={selectStyle} value={tipoMaterial} onChange={e => setTipoMaterial(e.target.value)}>
                      <option value="galvanizado">Galvanizado</option>
                      <option value="A588">A588</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="upload-estructura" style={labelStyle}>Tipo de estructura</label>
                    <select id="upload-estructura" name="tipo-estructura" style={selectStyle} value={tipoEstructura} onChange={e => setTipoEstructura(e.target.value)}>
                      <option value="tuberia">Tubería</option>
                      <option value="viga">Viga</option>
                      <option value="tanque">Tanque</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                </div>
                <div>
                  {/* span y no label: MapPicker no es un control de formulario nativo. */}
                  <span style={{ ...labelStyle, display: 'block' }}>Ubicación en el mapa (haz clic para marcar)</span>
                  <MapPicker lat={coordNuevaLat} lng={coordNuevaLng} onChange={(la, ln) => { setCoordNuevaLat(la); setCoordNuevaLng(ln); }} />
                </div>
              </div>
            )}

            {/* Coordenadas libres */}
            {modo === 'coordenadas_libres' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label htmlFor="upload-descripcion-libre" style={labelStyle}>Descripción del lugar</label>
                  <input
                    id="upload-descripcion-libre" name="descripcion-libre"
                    style={inputStyle} value={descripcionLibre}
                    onChange={e => setDescripcionLibre(e.target.value)}
                    placeholder="Esquina norte del taller, columna #3…"
                  />
                </div>
                <div>
                  <span style={{ ...labelStyle, display: 'block' }}>Ubicación en el mapa (haz clic para marcar)</span>
                  <MapPicker lat={coordLibreLat} lng={coordLibreLng} onChange={(la, ln) => { setCoordLibreLat(la); setCoordLibreLng(ln); }} />
                </div>
              </div>
            )}
          </Section>

          {/* ─── SECCIÓN 3: Fecha de la medición ─── */}
          <Section title="3. Fecha de la medición" accent="var(--accent-blue)">
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
              ¿Es una medición tomada en el pasado?
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: esMedicionPasada ? 16 : 0 }}>
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
                    fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
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
                marginTop: 10, padding: '10px 12px', fontSize: 11,
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
              padding: '12px 16px', marginBottom: 16,
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
              borderLeft: '3px solid var(--accent-red)', borderRadius: '0 8px 8px 0',
              fontSize: 13, color: 'var(--accent-red)',
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
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
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
      borderRadius: 10, padding: '20px', marginBottom: 16,
      borderTop: `3px solid ${accent}`,
    }}>
      <div style={{
        fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 12,
        color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase',
        marginBottom: 16,
      }}>{title}</div>
      {children}
    </div>
  );
}
