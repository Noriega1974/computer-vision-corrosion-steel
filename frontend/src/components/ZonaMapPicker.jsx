import React, { useState, useEffect, useRef } from 'react';

// Carga Leaflet vía CDN (mismo patrón que MapPicker/ColombiaMap).
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

const MIN_PUNTOS = 3;

const btnStyle = {
  padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)',
  cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-2xs)',
};

// Dibujar el área de una empresa como uno o más polígonos. Cada zona es
// {puntos: [{lat,lng}, ...]} -- clic en el mapa agrega vértices, "Confirmar
// zona" cierra el polígono actual. Varias zonas separadas son posibles
// (campus partido por calles).
export default function ZonaMapPicker({ zonas = [], onChange, puntoReferencia = null }) {
  const mapRef = useRef(null);
  const instanceRef = useRef(null);
  const poligonosRef = useRef([]);
  const previewRef = useRef(null);
  const referenciaRef = useRef(null);
  const leafletReady = useLeaflet();

  const [dibujando, setDibujando] = useState(false);
  const [puntosActuales, setPuntosActuales] = useState([]);
  const dibujandoRef = useRef(dibujando);
  const puntosActualesRef = useRef(puntosActuales);
  dibujandoRef.current = dibujando;
  puntosActualesRef.current = puntosActuales;

  // Mapa una sola vez.
  useEffect(() => {
    if (!leafletReady || instanceRef.current) return;
    const L = window.L;
    const centro = puntoReferencia ? [puntoReferencia.lat, puntoReferencia.lng] : [6.5, -74.5];
    const map = L.map(mapRef.current, {
      center: centro, zoom: puntoReferencia ? 15 : 5,
      zoomControl: true, scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18,
    }).addTo(map);

    // Solo agrega vértices en modo dibujo.
    map.on('click', e => {
      if (!dibujandoRef.current) return;
      const { lat, lng } = e.latlng;
      setPuntosActuales([...puntosActualesRef.current, { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) }]);
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

  // Redibuja las zonas ya confirmadas.
  useEffect(() => {
    const L = window.L;
    if (!L || !instanceRef.current) return;
    poligonosRef.current.forEach(p => p.remove());
    poligonosRef.current = zonas.map((zona, i) => {
      const latlngs = zona.puntos.map(p => [p.lat, p.lng]);
      const poligono = L.polygon(latlngs, {
        color: '#C1460B', weight: 2, fillColor: '#C1460B', fillOpacity: 0.15,
      }).addTo(instanceRef.current);
      poligono.bindTooltip(`Zona ${i + 1}`, { sticky: true });
      return poligono;
    });
  }, [zonas]);

  // Redibuja el trazo en progreso mientras se dibuja.
  useEffect(() => {
    const L = window.L;
    if (!L || !instanceRef.current) return;
    if (previewRef.current) { previewRef.current.remove(); previewRef.current = null; }
    if (puntosActuales.length === 0) return;
    const latlngs = puntosActuales.map(p => [p.lat, p.lng]);
    previewRef.current = (
      puntosActuales.length >= 2
        ? L.polyline(latlngs, { color: '#2563eb', weight: 2, dashArray: '6 4' })
        : L.circleMarker(latlngs[0], { radius: 4, color: '#2563eb' })
    ).addTo(instanceRef.current);
  }, [puntosActuales]);

  const centrar = () => {
    if (!puntoReferencia || !instanceRef.current) return;
    instanceRef.current.setView([puntoReferencia.lat, puntoReferencia.lng], 15);
  };

  const iniciarDibujo = () => { setPuntosActuales([]); setDibujando(true); };
  const cancelarDibujo = () => { setPuntosActuales([]); setDibujando(false); };
  const confirmarZona = () => {
    onChange([...zonas, { puntos: puntosActuales }]);
    setPuntosActuales([]);
    setDibujando(false);
  };
  const quitarZona = (i) => onChange(zonas.filter((_, idx) => idx !== i));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button
          type="button" onClick={centrar} disabled={!puntoReferencia}
          style={{ ...btnStyle, background: 'var(--bg-inset)', color: 'var(--text-muted)', opacity: puntoReferencia ? 1 : 0.5 }}
        >
          Centrar
        </button>
        {!dibujando ? (
          <button type="button" onClick={iniciarDibujo} style={{ ...btnStyle, background: 'var(--bg-inset)', color: 'var(--accent-amber)' }}>
            Dibujar zona
          </button>
        ) : (
          <>
            <button type="button" onClick={cancelarDibujo} style={{ ...btnStyle, background: 'var(--bg-inset)', color: 'var(--text-muted)' }}>
              Cancelar
            </button>
            <button
              type="button" onClick={confirmarZona} disabled={puntosActuales.length < MIN_PUNTOS}
              style={{ ...btnStyle, background: '#16a34a', color: 'white', border: 'none', opacity: puntosActuales.length < MIN_PUNTOS ? 0.5 : 1 }}
            >
              Confirmar zona ✓
            </button>
          </>
        )}
      </div>

      <div ref={mapRef} style={{ height: 340, borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }} />

      <div style={{ marginTop: 6, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
        {dibujando
          ? `Hacé clic para agregar puntos (${puntosActuales.length}${puntosActuales.length < MIN_PUNTOS ? `, mínimo ${MIN_PUNTOS}` : ''}).`
          : 'Tocá "Dibujar zona" y marcá los puntos del área en el mapa.'}
      </div>

      {zonas.length > 0 && (
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {zonas.map((zona, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              padding: '7px 10px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 7,
            }}>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                Zona {i + 1} · {zona.puntos.length} puntos
              </span>
              <button
                type="button" onClick={() => quitarZona(i)}
                style={{ marginLeft: 'auto', padding: '4px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: '#dc2626', fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-ui)' }}
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
