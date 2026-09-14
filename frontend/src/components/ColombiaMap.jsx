import React, { useEffect, useRef, useState } from 'react';
import { useBloques } from '../hooks/useBloques';
import { useMediciones } from '../hooks/useMediciones';
import { useEmpresas } from '../hooks/useEmpresas';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth } from '../auth/AuthContext';
import {
  nivelColor,
  nivelToStatus,
  getStatusLabel
} from '../lib/statusUtils';

// Construye un mapa {id_bloque → nivel_corrosion_mas_reciente}. El "Punto"
// viejo fue absorbido por el "Bloque"; cada medición trae `bloque_id`.
function buildNivelMap(mediciones) {
  const map = {};

  mediciones.forEach(m => {
    if (!(m.bloque_id in map)) {
      map[m.bloque_id] = m.nivel_corrosion ?? 0;
    }
  });

  return map;
}

// Tamaño "fijo en el mundo": antes el pin media 40px (52px seleccionado) en
// TODOS los zooms -- gigante y sin relación con el nivel de acercamiento,
// como si fuera un elemento de UI en vez de un objeto sobre el mapa. Ahora
// el tamaño base es más chico y escala geométricamente con el zoom (cada
// nivel de zoom multiplica el tamaño), acotado entre MIN/MAX_ESCALA para que
// no desaparezca al alejar del todo ni tape el mapa al acercar al máximo.
// El factor/tope anteriores (1.16 y 2.1x) saturaban el tope de crecimiento
// apenas 5 niveles de zoom por encima del base -- es decir, desde "vista de
// ciudad" en adelante el pin YA estaba en su tamaño máximo (26px -> 55px,
// 34px -> 71px seleccionado), por eso se veían gigantes y se pisaban entre
// sí al acercar a nivel de calle/cuadra. El crecimiento ahora es más lento
// y el tope mucho más bajo, para que nunca deje de verse como un pin y
// empiece a tapar el mapa.
const ZOOM_BASE = 6; // mismo zoom inicial del mapa -- ahí la escala es 1x
const FACTOR_POR_NIVEL = 1.10;
const MIN_ESCALA = 0.6;
const MAX_ESCALA = 1.35;
const TAMANO_BASE = 22;
const TAMANO_BASE_SELECCIONADO = 28;

function escalaParaZoom(zoom) {
  const cruda = Math.pow(FACTOR_POR_NIVEL, zoom - ZOOM_BASE);
  return Math.min(MAX_ESCALA, Math.max(MIN_ESCALA, cruda));
}

