import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, Share2, Trash2, MapPin, AlertCircle, Thermometer, Droplets, Wind, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { useMedicion } from '../hooks/useMedicion';
import { useBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth } from '../auth/AuthContext';
import { NIVELES, nivelColor, nivelBg, nivelLabel, nivelRange } from '../lib/statusUtils';
import { formatFecha } from '../utils/dateFormat';
import { apiDelete } from '../lib/apiClient';
import SegmentationOverlay from '../components/SegmentationOverlay';

// ─── Helper tiempo relativo ───────────────────────────────────────────────────
function tiempoRelativo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} días`;
}

// ─── Carga Leaflet via CDN ────────────────────────────────────────────────────
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

// ─── Mini mapa con la ubicación de la medición ───────────────────────────────
function MiniMapa({ lat, lng, latReal, lngReal }) {
  const mapRef = useRef(null);
  const instanceRef = useRef(null);
  const leafletReady = useLeaflet();

  useEffect(() => {
    if (!leafletReady || !lat || !lng || instanceRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, {
      center: [lat, lng], zoom: 13,
      zoomControl: true, attributionControl: false,
      scrollWheelZoom: true, dragging: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    // Marcador de la planta
    L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div style="width:12px;height:12px;border-radius:50%;background:#C1460B;border:2px solid white;box-shadow:0 0 8px #C1460B80;"></div>`,
        className: '', iconSize: [12, 12], iconAnchor: [6, 6],
      }),
    }).addTo(map);

    // Marcador de la foto (si hay GPS exacto diferente al de la planta)
    if (latReal && lngReal && (Math.abs(latReal - lat) > 0.0001 || Math.abs(lngReal - lng) > 0.0001)) {
      L.marker([latReal, lngReal], {
        icon: L.divIcon({
          html: `<div style="width:10px;height:10px;border-radius:50%;background:#38bdf8;border:2px solid white;box-shadow:0 0 8px #38bdf880;"></div>`,
          className: '', iconSize: [10, 10], iconAnchor: [5, 5],
        }),
      }).addTo(map);
    }

    instanceRef.current = map;

    // El mapa ocupa el alto de su celda, que depende de la columna derecha y
    // se define al desplegar la sección: sin invalidateSize Leaflet se queda
    // con el tamaño inicial y deja mosaicos grises.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.invalidateSize())
      : null;
    ro?.observe(mapRef.current);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      map.remove();
      instanceRef.current = null;
    };
  }, [leafletReady, lat, lng, latReal, lngReal]);

  if (!lat || !lng) {
    return (
      <div style={{
        flex: 1, height: '100%', minHeight: 140, background: 'var(--bg-inset)', borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border)',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-data)' }}>
          Sin coordenadas
        </div>
      </div>
    );
  }

  return (
    <div ref={mapRef} style={{
      flex: 1, height: '100%', minHeight: 240, borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden',
    }} />
  );
}

function coordenadaValida(v) {
  return v != null && v !== '' && Number.isFinite(Number(v));
}

// ─── Caja fija para las vistas Original / Segmentación ──────────────────────
// Ambas pestañas comparten la misma caja (mismo ancho y relación de aspecto) y
// la imagen se ajusta adentro con object-fit: contain, así cambiar de pestaña
// no cambia el tamaño de la imagen ni mueve el layout.
const IMAGEN_BOX_STYLE = {
  position: 'relative', width: '100%', aspectRatio: '4 / 3',
  borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-inset)', overflow: 'hidden',
};
const IMAGEN_FIT_STYLE = {
  position: 'absolute', inset: 0, width: '100%', height: '100%',
  objectFit: 'contain', display: 'block',
};

