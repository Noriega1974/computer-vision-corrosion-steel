import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, Share2, Trash2, MapPin, AlertCircle, Thermometer, Droplets, Wind } from 'lucide-react';
import { useMedicion } from '../hooks/useMedicion';
import { usePuntos } from '../hooks/usePuntos';
import { useAuth } from '../auth/AuthContext';
import { nivelColor, nivelBg, nivelLabel, nivelToStatus } from '../lib/statusUtils';
import { apiDelete } from '../lib/apiClient';
import BoundingBoxOverlay from '../components/BoundingBoxOverlay';
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
      zoomControl: false, attributionControl: false,
      scrollWheelZoom: false, dragging: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    // Marcador de la planta
    L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div style="width:12px;height:12px;border-radius:50%;background:#1432A3;border:2px solid white;box-shadow:0 0 8px #1432A380;"></div>`,
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
  }, [leafletReady, lat, lng, latReal, lngReal]);

  if (!lat || !lng) {
    return (
      <div style={{
        height: 140, background: 'var(--bg-inset)', borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border)',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, fontFamily: 'var(--font-data)' }}>
          Sin coordenadas
        </div>
      </div>
    );
  }

  return (
    <div ref={mapRef} style={{
      height: 140, borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden',
    }} />
  );
}

// ─── Barra de progreso para porcentaje ───────────────────────────────────────
function BarraPorcentaje({ valor, color, max = 100 }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, (valor / max) * 100)}%`,
          background: `linear-gradient(90deg, ${color}80, ${color})`,
          borderRadius: 5,
          transition: 'width 0.6s ease',
          boxShadow: `0 0 8px ${color}50`,
        }} />
      </div>
      <div style={{
        textAlign: 'right', marginTop: 3,
        fontFamily: 'var(--font-data)', fontWeight: 700,
        fontSize: 13, color,
      }}>
        {(valor ?? 0).toFixed(1)}%
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
  const { puntos } = usePuntos();
  const [activeTab, setActiveTab] = useState('original');
  const [shareMsg, setShareMsg] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');

  const isAdmin = user?.groups?.includes('admin');

  // Volver a galería preservando filtros si vienen del state de navegación
  function handleBack() {
    const prevFilters = location.state?.filters;
    navigate('/galeria', prevFilters ? { state: prevFilters } : undefined);
  }

  async function handleEliminar() {
    setEliminando(true);
    setErrorEliminar('');
    try {
      await apiDelete(`/mediciones/${medicion.id_punto}?id_medicion=${encodeURIComponent(idMedicion)}`);
      navigate('/galeria');
    } catch (err) {
      setErrorEliminar(err.message || 'No se pudo eliminar la medición.');
      setEliminando(false);
    }
  }

  async function handleDescargar() {
    if (!medicion?.url_imagen) return;
    const link = document.createElement('a');
    link.href = medicion.url_imagen;
    link.download = `medicion-${idMedicion}.jpg`;
    link.click();
  }

  // Descarga la vista activa (original/detección/segmentación) quemando el overlay sobre la imagen
  const [descargandoVista, setDescargandoVista] = useState(false);
  async function handleDescargarVistaActual() {
    if (!medicion?.url_imagen) return;
    if (activeTab === 'original') return handleDescargar();

    setDescargandoVista(true);
    let objectUrl;
    try {
      // Se trae la imagen vía fetch (no <img crossOrigin>) para no depender de que el
      // navegador re-valide CORS en una respuesta ya cacheada, y sin tocar la URL original
      // (si es una URL firmada de S3, cualquier query param agregado invalida la firma).
      const resp = await fetch(medicion.url_imagen, { mode: 'cors', cache: 'no-store' });
      if (!resp.ok) throw new Error(`No se pudo obtener la imagen (HTTP ${resp.status})`);
      const sourceBlob = await resp.blob();
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

      if (activeTab === 'deteccion') {
        (medicion.detecciones ?? []).forEach(det => {
          const w = det.w * canvas.width;
          const h = det.h * canvas.height;
          const x = det.x * canvas.width - w / 2;
          const y = det.y * canvas.height - h / 2;
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = Math.max(2, canvas.width * 0.003);
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = '#dc2626';
          ctx.font = `${Math.max(12, Math.round(canvas.width * 0.02))}px monospace`;
          const etiqueta = `${det.clase ?? 'corrosion'} ${det.confianza ? (det.confianza * 100).toFixed(0) + '%' : ''}`.trim();
          ctx.fillText(etiqueta, x + 4, Math.max(12, y - 6));
        });
      } else if (activeTab === 'segmentacion') {
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 12 }}>
        <div style={{
          width: 36, height: 36, border: '3px solid var(--border)',
          borderTopColor: 'var(--accent-amber)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 12, color: 'var(--text-muted)' }}>
          Cargando medición…
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !medicion) {
    return (
      <div style={{ padding: 32 }}>
        <button onClick={handleBack} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontSize: 13,
          marginBottom: 20, padding: 0,
        }}>
          <ArrowLeft size={16} /> Volver a galería
        </button>
        <div style={{
          padding: '32px 24px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center',
        }}>
          <AlertCircle size={40} strokeWidth={1.5} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--text-primary)', marginBottom: 6 }}>
            Medición no disponible
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{error}</div>
        </div>
      </div>
    );
  }

  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const bg = nivelBg(nivel);
  const puntoFallback = puntos.find(p => p.id_punto === medicion.id_punto) ?? {};
  const punto = Object.keys(medicion.punto_info ?? {}).length > 0
    ? medicion.punto_info
    : {
        sede:        medicion.sede      ?? puntoFallback.sede      ?? '',
        ciudad:      medicion.ciudad    ?? puntoFallback.ciudad    ?? '',
        empresa:     medicion.empresa   ?? puntoFallback.empresa   ?? '',
        coordenadas: puntoFallback.coordenadas ?? {},
        id_punto:    medicion.id_punto,
      };
  const lat = punto.coordenadas?.lat;
  const lng = punto.coordenadas?.lng;

  const TABS = [
    { key: 'original', label: 'Original' },
    { key: 'deteccion', label: 'Detección' },
    { key: 'segmentacion', label: 'Segmentación' },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Botón volver */}
      <button onClick={handleBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontSize: 13,
        marginBottom: 20, padding: '6px 0', borderRadius: 6,
      }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        <ArrowLeft size={16} />
        Volver a galería
      </button>

      {/* Layout de dos columnas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
        gap: 20,
        alignItems: 'start',
      }}>

        {/* ── Columna izquierda: imagen con tabs + secciones que antes iban a la derecha ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  fontSize: 13,
                  color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'all 0.13s',
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
                <img
                  src={medicion.url_imagen}
                  alt="Imagen original de la medición"
                  style={{
                    width: '100%', borderRadius: 8,
                    border: '1px solid var(--border)',
                    maxHeight: 480, objectFit: 'contain',
                    background: 'var(--bg-inset)',
                  }}
                />
              ) : (
                <PlaceholderImagen mensaje="Imagen no disponible para esta medición" />
              )
            )}

            {activeTab === 'deteccion' && (
              <BoundingBoxOverlay
                imagenUrl={medicion.url_imagen}
                detecciones={medicion.detecciones ?? []}
              />
            )}

            {activeTab === 'segmentacion' && (
              <SegmentationOverlay
                imagenUrl={medicion.url_imagen}
                mascaras={medicion.mascaras ?? []}
              />
            )}
          </div>
        </div>

          {/* Notas */}
          {medicion.notas && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px' }}>
              <SectionTitle>Notas</SectionTitle>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, fontFamily: 'var(--font-ui)' }}>
                {medicion.notas}
              </p>
            </div>
          )}

          {/* Mapa */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px' }}>
            <SectionTitle>Ubicación</SectionTitle>
            <MiniMapa
              lat={lat}
              lng={lng}
              latReal={medicion.latitud_real}
              lngReal={medicion.longitud_real}
            />
            {lat && lng && (
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-data)', display: 'flex', gap: 12 }}>
                <span style={{ color: '#1432A3' }}>● Planta: {lat?.toFixed(5)}, {lng?.toFixed(5)}</span>
                {medicion.latitud_real && medicion.longitud_real && (
                  <span style={{ color: '#38bdf8' }}>● Foto: {medicion.latitud_real.toFixed(5)}, {medicion.longitud_real.toFixed(5)}</span>
                )}
              </div>
            )}
          </div>

          {/* Acciones */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px' }}>
            <SectionTitle>Acciones</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              <ActionButton icon={<Download size={15} />} onClick={handleDescargarVistaActual} disabled={!medicion.url_imagen || descargandoVista}>
                {descargandoVista ? 'Generando…' : `Descargar vista actual (${TABS.find(t => t.key === activeTab)?.label})`}
              </ActionButton>

              <ActionButton icon={<Share2 size={15} />} onClick={handleCompartir}>
                {shareMsg || 'Copiar enlace'}
              </ActionButton>

              <ActionButton
                icon={<MapPin size={15} />}
                onClick={() => navigate(`/dashboard?punto=${medicion.id_punto}`)}
              >
                Ver planta en dashboard
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
                      borderRadius: 8, fontSize: 12,
                      color: 'var(--text-secondary)', lineHeight: 1.5,
                    }}>
                      Esta acción borra la medición y su foto de forma permanente. ¿Confirmás?
                      {errorEliminar && (
                        <div style={{ color: 'var(--accent-red)', marginTop: 6 }}>{errorEliminar}</div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          onClick={handleEliminar}
                          disabled={eliminando}
                          style={{
                            background: 'var(--accent-red)', border: 'none', borderRadius: 5,
                            padding: '6px 12px', cursor: eliminando ? 'not-allowed' : 'pointer',
                            fontSize: 11, color: 'white', fontWeight: 600, opacity: eliminando ? 0.6 : 1,
                          }}
                        >
                          {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
                        </button>
                        <button
                          onClick={() => { setShowDeleteConfirm(false); setErrorEliminar(''); }}
                          disabled={eliminando}
                          style={{
                            background: 'transparent', border: '1px solid var(--border)', borderRadius: 5,
                            padding: '6px 12px', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)',
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

        {/* ── Columna derecha: metadata ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Badge de nivel grande */}
          <div style={{
            background: bg, border: `1px solid ${color}40`,
            borderRadius: 12, padding: '16px 20px',
            borderTop: `3px solid ${color}`,
          }}>
            <div style={{
              fontFamily: 'var(--font-data)', fontWeight: 700,
              fontSize: 22, color, marginBottom: 4,
              animation: nivel === 3 ? 'blink 1.2s ease-in-out infinite' : 'none',
            }}>
              {nivelLabel(nivel)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-data)', letterSpacing: '0.08em' }}>
              NIVEL {nivel} / 3 · {nivelToStatus(nivel)}
            </div>
          </div>

          {/* Métricas */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <SectionTitle>Resultados del análisis</SectionTitle>

            <div style={{ marginBottom: 14 }}>
              <MetaLabel>Área corroída</MetaLabel>
              <BarraPorcentaje valor={medicion.area_corroida_pct ?? 0} color={color} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <MetaLabel>Confianza del modelo</MetaLabel>
              <BarraPorcentaje
                valor={medicion.confianza_promedio != null ? medicion.confianza_promedio * 100 : 0}
                color="var(--accent-blue)"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MetaItem label="ID medición" value={medicion.id_medicion ?? '—'} wrap />
              <MetaItem label="ID punto" value={medicion.id_punto ?? '—'} wrap />
              <MetaItem label="Planta" value={punto.sede ?? '—'} />
              <MetaItem label="Ciudad" value={punto.ciudad ?? '—'} />
              <MetaItem label="Empresa" value={punto.empresa ?? '—'} />
            </div>
          </div>

          {/* Fecha y hora */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px' }}>
            <SectionTitle>Fecha y hora</SectionTitle>
            <div style={{ fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>
              {medicion.timestamp ? new Date(medicion.timestamp).toLocaleString('es-CO', {
                day: '2-digit', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              }) : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              {tiempoRelativo(medicion.timestamp)}
            </div>
          </div>

          {/* Clima */}
          {medicion.clima && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px' }}>
              <SectionTitle>Condiciones meteorológicas</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <ClimaItem icon={<Thermometer size={13} />} label="Temperatura" value={medicion.clima.temperatura_c != null ? `${medicion.clima.temperatura_c} °C` : '—'} />
                <ClimaItem icon={<Droplets size={13} />} label="Humedad" value={medicion.clima.humedad_pct != null ? `${medicion.clima.humedad_pct} %` : '—'} />
                <ClimaItem icon={<Wind size={13} />} label="Viento" value={medicion.clima.viento_kmh != null ? `${medicion.clima.viento_kmh} km/h` : '—'} />
                <ClimaItem icon={<Droplets size={13} />} label="Precipitación" value={medicion.clima.precipitacion_mm != null ? `${medicion.clima.precipitacion_mm} mm` : '—'} />
              </div>
            </div>
          )}
        </div>
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
      fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600,
      color: 'var(--text-faint)', letterSpacing: '0.12em',
      textTransform: 'uppercase', marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function MetaLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-data)', fontSize: 10,
      color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 4,
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
        fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 11,
        color: 'var(--text-primary)', wordBreak: 'break-all', lineHeight: 1.4,
      } : {
        fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 12,
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
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 14px', background: 'transparent',
        border: `1px solid ${danger ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`,
        borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-ui)', fontSize: 12,
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
    <div style={{ background: 'var(--bg-inset)', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-faint)', fontSize: 9, fontFamily: 'var(--font-data)', letterSpacing: '0.08em' }}>
        {icon}
        {label.toUpperCase()}
      </div>
      <div style={{ fontFamily: 'var(--font-data)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
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
      justifyContent: 'center', gap: 10,
    }}>
      <AlertCircle size={32} strokeWidth={1.5} style={{ color: 'var(--text-faint)' }} />
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{mensaje}</div>
    </div>
  );
}
