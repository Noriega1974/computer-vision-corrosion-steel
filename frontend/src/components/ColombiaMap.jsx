import React, { useEffect, useRef } from 'react';
import { usePuntos } from '../hooks/usePuntos';
import { useMediciones } from '../hooks/useMediciones';
import { nivelColor, nivelToStatus, getStatusLabel } from '../lib/statusUtils';

// Construye un mapa {id_punto → nivel_corrosion_mas_reciente}
function buildNivelMap(mediciones) {
  const map = {};
  mediciones.forEach(m => {
    if (!(m.id_punto in map)) {
      map[m.id_punto] = m.nivel_corrosion ?? 0;
    }
  });
  return map;
}

export default function ColombiaMap({ selectedPunto, onSelectPunto }) {
  const { puntos, loading: loadingPuntos } = usePuntos();
  // 100 mediciones recientes para colorear marcadores
  const { mediciones } = useMediciones(100);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);
    mapInstanceRef.current = map;
  }, []);

  // Actualizar marcadores cuando cambian puntos o mediciones
  useEffect(() => {
    const L = window.L;
    if (!L || !mapInstanceRef.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (puntos.length === 0) return;

    const nivelMap = buildNivelMap(mediciones);

    puntos.forEach(punto => {
      const lat = punto.coordenadas?.lat;
      const lng = punto.coordenadas?.lng;
      if (!lat || !lng) return;

      const nivel = nivelMap[punto.id_punto] ?? -1; // -1 = sin datos
      const color = nivel >= 0 ? nivelColor(nivel) : '#64748b';
      const isSelected = selectedPunto?.id_punto === punto.id_punto;
      const isCritical = nivel === 3;
      const label = `${punto.sede} · ${punto.ciudad}`;

      const iconHtml = `
        <div style="position:relative;width:${isSelected ? 52 : 40}px;height:${isSelected ? 52 : 40}px;cursor:pointer;">
          ${isCritical ? `<div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${color};animation:ping-ring 1.4s ease-out infinite;"></div>` : ''}
          <div style="
            position:absolute;inset:${isSelected ? 2 : 4}px;border-radius:50%;
            background:rgba(8,12,15,0.9);border:2px solid ${color};
            display:flex;align-items:center;justify-content:center;
            box-shadow:0 0 ${isSelected ? 20 : 12}px ${color}60;
          ">
            <svg width="${isSelected ? 18 : 14}" height="${isSelected ? 18 : 14}" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${color}" opacity="0.9"/>
              <circle cx="12" cy="9" r="2.5" fill="#080c0f"/>
            </svg>
          </div>
          <div style="
            position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);
            background:rgba(8,12,15,0.95);border:1px solid ${color}60;
            padding:2px 6px;font-family:monospace;font-size:9px;color:${color};
            white-space:nowrap;letter-spacing:0.1em;
          ">${punto.sede}</div>
        </div>
      `;

      const icon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [isSelected ? 52 : 40, isSelected ? 52 : 40],
        iconAnchor: [isSelected ? 26 : 20, isSelected ? 26 : 20],
      });

      const nivelStr = nivel >= 0 ? getStatusLabel(nivelToStatus(nivel)) : 'Sin mediciones';
      const tooltipHtml = `
        <div style="background:#0d1419;border:1px solid ${color}60;padding:10px 14px;min-width:180px;font-family:monospace;font-size:11px;">
          <div style="color:${color};font-weight:700;font-size:13px;margin-bottom:4px;">${punto.sede}</div>
          <div style="color:#7a9ab5;font-size:9px;letter-spacing:0.1em;margin-bottom:8px;">${punto.ciudad} · ${punto.empresa}</div>
          <div style="display:flex;justify-content:space-between;color:#e2eaf2;">
            <span>Estado:</span>
            <span style="color:${color}">${nivelStr}</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#e2eaf2;margin-top:4px;">
            <span>Material:</span>
            <span>${punto.tipo_material ?? '—'}</span>
          </div>
        </div>
      `;

      const marker = L.marker([lat, lng], { icon })
        .addTo(mapInstanceRef.current)
        .on('click', () => onSelectPunto(punto));

      marker.bindTooltip(L.tooltip({
        direction: 'top', offset: [0, -24],
        className: 'custom-tooltip', permanent: false,
      }).setContent(tooltipHtml));

      markersRef.current.push(marker);
    });
  }, [puntos, mediciones, selectedPunto, onSelectPunto]);

  // Llevar el mapa hasta el punto seleccionado (ej. desde la lista de sedes)
  useEffect(() => {
    const lat = selectedPunto?.coordenadas?.lat;
    const lng = selectedPunto?.coordenadas?.lng;
    if (!mapInstanceRef.current || lat == null || lng == null) return;
    mapInstanceRef.current.flyTo([lat, lng], 13, { duration: 0.8 });
  }, [selectedPunto]);

  const puntosCount = puntos.length;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13,
            letterSpacing: '0.1em', color: 'var(--text-primary)',
          }}>MAPA DE PLANTAS — COLOMBIA</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 2 }}>
            {loadingPuntos ? 'Cargando…' : `${puntosCount} INSTALACIONES MONITOREADAS`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { color: '#64748b', label: 'Sin datos' },
            { color: '#16a34a', label: 'OK' },
            { color: '#d97706', label: 'Leve' },
            { color: '#ea580c', label: 'Moderada' },
            { color: '#dc2626', label: 'Severa' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color, letterSpacing: '0.1em' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
              {label.toUpperCase()}
            </div>
          ))}
        </div>
      </div>

      {/* Mapa o estado vacío */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {!loadingPuntos && puntosCount === 0 && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-inset)', gap: 10,
            zIndex: 500,
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" opacity="0.3">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="var(--text-muted)" strokeWidth="1.5"/>
            </svg>
            <div style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textAlign: 'center' }}>
              Sin plantas monitoreadas.<br />Sube tu primera medición.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
