import React, { useState, useEffect, useRef } from 'react';

// ─── Carga Leaflet vía CDN (mismo patrón que MapPicker.jsx / ColombiaMap.jsx) ──
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

const RADIO_DEFAULT_METROS = 150;

// ─── Dibujar el área de influencia de una empresa (Zona) ────────────────────
// A diferencia de MapPicker (un solo punto), acá se puede marcar VARIAS
// áreas -- una empresa puede tener el campus partido por calles en varias
// "manchas" separadas, no un único polígono. Cada zona es un círculo
// {lat, lng, radio_metros}; el radio se ajusta con el input numérico de la
// lista de abajo, no arrastrando en el mapa (más simple y menos frágil de
// tocar en pantallas chicas). Clic en el mapa agrega una zona nueva en ese
// punto con el radio por defecto.
// `puntoReferencia` ({lat,lng}, opcional): si viene, el mapa arranca
// centrado y con zoom ahí (en vez del centro genérico de Colombia) y
// muestra un marcador de referencia -- así el usuario ve enseguida que esa
// es la coordenada elegida antes de ponerse a dibujar zonas alrededor.
export default function ZonaMapPicker({ zonas = [], onChange, puntoReferencia = null }) {
  const mapRef = useRef(null);
  const instanceRef = useRef(null);
  const circulosRef = useRef([]); // paralelo a `zonas`, un L.circle por índice
  const referenciaRef = useRef(null);
  const leafletReady = useLeaflet();
  const zonasRef = useRef(zonas);
  zonasRef.current = zonas;

  // Inicializar el mapa una sola vez.
  useEffect(() => {
    if (!leafletReady || instanceRef.current) return;
    const L = window.L;
    const centro = puntoReferencia ? [puntoReferencia.lat, puntoReferencia.lng] : [6.5, -74.5];
    const map = L.map(mapRef.current, {
      center: centro, zoom: puntoReferencia ? 13 : 5,
      zoomControl: true, scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18,
    }).addTo(map);
    map.on('click', e => {
      const { lat, lng } = e.latlng;
      onChange([
        ...zonasRef.current,
        { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)), radio_metros: RADIO_DEFAULT_METROS },
      ]);
    });
    instanceRef.current = map;

    if (puntoReferencia) {
      referenciaRef.current = L.marker(centro, {
        icon: L.divIcon({
          html: `<div style="width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid white;box-shadow:0 0 6px #2563eb80;"></div>`,
          className: '', iconSize: [12, 12], iconAnchor: [6, 6],
        }),
      }).addTo(map).bindTooltip('Ubicación de referencia', { sticky: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady]);

  // Redibujar los círculos cuando cambia la lista de zonas (agregar, borrar,
  // cambiar radio). Se recrean todos en vez de tratar de diffear -- la
  // cantidad esperada es chica (unas pocas manchas por empresa).
  useEffect(() => {
    const L = window.L;
    if (!L || !instanceRef.current) return;

    circulosRef.current.forEach(c => c.remove());
    circulosRef.current = zonas.map((zona, i) => {
      const circle = L.circle([zona.lat, zona.lng], {
        radius: zona.radio_metros,
        color: '#C1460B',
        weight: 2,
        fillColor: '#C1460B',
        fillOpacity: 0.15,
      }).addTo(instanceRef.current);
      circle.bindTooltip(`Zona ${i + 1}`, { sticky: true });
      return circle;
    });

    if (zonas.length > 0) {
      const grupo = L.featureGroup(circulosRef.current);
      instanceRef.current.fitBounds(grupo.getBounds().pad(0.3), { maxZoom: 14 });
    }
  }, [zonas]);

  const actualizarRadio = (i, radio_metros) => {
    const copia = [...zonas];
    copia[i] = { ...copia[i], radio_metros };
    onChange(copia);
  };

  const eliminarZona = (i) => {
    onChange(zonas.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      <div ref={mapRef} style={{
        height: 340, borderRadius: 8, border: '1px solid var(--border)',
        overflow: 'hidden',
      }} />
      <div style={{ marginTop: 6, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
        Haz clic en el mapa para agregar una zona. Si el área está dividida por calles, podés agregar varias zonas separadas en vez de una sola grande.
      </div>

      {zonas.length > 0 && (
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {zonas.map((zona, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              padding: '7px 10px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 7,
            }}>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
                Zona {i + 1}
              </span>
              <input
                type="number" min="10" step="10" value={zona.radio_metros}
                onChange={e => actualizarRadio(i, Number(e.target.value) || RADIO_DEFAULT_METROS)}
                style={{
                  width: 80, padding: '4px 8px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-inset)',
                  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)',
                }}
              />
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>metros de radio</span>
              <button
                type="button" onClick={() => eliminarZona(i)}
                style={{
                  marginLeft: 'auto', padding: '4px 8px', background: 'transparent',
                  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                  color: '#dc2626', fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-ui)',
                }}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