export default function ColombiaMap({
  selectedPunto,
  onSelectPunto,
  selectedZona,
}) {
  const {
    bloques: puntos,
    loading: loadingPuntos
  } = useBloques();

  const { mediciones } = useMediciones(100);

  // Zonas de empresa (polígonos que delimitan su área en el mapa). Para
  // super_admin vienen de GET /empresas (todas). Para admin/tecnico/cliente
  // ese endpoint es exclusivo de super_admin, así que se arma un array de
  // una sola "empresa" con la zona propia expuesta en GET /usuarios/me
  // (`empresa_zonas`, ver commit del botón "Centrar en mi zona") -- mismo
  // shape ({nombre, zonas}) para que el efecto de dibujo de abajo no tenga
  // que distinguir el caso.
  const { user } = useAuth();
  const esSuperAdmin = user?.groups?.includes('super_admin');
  const { empresas: empresasTodas } = useEmpresas(esSuperAdmin);
  const { perfil } = useUsuarioPerfil();

  const empresas = esSuperAdmin
    ? empresasTodas
    : (perfil?.empresa_zonas?.length
        ? [{ id_empresa: 'propia', nombre: perfil.empresa_nombre, zonas: perfil.empresa_zonas }]
        : []);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const zonasRef = useRef([]);

  // Nivel de zoom actual -- se usa para recalcular el tamaño de los pines
  // "a tamaño fijo en el mundo" (ver escalaParaZoom más arriba).
  const [zoom, setZoom] = useState(6);

  // Inicializar mapa Leaflet una sola vez
  useEffect(() => {
    if (mapInstanceRef.current) return;

    const L = window.L;
    if (!L) return;

    const map = L.map(mapRef.current, {
      center: [6.5, -74.5],
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }
    ).addTo(map);

    map.on('zoomend', () => setZoom(map.getZoom()));

    mapInstanceRef.current = map;
  }, []);

  // Actualizar marcadores
  useEffect(() => {
    const L = window.L;

    if (!L || !mapInstanceRef.current) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (puntos.length === 0) return;

    const nivelMap = buildNivelMap(mediciones);

    puntos.forEach((punto, index) => {
      const lat = punto.coordenadas?.lat;
      const lng = punto.coordenadas?.lng;

      if (lat == null || lng == null) return;

      const nivel = nivelMap[punto.id_bloque] ?? -1;

      const color =
        nivel >= 0
          ? nivelColor(nivel)
          : '#64748b';

      const isSelected =
        selectedPunto?.id_bloque === punto.id_bloque;

      const isCritical = nivel === 3;

      // Tamaño escalado por zoom (ver escalaParaZoom) en vez de fijo en
      // pantalla -- el pin se ve más chico al alejar y más grande al
      // acercar, como un objeto real sobre el mapa.
      const escala = escalaParaZoom(zoom);
      const tamano = Math.round((isSelected ? TAMANO_BASE_SELECCIONADO : TAMANO_BASE) * escala);
      const anilloInset = Math.max(1, Math.round((isSelected ? 2 : 3) * escala));
      const svgSize = Math.round((isSelected ? 12 : 9) * escala);
      const glow = Math.round((isSelected ? 13 : 8) * escala);

      const iconHtml = `
        <div style="
          position:relative;
          width:${tamano}px;
          height:${tamano}px;
          cursor:pointer;
        ">

          ${
            isCritical
              ? `
                <div style="
                  position:absolute;
                  inset:0;
                  border-radius:50%;
                  border:2px solid ${color};
                  animation:ping-ring 1.4s ease-out infinite;
                "></div>
              `
              : ''
          }

          <div style="
            position:absolute;
            inset:${anilloInset}px;
            border-radius:50%;
            background:rgba(8,12,15,0.9);
            border:2px solid ${color};
            display:flex;
            align-items:center;
            justify-content:center;
            box-shadow:0 0 ${glow}px ${color}60;
          ">

            <svg
              width="${svgSize}"
              height="${svgSize}"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                fill="${color}"
                opacity="0.9"
              />

              <circle
                cx="12"
                cy="9"
                r="2.5"
                fill="#080c0f"
              />
            </svg>
          </div>
        </div>
      `;

      const icon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [tamano, tamano],
        iconAnchor: [tamano / 2, tamano / 2],
      });

      const nivelStr =
        nivel >= 0
          ? getStatusLabel(nivelToStatus(nivel))
          : 'Sin mediciones';

      const ciudad =
        punto.ciudad ?? 'Ubicación registrada';

      const tooltipHtml = `
        <div style="
          background:#0d1419;
          border:1px solid ${color}60;
          padding:10px 14px;
          min-width:180px;
          font-family:monospace;
          font-size:11px;
        ">

          <div style="
            color:${color};
            font-weight:700;
            font-size:13px;
            margin-bottom:4px;
          ">
            Ubicación ${index + 1}
          </div>

          <div style="
            color:#7a9ab5;
            font-size:9px;
            letter-spacing:0.1em;
            margin-bottom:8px;
          ">
            ${ciudad}
          </div>

          <div style="
            display:flex;
            justify-content:space-between;
            color:#e2eaf2;
          ">
            <span>Estado:</span>
            <span style="color:${color}">
              ${nivelStr}
            </span>
          </div>

          <div style="
            display:flex;
            justify-content:space-between;
            color:#e2eaf2;
            margin-top:4px;
          ">
            <span>Estructura:</span>
            <span>
              ${punto.tipo_estructura ?? '—'}
            </span>
          </div>

        </div>
      `;

      const marker = L.marker(
        [lat, lng],
        { icon }
      )
        .addTo(mapInstanceRef.current)
        .on('click', () => onSelectPunto(punto));

      marker.bindTooltip(
        L.tooltip({
          direction: 'top',
          offset: [0, -24],
          className: 'custom-tooltip',
          permanent: false,
        }).setContent(tooltipHtml)
      );

      markersRef.current.push(marker);
    });
  }, [
    puntos,
    mediciones,
    selectedPunto,
    onSelectPunto,
    zoom
  ]);

  // Zonas de empresa: un polígono por cada {puntos: [{lat,lng}, ...]}
  // declarado en `empresas[].zonas` -- sin pin, solo el área con un tooltip
  // mostrando el nombre de la empresa al pasar el mouse.
  useEffect(() => {
    const L = window.L;
    if (!L || !mapInstanceRef.current) return;

    zonasRef.current.forEach(poligono => poligono.remove());
    zonasRef.current = [];

    empresas.forEach(empresa => {
      (empresa.zonas ?? []).forEach(zona => {
        if (!Array.isArray(zona?.puntos) || zona.puntos.length < 3) return;

        const poligono = L.polygon(zona.puntos.map(p => [p.lat, p.lng]), {
          color: '#00b9ff',
          weight: 1.5,
          fillColor: '#00b9ff',
          fillOpacity: 0.06,
        }).addTo(mapInstanceRef.current);

        poligono.bindTooltip(empresa.nombre, { sticky: true });

        zonasRef.current.push(poligono);
      });
    });
  }, [empresas]);

  // Llevar el mapa hasta la ubicación seleccionada
  useEffect(() => {
    const lat = selectedPunto?.coordenadas?.lat;
    const lng = selectedPunto?.coordenadas?.lng;

    if (
      !mapInstanceRef.current ||
      lat == null ||
      lng == null
    ) {
      return;
    }

    mapInstanceRef.current.flyTo(
      [lat, lng],
      13,
      { duration: 0.8 }
    );
  }, [selectedPunto]);

  // Centrar el mapa en una afiliación elegida desde ZonasList -- encuadra
  // TODAS sus zonas juntas (una empresa puede tener varias manchas).
  useEffect(() => {
    const L = window.L;
    const zonas = selectedZona?.zonas ?? [];
    if (!L || !mapInstanceRef.current || zonas.length === 0) return;
    const poligonos = zonas
      .filter(z => z.puntos?.length >= 3)
      .map(z => L.polygon(z.puntos.map(p => [p.lat, p.lng])));
    if (poligonos.length === 0) return;
    const bounds = L.featureGroup(poligonos).getBounds();
    mapInstanceRef.current.flyToBounds(bounds, { padding: [40, 40], duration: 0.8 });
  }, [selectedZona]);

  const puntosCount = puntos.length;
  // El cartel de "sin ubicaciones" tapaba el mapa entero (zIndex sobre el
  // mapa) aunque ya hubiera una zona dibujada -- ahora solo aparece si
  // tampoco hay ninguna zona que mostrar.
  const hayZonas = empresas.some(e => (e.zonas ?? []).length > 0);

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >

      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >

        <div>

          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: 'var(--text-sm)',
              letterSpacing: '0.1em',
              color: 'var(--text-primary)',
            }}
          >
            MAPA DE UBICACIONES
          </div>

          <div
            style={{
              fontSize: 'var(--text-3xs)',
              color: 'var(--text-muted)',
              letterSpacing: '0.1em',
              marginTop: 2
            }}
          >
            {loadingPuntos
              ? 'Cargando…'
              : `${puntosCount} UBICACIONES REGISTRADAS`
            }
          </div>

        </div>

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)'
          }}
        >

          {[
  { color: '#16a34a', label: 'Sin corrosión' },
  { color: '#d97706', label: 'Leve' },
  { color: '#ea580c', label: 'Moderada' },
  { color: '#dc2626', label: 'Severa' },
].map(({ color, label }) => ( 

            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                fontSize: 9,
                color,
                letterSpacing: '0.1em'
              }}
            >

              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0
                }}
              />

              {label.toUpperCase()}

            </div>

          ))}

        </div>

      </div>

      {/* Mapa */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative'
        }}
      >

        <div
          ref={mapRef}
          style={{
            width: '100%',
            height: '100%'
          }}
        />

        {!loadingPuntos && puntosCount === 0 && !hayZonas && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-inset)',
              gap: 'var(--space-2-5)',
              zIndex: 500,
            }}
          >

            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              opacity="0.3"
            >
              <path
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                stroke="var(--text-muted)"
                strokeWidth="1.5"
              />
            </svg>

            <div
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--text-2xs)',
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
                textAlign: 'center'
              }}
            >
              Sin ubicaciones registradas.
              <br />
              Sube tu primera medición.
            </div>

          </div>
        )}

      </div>

    </div>
  );
}