// ─── Barra de progreso para porcentaje ───────────────────────────────────────
function BarraPorcentaje({ valor, color, max = 100 }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden',
      }}>
        {/* scaleX y no width: animar width fuerza reflow en cada frame, y esta
            barra se llena justo cuando la pagina esta ocupada cargando la
            medicion. El elemento ocupa el ancho completo y se escala desde la
            izquierda. */}
        <div style={{
          height: '100%',
          width: '100%',
          transformOrigin: 'left center',
          transform: `scaleX(${Math.min(100, (valor / max) * 100) / 100})`,
          background: `linear-gradient(90deg, ${color}80, ${color})`,
          borderRadius: 5,
          transition: 'transform 0.28s ease-out',
          boxShadow: `0 0 8px ${color}50`,
        }} />
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function MedicionDetailPage() {
  const { idMedicion } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { medicion, loading, error } = useMedicion(idMedicion);
  // El "Punto" viejo (GET /puntos/{id}) fue absorbido por "Bloque" -- no hay
  // endpoint por-id, así que se trae la lista completa y se filtra
  // client-side por bloque_id (mismo patrón que el filtro de bloque en
  // GaleriaPage.jsx).
  const { bloques } = useBloques(true);
  const [activeTab, setActiveTab] = useState('original');
  const [showClimaFlashcard, setShowClimaFlashcard] = useState(false);
  const [showMasOpciones, setShowMasOpciones] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');

  const isAdmin =
    user?.groups?.includes('super_admin') ||
    user?.groups?.includes('admin');
  const esSuperAdmin = user?.groups?.includes('super_admin');
  // Zona: nombre de la afiliación dueña de la medición. Un no-super_admin
  // solo ve mediciones de su propia empresa (scopeado por el backend), así
  // que su perfil ya alcanza; super_admin resuelve contra la lista completa.
  const { perfil } = useUsuarioPerfil();
  const { empresas } = useEmpresas(esSuperAdmin);

  // Volver a galería preservando filtros si vienen del state de navegación
  function handleBack() {
    const prevFilters = location.state?.filters;
    navigate('/galeria', prevFilters ? { state: prevFilters } : undefined);
  }

  async function handleEliminar() {
    setEliminando(true);
    setErrorEliminar('');
    try {
      await apiDelete(`/mediciones/${medicion.bloque_id}?id_medicion=${encodeURIComponent(idMedicion)}`);
      navigate('/galeria');
    } catch (err) {
      setErrorEliminar(err.message || 'No se pudo eliminar la medición.');
      setEliminando(false);
    }
  }

  // Descarga la vista activa (original/segmentación).
  //
  // La versión anterior de "original" ponía la URL de S3 directo en
  // `<a href download>` -- el atributo `download` NO fuerza la descarga en
  // recursos cross-origin (S3 nunca es el mismo origen que Vercel), así que
  // el navegador simplemente navegaba a la imagen en vez de guardarla. Las
  // otras dos vistas sí traían la imagen por `fetch` primero, así que las
  // tres ahora comparten ese mismo camino -- "original" se descarga tal cual
  // (sin pasar por canvas, conserva el archivo original byte a byte).
  const [descargandoVista, setDescargandoVista] = useState(false);
  async function handleDescargarVistaActual() {
    if (!medicion?.url_imagen) return;

    setDescargandoVista(true);
    let objectUrl;
    try {
      // Se trae la imagen vía fetch (no <img crossOrigin>) para no depender de que el
      // navegador re-valide CORS en una respuesta ya cacheada, y sin tocar la URL original
      // (si es una URL firmada de S3, cualquier query param agregado invalida la firma).
      const resp = await fetch(medicion.url_imagen, { mode: 'cors', cache: 'no-store' });
      if (!resp.ok) throw new Error(`No se pudo obtener la imagen (HTTP ${resp.status})`);
      const sourceBlob = await resp.blob();

      if (activeTab === 'original') {
        const url = URL.createObjectURL(sourceBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `medicion-${idMedicion}-original.jpg`;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      objectUrl = URL.createObjectURL(sourceBlob);

      const img = new Image();
      img.src = objectUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      if (activeTab === 'segmentacion') {
        (medicion.mascaras ?? []).forEach(({ puntos = [], color = '#dc2626', opacidad = 0.45 }) => {
          if (puntos.length < 3) return;
          ctx.beginPath();
          ctx.moveTo(puntos[0].x * canvas.width, puntos[0].y * canvas.height);
          puntos.slice(1).forEach(p => ctx.lineTo(p.x * canvas.width, p.y * canvas.height));
          ctx.closePath();
          ctx.fillStyle = color + Math.round(opacidad * 255).toString(16).padStart(2, '0');
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1.5, canvas.width * 0.002);
          ctx.stroke();
        });
      }

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `medicion-${idMedicion}-${activeTab}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al generar descarga de vista', err);
      alert('No se pudo generar la descarga de esta vista. Probá de nuevo en unos minutos.');
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setDescargandoVista(false);
    }
  }

  async function handleCompartir() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMsg('Enlace copiado al portapapeles');
      setTimeout(() => setShareMsg(''), 2500);
    } catch {
      setShareMsg('No se pudo copiar el enlace');
      setTimeout(() => setShareMsg(''), 2500);
    }
  }

  // ─── Loading / Error ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{
          width: 36, height: 36, border: '3px solid var(--border)',
          borderTopColor: 'var(--accent-amber)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Cargando medición…
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !medicion) {
    return (
      <div style={{ padding: 'var(--space-6)' }}>
        <button onClick={handleBack} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)',
          marginBottom: 20, padding: 0,
        }}>
          <ArrowLeft size={16} /> Volver a galería
        </button>
        <div style={{
          padding: '32px 24px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center',
        }}>
          <AlertCircle size={40} strokeWidth={1.5} style={{ color: 'var(--text-faint)', marginBottom: 'var(--space-3)' }} />
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-md)', color: 'var(--text-primary)', marginBottom: 6 }}>
            Medición no disponible
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{error}</div>
        </div>
      </div>
    );
  }

  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const bg = nivelBg(nivel);
  // sede/ciudad ya no viajan denormalizados en la medición -- se resuelven
  // desde el bloque (punto) al que pertenece.
  const bloqueInfo = bloques.find(b => b.id_bloque === medicion.bloque_id) ?? {};
  const punto = {
    sede: medicion.bloque_nombre ?? bloqueInfo.nombre ?? '',
    ciudad: bloqueInfo.ciudad ?? '',
    coordenadas: bloqueInfo.coordenadas ?? {},
  };
  const lat = coordenadaValida(punto.coordenadas?.lat) ? Number(punto.coordenadas.lat) : null;
  const lng = coordenadaValida(punto.coordenadas?.lng) ? Number(punto.coordenadas.lng) : null;
  // (0, 0) es el valor por defecto de "sin ubicación", no un punto real.
  const tieneCoordenadas = lat !== null && lng !== null && !(lat === 0 && lng === 0);
  const clima = medicion.clima;
  const vientoKmh = clima?.viento_kmh ?? clima?.velocidad_viento_kmh;
  const tieneClima = !!clima && [
    clima.temperatura_c, clima.humedad_pct, vientoKmh, clima.precipitacion_mm,
  ].some(v => v != null);
  const zonaNombre = esSuperAdmin
    ? (empresas.find(e => e.id_empresa === medicion.empresa_id)?.nombre ?? '—')
    : (perfil?.empresa_nombre ?? '—');

  const TABS = [
    { key: 'original', label: 'Original' },
    { key: 'segmentacion', label: 'Segmentación' },
  ];

  return (
    <div style={{ padding: 'var(--space-5)', maxWidth: 1600, width: '100%', margin: '0 auto' }}>

      {/* Botón volver */}
      <button onClick={handleBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)',
        marginBottom: 20, padding: '6px 0', borderRadius: 6,
      }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        <ArrowLeft size={16} />
        Volver a galería
      </button>

      {/* Layout de dos columnas principales */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
        gap: 20,
        alignItems: 'start',
      }}>

        {/* ── Columna izquierda: imagen con tabs Original / Segmentación + Notas ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3-5)' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Tabs */}
            <div style={{
              display: 'flex', borderBottom: '1px solid var(--border)',
              background: 'var(--bg-inset)',
            }}>
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1, padding: '12px 8px',
                    background: activeTab === tab.key ? 'var(--bg-card)' : 'transparent',
                    border: 'none',
                    borderBottom: activeTab === tab.key ? `2px solid ${color}` : '2px solid transparent',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)', fontWeight: activeTab === tab.key ? 600 : 400,
                    fontSize: 'var(--text-sm)',
                    color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                    transition: 'color 0.13s, background-color 0.13s, border-bottom-color 0.13s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Contenido del tab */}
            <div style={{ padding: 20 }}>
              {activeTab === 'original' && (
                medicion.url_imagen ? (
                  <div style={IMAGEN_BOX_STYLE}>
                    <img
                      src={medicion.url_imagen}
                      alt="Imagen original de la medición"
                      style={IMAGEN_FIT_STYLE}
                    />
                  </div>
                ) : (
                  <PlaceholderImagen mensaje="Imagen no disponible para esta medición" />
                )
              )}

              {activeTab === 'segmentacion' && (
                medicion.url_imagen ? (
                  <SegmentationOverlay
                    imagenUrl={medicion.url_imagen}
                    mascaras={medicion.mascaras ?? []}
                    boxStyle={IMAGEN_BOX_STYLE}
                    imgStyle={IMAGEN_FIT_STYLE}
                  />
                ) : (
                  <PlaceholderImagen mensaje="Imagen no disponible para esta medición" />
                )
              )}
            </div>
          </div>

          {/* Notas */}
          {medicion.notas && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px' }}>
              <SectionTitle>Notas</SectionTitle>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, fontFamily: 'var(--font-ui)' }}>
                {medicion.notas}
              </p>
            </div>
          )}
        </div>

        {/* ── Columna derecha: Flashcard de la medición (sin huecos entre tarjetas) ── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: 'var(--shadow-sm)',
        }}>
          {/* 1. Cabecera: Título (Punto) + Subtítulo (Zona · Ciudad · Fecha) */}
          <div>
            <div style={{
              fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 20,
              color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.15,
            }}>
              {punto.sede ?? 'Punto sin nombre'}
            </div>
            <div style={{
              fontSize: 13, color: 'var(--text-muted)', fontWeight: 400, marginTop: 4,
              fontFamily: 'var(--font-ui)',
            }}>
              {zonaNombre} · {punto.ciudad ?? '—'} · {tiempoRelativo(medicion.timestamp)}
            </div>
          </div>

          {/* 2. Bloque central encuadrado: Veredicto + Barra de progreso de área corroída */}
          <div style={{
            background: bg,
            border: `1px solid ${color}45`,
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{
                  fontFamily: 'var(--font-ui)', fontWeight: 700,
                  fontSize: 17, color,
                  animation: nivel === 3 ? 'blink 1.2s ease-in-out infinite' : 'none',
                }}>
                  {nivelLabel(nivel)}
                </span>
              </div>
              <span style={{
                fontFamily: 'var(--font-data)', fontWeight: 800,
                fontSize: 20, color, letterSpacing: '-0.02em',
              }}>
                {(medicion.area_corroida_pct ?? 0).toFixed(1)}%
              </span>
            </div>
            <BarraPorcentaje valor={medicion.area_corroida_pct ?? 0} color={color} />

            {/* Metadatos secundarios compactos dentro de la caja central */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px',
              paddingTop: 10, marginTop: 2, borderTop: `1px solid ${color}25`,
            }}>
              <MetaItem label="Zona" value={zonaNombre} />
              <MetaItem label="Ciudad" value={punto.ciudad ?? '—'} />
              <MetaItem label="Registro" value={formatFecha(medicion.timestamp, { conHora: true })} />
              <MetaItem label="Antigüedad" value={tiempoRelativo(medicion.timestamp)} />
            </div>

            {/* Desplegable de Información meteorológica dentro de la flashcard */}
            {tieneClima && (
              <div style={{
                paddingTop: 8, marginTop: 2, borderTop: `1px solid ${color}25`,
              }}>
                <button
                  type="button"
                  onClick={() => setShowClimaFlashcard(s => !s)}
                  aria-expanded={showClimaFlashcard}
                  style={{
                    width: '100%', padding: '4px 0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Thermometer size={14} style={{ color: 'var(--accent-amber)' }} />
                    Información meteorológica
                  </span>
                  {showClimaFlashcard ? <ChevronUp size={15} color="var(--text-muted)" /> : <ChevronDown size={15} color="var(--text-muted)" />}
                </button>

                {showClimaFlashcard && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                    marginTop: 8,
                  }}>
                    {clima.temperatura_c != null && <ClimaItem icon={<Thermometer size={13} />} label="Temperatura" value={`${clima.temperatura_c} °C`} />}
                    {clima.humedad_pct != null && <ClimaItem icon={<Droplets size={13} />} label="Humedad" value={`${clima.humedad_pct} %`} />}
                    {vientoKmh != null && <ClimaItem icon={<Wind size={13} />} label="Viento" value={`${vientoKmh} km/h`} />}
                    {clima.precipitacion_mm != null && <ClimaItem icon={<Droplets size={13} />} label="Precipitación" value={`${clima.precipitacion_mm} mm`} />}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Pie de la flashcard: Acciones rápidas (píldoras) */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 10, flexWrap: 'wrap',
          }}>
            <button
              type="button"
              onClick={() => navigate(`/dashboard?punto=${medicion.bloque_id}`)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 999,
                background: 'var(--bg-inset)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
                fontWeight: 600, fontSize: 12, cursor: 'pointer',
              }}
            >
              <MapPin size={14} /> Ver en mapa
            </button>

            <button
              type="button"
              onClick={handleDescargarVistaActual}
              disabled={!medicion.url_imagen || descargandoVista}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 999,
                background: 'var(--text-primary)', border: 'none',
                color: 'var(--bg-card-solid)', fontFamily: 'var(--font-ui)',
                fontWeight: 600, fontSize: 12,
                cursor: (!medicion.url_imagen || descargandoVista) ? 'not-allowed' : 'pointer',
                opacity: (!medicion.url_imagen || descargandoVista) ? 0.5 : 1,
              }}
            >
              <Download size={14} />
              {descargandoVista ? 'Generando…' : `Descargar (${TABS.find(t => t.key === activeTab)?.label})`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Sección Desplegable: Más opciones y detalles técnicos ── */}
      <div style={{
        marginTop: 24,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setShowMasOpciones(s => !s)}
          aria-expanded={showMasOpciones}
          style={{
            width: '100%',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: showMasOpciones ? 'var(--bg-inset)' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-primary)',
            transition: 'background-color 0.15s ease',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Settings size={15} /> Más opciones y detalles técnicos (Ubicación, Clima, Descarga, Gestión)
          </span>
          {showMasOpciones ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showMasOpciones && (
          <div style={{
            padding: '20px',
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: 20,
          }}>
            {/* Ubicación y mapa: la celda se estira al alto de la columna
                derecha (clima + gestión) y el mapa llena ese alto. */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <SectionTitle>Ubicación geográfica del espécimen</SectionTitle>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <MiniMapa
                  lat={lat}
                  lng={lng}
                  latReal={medicion.latitud_real}
                  lngReal={medicion.longitud_real}
                />
              </div>
              {tieneCoordenadas && (
                <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-data)', display: 'flex', gap: 'var(--space-3)', flexShrink: 0 }}>
                  <span style={{ color: 'var(--accent-amber)' }}>● Punto: {lat?.toFixed(5)}, {lng?.toFixed(5)}</span>
                  {medicion.latitud_real && medicion.longitud_real && (
                    <span style={{ color: '#38bdf8' }}>● Foto: {medicion.latitud_real.toFixed(5)}, {medicion.longitud_real.toFixed(5)}</span>
                  )}
                </div>
              )}
            </div>

            {/* Condiciones meteorológicas + Gestión */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Clima Open-Meteo: solo con coordenadas válidas y algún dato */}
              {tieneClima && (
                <div>
                  <SectionTitle>Condiciones meteorológicas (Open-Meteo)</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    {clima.temperatura_c != null && <ClimaItem icon={<Thermometer size={13} />} label="Temperatura" value={`${clima.temperatura_c} °C`} />}
                    {clima.humedad_pct != null && <ClimaItem icon={<Droplets size={13} />} label="Humedad" value={`${clima.humedad_pct} %`} />}
                    {vientoKmh != null && <ClimaItem icon={<Wind size={13} />} label="Viento" value={`${vientoKmh} km/h`} />}
                    {clima.precipitacion_mm != null && <ClimaItem icon={<Droplets size={13} />} label="Precipitación" value={`${clima.precipitacion_mm} mm`} />}
                  </div>
                </div>
              )}

              {/* Referencia técnica ISO 10289: tarjetas estructuradas con barra de color */}
              <div>
                <SectionTitle>Escala de referencia (ISO 10289)</SectionTitle>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 6,
                }}>
                  {NIVELES.map((n, i) => {
                    const activo = i === nivel;
                    const c = nivelColor(i);
                    return (
                      <div
                        key={n.status}
                        style={{
                          padding: '8px 10px',
                          background: activo ? nivelBg(i) : 'var(--bg-inset)',
                          border: `1px solid ${activo ? `${c}60` : 'var(--border)'}`,
                          borderRadius: 8,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 5,
                        }}
                      >
                        <div style={{
                          height: 4, borderRadius: 999,
                          background: activo ? c : `${c}45`,
                        }} />
                        <div style={{
                          fontFamily: 'var(--font-ui)', fontSize: 12,
                          fontWeight: 700, color: activo ? c : 'var(--text-primary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {n.label}
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-data)', fontSize: 10,
                          color: 'var(--text-muted)', lineHeight: 1.2,
                        }}>
                          {n.range}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Acciones de gestión y navegación */}
              <div>
                <SectionTitle>Gestión del espécimen</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <ActionButton icon={<Download size={15} />} onClick={handleDescargarVistaActual} disabled={!medicion.url_imagen || descargandoVista}>
                    {descargandoVista ? 'Generando…' : `Descargar vista (${TABS.find(t => t.key === activeTab)?.label})`}
                  </ActionButton>
                  <ActionButton icon={<Share2 size={15} />} onClick={handleCompartir}>
                    {shareMsg || 'Copiar enlace'}
                  </ActionButton>
                  <ActionButton
                    icon={<MapPin size={15} />}
                    onClick={() => navigate(`/dashboard?punto=${medicion.bloque_id}`)}
                  >
                    Ver punto en dashboard
                  </ActionButton>

                  {/* Eliminar: solo admins */}
                  {isAdmin && (
                    <>
                      <ActionButton
                        icon={<Trash2 size={15} />}
                        danger
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={eliminando}
                      >
                        Eliminar medición
                      </ActionButton>

                      {showDeleteConfirm && (
                        <div style={{
                          padding: '12px 14px',
                          background: 'rgba(220,38,38,0.08)',
                          border: '1px solid rgba(220,38,38,0.3)',
                          borderRadius: 8, fontSize: 'var(--text-xs)',
                          color: 'var(--text-secondary)', lineHeight: 1.5,
                        }}>
                          Esta acción borra la medición y su foto de forma permanente. ¿Confirmás?
                          {errorEliminar && (
                            <div style={{ color: 'var(--accent-red)', marginTop: 6 }}>{errorEliminar}</div>
                          )}
                          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                            <button
                              onClick={handleEliminar}
                              disabled={eliminando}
                              style={{
                                background: 'var(--accent-red)', border: 'none', borderRadius: 5,
                                padding: '6px 12px', cursor: eliminando ? 'not-allowed' : 'pointer',
                                fontSize: 'var(--text-2xs)', color: 'white', fontWeight: 600, opacity: eliminando ? 0.6 : 1,
                              }}
                            >
                              {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
                            </button>
                            <button
                              onClick={() => { setShowDeleteConfirm(false); setErrorEliminar(''); }}
                              disabled={eliminando}
                              style={{
                                background: 'transparent', border: '1px solid var(--border)', borderRadius: 5,
                                padding: '6px 12px', cursor: 'pointer', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)',
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .detail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Subcomponentes auxiliares ─────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-data)', fontSize: 'var(--text-3xs)', fontWeight: 600,
      color: 'var(--text-faint)', letterSpacing: '0.12em',
      textTransform: 'uppercase', marginBottom: 'var(--space-2-5)',
    }}>
      {children}
    </div>
  );
}

function MetaLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-data)', fontSize: 'var(--text-3xs)',
      color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 'var(--space-1)',
    }}>
      {children}
    </div>
  );
}

function MetaItem({ label, value, wrap }) {
  return (
    <div style={{ background: 'var(--bg-inset)', borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: 'var(--text-faint)', marginBottom: 2, fontFamily: 'var(--font-data)', letterSpacing: '0.08em' }}>{label}</div>
      <div style={wrap ? {
        fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 'var(--text-2xs)',
        color: 'var(--text-primary)', wordBreak: 'break-all', lineHeight: 1.4,
      } : {
        fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 'var(--text-xs)',
        color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</div>
    </div>
  );
}

function ActionButton({ icon, onClick, danger, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        padding: '9px 14px', background: 'transparent',
        border: `1px solid ${danger ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`,
        borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)',
        color: danger ? 'var(--accent-red)' : disabled ? 'var(--text-faint)' : 'var(--text-secondary)',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.12s',
        textAlign: 'left',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = danger ? 'rgba(220,38,38,0.07)' : 'var(--bg-inset)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      {children}
    </button>
  );
}

function ClimaItem({ icon, label, value }) {
  return (
    <div style={{ background: 'var(--bg-inset)', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--text-faint)', fontSize: 9, fontFamily: 'var(--font-data)', letterSpacing: '0.08em' }}>
        {icon}
        {label.toUpperCase()}
      </div>
      <div style={{ fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function PlaceholderImagen({ mensaje }) {
  return (
    <div style={{
      height: 300, background: 'var(--bg-inset)', borderRadius: 8,
      border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 'var(--space-2-5)',
    }}>
      <AlertCircle size={32} strokeWidth={1.5} style={{ color: 'var(--text-faint)' }} />
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{mensaje}</div>
    </div>
  );
}
