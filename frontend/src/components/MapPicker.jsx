import React, { useState, useEffect, useRef } from 'react';

// ─── Carga Leaflet vía CDN (mismo patrón que ColombiaMap.jsx / MedicionDetailPage.jsx) ──
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

// ─── Picker de coordenadas en mapa Leaflet ───────────────────────────────────
// Extraído de UploadPage.jsx (donde vivía inline para fijar la ubicación de
// una planta/coordenadas libres al subir una medición). Ahora un punto ya
// tiene su ubicación fija de antes, así que este picker se usa al
// crear/editar un punto (BloquesPage), no al subir una medición.
export default function MapPicker({ lat, lng, onChange }) {
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
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#C1460B;border:2px solid white;box-shadow:0 0 8px #C1460B80;"></div>`,
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
      <div style={{ marginTop: 6, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
        {lat && lng
          ? `📍 ${lat}, ${lng} — Haz clic para mover`
          : 'Haz clic en el mapa para marcar la ubicación'}
      </div>
    </div>
  );
}
