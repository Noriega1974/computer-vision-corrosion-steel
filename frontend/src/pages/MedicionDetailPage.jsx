import ErrorEstado from '../components/ErrorEstado';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { IconoAjustes, IconoCompartir, IconoDescargar, IconoEliminar, IconoError, IconoFlechaAbajo, IconoFlechaArriba, IconoHumedad, IconoTemperatura, IconoUbicacion, IconoViento, IconoVolver } from '../components/Iconos';
import { useMedicion } from '../hooks/useMedicion';
import { useBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth } from '../auth/AuthContext';
import { NIVELES, nivelColor, nivelBg, nivelLabel } from '../lib/statusUtils';
import { formatFecha } from '../utils/dateFormat';
import { apiDelete, apiPatch } from '../lib/apiClient';
import { useRefreshKey } from '../hooks/RefreshKeyContext';
import SegmentationOverlay from '../components/SegmentationOverlay';
import { baseArea, formatoPct } from '../lib/textUtils';
import NivelIcon from '../components/NivelIcon';
import NivelInfo from '../components/NivelInfo';
import Skeleton, { SkeletonLinea } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import { AvisoEnLinea } from '../components/Aviso';

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
// Tipografia de la ficha, compartida entre la ficha real y su esqueleto.
const FICHA_TITULO_STYLE = {
  fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 20,
  color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.15,
};
const FICHA_SUBTITULO_STYLE = {
  fontSize: 13, color: 'var(--text-muted)', fontWeight: 400, marginTop: 4, fontFamily: 'var(--font-ui)',
};
const FICHA_VEREDICTO_STYLE = {
  fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.01em', lineHeight: 1.1,
};
const FICHA_PCT_STYLE = {
  fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontWeight: 800,
  fontSize: 30, letterSpacing: '-0.02em', lineHeight: 1.05,
};
const FICHA_PCT_LABEL_STYLE = {
  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
};
const META_LABEL_STYLE = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 3, fontFamily: 'var(--font-ui)', fontWeight: 500 };
const META_VALOR_STYLE = {
  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 16, lineHeight: 1.25,
  color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

// Esqueleto de la pagina completa: misma rejilla 1.4fr / 1fr, imagen 4:3 y
// flashcard derecha. Cada texto va dentro de un elemento con la tipografia del
// real (mismo font-size / line-height / margenes), asi el alto es identico.
function MedicionDetailSkeleton() {
  const caja = { background: 'var(--bg-card)', border: '1px solid var(--border)' };
  return (
    <div
      aria-busy="true"
      style={{ padding: 'var(--space-5)', maxWidth: 1600, width: '100%', margin: '0 auto' }}
    >
      {/* Boton volver: icono 16 + texto sm, padding 6px 0, margen 20 */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)', marginBottom: 20, padding: '6px 0',
      }}>
        <Skeleton width={16} height={16} radius="50%" />
        <span><SkeletonLinea width={110} /></span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
        gap: 20, alignItems: 'start',
      }}>
        <div style={{ ...caja, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-inset)',
          }}>
            {[0, 1].map(i => (
              <div key={i} style={{
                flex: 1, padding: '12px 8px', textAlign: 'center',
                fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)',
                borderBottom: '2px solid transparent',
              }}>
                <SkeletonLinea width={i === 0 ? 60 : 90} />
              </div>
            ))}
          </div>
          <div style={{ padding: 20 }}>
            <Skeleton
              height="auto" radius={8}
              style={{ aspectRatio: IMAGEN_BOX_STYLE.aspectRatio, border: IMAGEN_BOX_STYLE.border }}
            />
          </div>
        </div>
        <div style={{
          ...caja, borderRadius: 14, padding: '18px 20px',
          display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-sm)',
        }}>
          <div>
            <div style={FICHA_TITULO_STYLE}><SkeletonLinea width="60%" /></div>
            <div style={FICHA_SUBTITULO_STYLE}><SkeletonLinea width="80%" /></div>
          </div>
          <div style={{
            border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Skeleton width={30} height={30} radius="50%" />
                <span style={FICHA_VEREDICTO_STYLE}><SkeletonLinea width={110} /></span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={FICHA_PCT_STYLE}><SkeletonLinea width={70} /></div>
                <div style={FICHA_PCT_LABEL_STYLE}><SkeletonLinea width={60} /></div>
              </div>
            </div>
            <Skeleton height={10} radius={5} />
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
              paddingTop: 12, marginTop: 2, borderTop: '1px solid var(--border)',
            }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ background: 'var(--bg-inset)', borderRadius: 8, padding: '10px 12px', minWidth: 0 }}>
                  <div style={META_LABEL_STYLE}><SkeletonLinea width="40%" /></div>
                  <div style={META_VALOR_STYLE}><SkeletonLinea width="75%" /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  // `?punto=` lo ponen los enlaces de la galería para hallar fotos antiguas.
  const [searchParams] = useSearchParams();
  const { medicion, loading, error, noEncontrada, refetch } = useMedicion(idMedicion, searchParams.get('punto'));
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
  const { invalidate } = useRefreshKey();

  const isAdmin =
    user?.groups?.includes('super_admin') ||
    user?.groups?.includes('admin');
  // Eliminar también lo puede tecnico (renombrar sigue siendo de admins).
  const puedeEliminar = isAdmin || user?.groups?.includes('tecnico');
  const esSuperAdmin = user?.groups?.includes('super_admin');
  // Zona: nombre de la afiliación dueña de la medición. Un no-super_admin
  // solo ve mediciones de su propia empresa (scopeado por el backend), así
  // que su perfil ya alcanza; super_admin resuelve contra la lista completa.
  const { perfil } = useUsuarioPerfil();
  const { empresas } = useEmpresas(esSuperAdmin);

  // Volver a la carpeta (o búsqueda) de la galería de la que se vino,
  // preservando filtros si vienen del state de navegación
  function handleBack() {
    const prevFilters = location.state?.filters;
    navigate(location.state?.volver ?? '/galeria', prevFilters ? { state: prevFilters } : undefined);
  }

  async function handleEliminar() {
    setEliminando(true);
    setErrorEliminar('');
    try {
      await apiDelete(`/mediciones/${medicion.bloque_id}?id_medicion=${encodeURIComponent(idMedicion)}`);
      // Return to the punto's gallery folder when both ids are known.
      navigate(
        medicion.empresa_id && medicion.bloque_id
          ? `/galeria/zona/${medicion.empresa_id}/${medicion.bloque_id}`
          : '/galeria'
      );
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
  const [errorDescarga, setErrorDescarga] = useState('');
  async function handleDescargarVistaActual() {
    setErrorDescarga('');
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
        const placa = medicion.contorno_placa?.puntos ?? [];
        if (placa.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(placa[0].x * canvas.width, placa[0].y * canvas.height);
          placa.slice(1).forEach(p => ctx.lineTo(p.x * canvas.width, p.y * canvas.height));
          ctx.closePath();
          ctx.strokeStyle = '#16a34a';
          ctx.lineWidth = Math.max(2.5, canvas.width * 0.003);
          ctx.stroke();
        }
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
      setErrorDescarga('No se pudo generar la descarga de esta vista. Prueba de nuevo en unos minutos.');
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
  if (loading) return <MedicionDetailSkeleton />;

  // Not found is a normal outcome (e.g. the measurement was deleted), not a
  // load failure: no retry, just a way back. Real load errors keep ErrorEstado.
  if (noEncontrada && !medicion) {
    return (
      <div style={{ padding: 'var(--space-6)' }}>
        <div role="status" style={{
          padding: '32px 24px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center',
          fontFamily: 'var(--font-ui)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 'var(--space-3)',
        }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            No encontramos esta medición. Puede que se haya eliminado.
          </p>
          <button type="button" onClick={handleBack} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
            background: 'var(--bg-inset)', border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
            fontWeight: 600, fontSize: 'var(--text-sm)',
          }}>
            <IconoVolver size={16} aria-hidden="true" /> Volver a la galería
          </button>
        </div>
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
          <IconoVolver size={16} /> Volver a galería
        </button>
        <div style={{
          padding: '32px 24px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center',
        }}>
          <ErrorEstado titulo="No se pudo cargar la medición." detalle={error} onRetry={refetch} />
        </div>
      </div>
    );
  }

  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const bg = nivelBg(nivel);
  // Tiempo de análisis ≈ subida (medida en el navegador) + procesamiento del
  // servidor. Solo existe en mediciones nuevas.
  const fmtSeg = n => n.toFixed(1).replace('.', ',');
  const tiempoAnalisis = (medicion.tiempo_subida_s != null && medicion.tiempo_procesamiento_ms != null)
    ? (() => {
        const subida = Number(medicion.tiempo_subida_s);
        const proc = Number(medicion.tiempo_procesamiento_ms) / 1000;
        return Number.isFinite(subida) && Number.isFinite(proc)
          ? { total: fmtSeg(subida + proc), subida: fmtSeg(subida), procesamiento: fmtSeg(proc) }
          : null;
      })()
    : null;
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
        <IconoVolver size={16} />
        Volver a galería
      </button>

      {/* Layout de dos columnas principales */}
      <div className="detail-grid" style={{
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
                    transition: 'color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out), border-bottom-color var(--dur-fast) var(--ease-out)',
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
                    contorno={medicion.contorno_placa}
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
            <div style={FICHA_TITULO_STYLE}>
              {medicion.nombre || (punto.sede ?? 'Punto sin nombre')}
            </div>
            <div style={FICHA_SUBTITULO_STYLE}>
              {medicion.nombre ? `${punto.sede || 'Punto sin nombre'} · ` : ''}{zonaNombre} · {punto.ciudad ?? '—'} · {tiempoRelativo(medicion.timestamp)}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color }}>
                <NivelIcon nivel={nivel} size={30} />
                <span
                  className={nivel === 3 ? 'severa-pulse' : undefined}
                  style={{ ...FICHA_VEREDICTO_STYLE, color }}
                >
                  {nivelLabel(nivel)}
                </span>
                <NivelInfo nivel={nivel} color={color} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...FICHA_PCT_STYLE, color }}>
                  {formatoPct(medicion.area_corroida_pct)}
                </div>
                <div style={FICHA_PCT_LABEL_STYLE}>
                  {baseArea(medicion) === 'placa' ? 'Área corroída sobre la placa' : 'Área corroída sobre la foto completa'}
                </div>
                {baseArea(medicion) === 'placa' && medicion.area_corroida_pct_foto != null && (
                  <div style={{ ...FICHA_PCT_LABEL_STYLE, fontWeight: 500, marginTop: 1 }}>
                    {formatoPct(medicion.area_corroida_pct_foto)} sobre la foto completa
                  </div>
                )}
              </div>
            </div>
            <BarraPorcentaje valor={medicion.area_corroida_pct ?? 0} color={color} />
            {medicion.area_base === 'foto' && (
              <p style={{
                margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)',
              }}>
                No se pudo reconocer la placa en esta foto. El porcentaje se calculó sobre la foto completa
                y depende del encuadre.
              </p>
            )}

            {/* Metadatos secundarios compactos dentro de la caja central */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
              paddingTop: 12, marginTop: 2, borderTop: `1px solid ${color}25`,
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
                    <IconoTemperatura size={14} style={{ color: 'var(--accent-amber)' }} />
                    Información meteorológica
                  </span>
                  {showClimaFlashcard ? <IconoFlechaArriba size={15} color="var(--text-muted)" /> : <IconoFlechaAbajo size={15} color="var(--text-muted)" />}
                </button>

                {showClimaFlashcard && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                    marginTop: 8,
                  }}>
                    {clima.temperatura_c != null && <ClimaItem icon={<IconoTemperatura size={13} />} label="Temperatura" value={`${clima.temperatura_c}°C`} />}
                    {clima.humedad_pct != null && <ClimaItem icon={<IconoHumedad size={13} />} label="Humedad" value={`${clima.humedad_pct}%`} />}
                    {vientoKmh != null && <ClimaItem icon={<IconoViento size={13} />} label="Viento" value={`${vientoKmh} km/h`} />}
                    {clima.precipitacion_mm != null && <ClimaItem icon={<IconoHumedad size={13} />} label="Precipitación" value={`${clima.precipitacion_mm} mm`} />}
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
              <IconoUbicacion size={14} /> Ver en mapa
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
              <IconoDescargar size={14} />
              {descargandoVista ? 'Generando…' : `Descargar (${TABS.find(t => t.key === activeTab)?.label})`}
            </button>
          </div>
          {errorDescarga && (
            <AvisoEnLinea tone="error" style={{ marginTop: 10 }}>{errorDescarga}</AvisoEnLinea>
          )}
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
            transition: 'background-color var(--dur-fast) var(--ease-out)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <IconoAjustes size={15} /> Más opciones y detalles técnicos
          </span>
          {showMasOpciones ? <IconoFlechaArriba size={18} /> : <IconoFlechaAbajo size={18} />}
        </button>

        {showMasOpciones && (
          <div className="detail-grid" style={{
            padding: '20px',
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: 20,
          }}>
            {/* Ubicación y mapa: la celda se estira al alto de la columna
                derecha (referencia + gestión) y el mapa llena ese alto. */}
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
                  <span style={{ color: 'var(--accent-amber)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />Punto: {lat?.toFixed(5)}, {lng?.toFixed(5)}</span>
                  {medicion.latitud_real && medicion.longitud_real && (
                    <span style={{ color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: 5 }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />Foto: {medicion.latitud_real.toFixed(5)}, {medicion.longitud_real.toFixed(5)}</span>
                  )}
                </div>
              )}
            </div>

            {/* Tiempo + Referencia ISO + Gestión */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Tiempo de análisis: solo en mediciones nuevas (las viejas no lo guardaron) */}
              {tiempoAnalisis && (
                <div>
                  <SectionTitle>Tiempo de análisis</SectionTitle>
                  <div style={{ fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    ≈ {tiempoAnalisis.total} s
                  </div>
                  <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    subida {tiempoAnalisis.subida} s · procesamiento {tiempoAnalisis.procesamiento} s
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
                          fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontSize: 11,
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
                  {/* Renombrar la foto: solo admins (el backend lo exige). */}
                  {isAdmin && (
                    <NombreFoto
                      idMedicion={idMedicion}
                      bloqueId={medicion.bloque_id}
                      actual={medicion.nombre ?? ''}
                      onGuardado={invalidate}
                    />
                  )}
                  <ActionButton icon={<IconoCompartir size={15} />} onClick={handleCompartir}>
                    {shareMsg || 'Copiar enlace'}
                  </ActionButton>

                  {/* Eliminar: super_admin, admin y tecnico */}
                  {puedeEliminar && (
                    <>
                      <ActionButton
                        icon={<IconoEliminar size={15} />}
                        danger
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={eliminando}
                      >
                        Eliminar medición
                      </ActionButton>

                      {showDeleteConfirm && (
                        <ConfirmDialog
                          title="¿Eliminar esta medición?"
                          message="Se borrarán la medición y su foto. Esta acción no se puede deshacer."
                          confirmLabel="Eliminar"
                          loadingLabel="Eliminando…"
                          tone="danger"
                          onConfirm={handleEliminar}
                          onCancel={() => { setShowDeleteConfirm(false); setErrorEliminar(''); }}
                          loading={eliminando}
                        >
                          {errorEliminar && (
                            <div role="alert" style={{ color: 'var(--accent-red)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-3)' }}>{errorEliminar}</div>
                          )}
                        </ConfirmDialog>
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
        @media (max-width: 900px) {
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

function MetaItem({ label, value }) {
  return (
    <div style={{ background: 'var(--bg-inset)', borderRadius: 8, padding: '10px 12px', minWidth: 0 }}>
      <div style={META_LABEL_STYLE}>{label}</div>
      <div style={META_VALOR_STYLE}>{value}</div>
    </div>
  );
}

const NOMBRE_MAX = 80;

// Campo para renombrar la foto (PATCH). Guardar queda inactivo mientras el
// texto no cambie; vacío quita el nombre. Tras guardar se invalida la caché
// global y el título de la cabecera se actualiza solo.
function NombreFoto({ idMedicion, bloqueId, actual, onGuardado }) {
  const [valor, setValor] = useState(actual);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null); // { ok: bool, msg: string }
  const sinCambios = valor.split(/\s+/).join(' ').trim() === actual;  // el backend también colapsa espacios

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setEstado(null);
    try {
      await apiPatch(`/mediciones/${bloqueId}?id_medicion=${encodeURIComponent(idMedicion)}`, { nombre: valor });
      setEstado({ ok: true, msg: 'Nombre guardado.' });
      onGuardado();
    } catch (err) {
      setEstado({ ok: false, msg: err.message || 'No se pudo guardar el nombre.' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} style={{ marginBottom: 'var(--space-2)' }}>
      <label htmlFor="detalle-nombre" style={{
        display: 'block', fontFamily: 'var(--font-data)', fontSize: 'var(--text-2xs)',
        fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em',
        textTransform: 'uppercase', marginBottom: 6,
      }}>
        Nombre de la foto
      </label>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <input
          id="detalle-nombre" name="nombre-foto" type="text"
          value={valor} onChange={e => { setValor(e.target.value); setEstado(null); }}
          maxLength={NOMBRE_MAX} autoComplete="off" placeholder="Sin nombre"
          style={{
            flex: 1, minWidth: 0, padding: '8px 12px', background: 'var(--bg-inset)',
            border: '1px solid var(--border)', borderRadius: 7,
            color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)',
          }}
        />
        <button
          type="submit"
          disabled={sinCambios || guardando}
          style={{
            padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 7, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', fontWeight: 600,
            color: sinCambios || guardando ? 'var(--text-faint)' : 'var(--text-secondary)',
            cursor: sinCambios || guardando ? 'not-allowed' : 'pointer',
            opacity: sinCambios || guardando ? 0.5 : 1,
          }}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {estado && (
        <div role="status" style={{
          marginTop: 4, fontSize: 'var(--text-2xs)',
          color: estado.ok ? 'var(--text-muted)' : 'var(--accent-red)',
        }}>
          {estado.msg}
        </div>
      )}
    </form>
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
        transition: 'background var(--dur-fast) var(--ease-out)',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--text-faint)', fontSize: 11, fontFamily: 'var(--font-data)', letterSpacing: '0.08em' }}>
        {icon}
        {label.toUpperCase()}
      </div>
      <div style={{ fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
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
      <IconoError size={32} style={{ color: 'var(--text-faint)' }} />
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{mensaje}</div>
    </div>
  );
}
