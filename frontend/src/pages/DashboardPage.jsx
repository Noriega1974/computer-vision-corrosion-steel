import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';
import KPIBar from '../components/KPIBar';
import ColombiaMap from '../components/ColombiaMap';
import PlantDetail from '../components/PlantDetail';
import PlantsTable from '../components/PlantsTable';
import ChartsRow from '../components/ChartsRow';
import { usePuntos } from '../hooks/usePuntos';

// Leaflet vía CDN — compartido con ColombiaMap
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

export default function DashboardPage() {
  const [selectedPunto, setSelectedPunto] = useState(null);
  const leafletReady = useLeaflet();
  const { puntos, loading: loadingPuntos, error: errorPuntos } = usePuntos();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* ── KPI BAR ─── */}
      <div className="section-kpi" style={{ borderBottom: '1px solid var(--border)', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
          <div style={{
            fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600,
            color: 'var(--text-faint)', letterSpacing: '0.14em', textTransform: 'uppercase',
            paddingTop: 2,
          }}>
            Indicadores globales
          </div>
          {/* Acceso rápido a nueva medición */}
          <Link
            to="/upload"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', background: 'var(--accent-amber)',
              border: 'none', borderRadius: 8, textDecoration: 'none',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'white',
              flexShrink: 0, boxShadow: '0 2px 8px rgba(20,50,163,0.3)',
            }}
          >
            <Upload size={14} />
            Nueva medición
          </Link>
        </div>
        <KPIBar />
      </div>

      {/* ── MAIN PANEL ─── */}
      <div
        className="main-grid"
        style={{
          display: 'grid', gridTemplateColumns: '1fr 340px',
          gap: 0, height: 540, minHeight: 0,
        }}
      >
        {/* Columna izquierda: mapa + detalle de planta */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 320px',
          borderRight: '1px solid var(--border)', height: '100%', minHeight: 0,
        }}>
          {/* Mapa */}
          <div className="section-map" style={{
            borderRight: '1px solid var(--border)', padding: '16px',
            display: 'flex', flexDirection: 'column', gap: 8,
            height: '100%', minHeight: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ background: 'var(--accent-blue)', width: 3, height: 16, borderRadius: 2, display: 'inline-block' }} />
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Mapa de instalaciones
              </span>
            </div>

            {/* Lista rápida de sedes — evita buscar el punto a mano en el mapa */}
            {puntos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
                {puntos.map(p => {
                  const isSelected = selectedPunto?.id_punto === p.id_punto;
                  return (
                    <button
                      key={p.id_punto}
                      onClick={() => setSelectedPunto(p)}
                      style={{
                        padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                        fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
                        border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                        background: isSelected ? 'var(--accent-blue)' : 'var(--bg-card)',
                        color: isSelected ? 'white' : 'var(--text-muted)',
                      }}
                    >
                      {p.sede || p.clave_logica || p.id_punto}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ flex: 1, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', minHeight: 0 }}>
              {leafletReady ? (
                <ColombiaMap selectedPunto={selectedPunto} onSelectPunto={setSelectedPunto} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Cargando mapa…
                </div>
              )}
            </div>
          </div>

          {/* Detalle de planta */}
          <div className="section-detail" style={{
            padding: '16px', display: 'flex', flexDirection: 'column',
            gap: 8, height: '100%', minHeight: 0, overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ background: 'var(--accent-amber)', width: 3, height: 16, borderRadius: 2, display: 'inline-block' }} />
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Detalle de planta
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              <PlantDetail punto={selectedPunto} />
            </div>
          </div>
        </div>

        {/* Plantas */}
        <div className="section-plants" style={{
          padding: '16px', display: 'flex', flexDirection: 'column',
          gap: 8, height: '100%', minHeight: 0, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ background: 'var(--accent-blue)', width: 3, height: 16, borderRadius: 2, display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Plantas
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <PlantsTable
              puntos={puntos}
              loading={loadingPuntos}
              error={errorPuntos}
              selectedPunto={selectedPunto}
              onSelectPunto={setSelectedPunto}
            />
          </div>
        </div>
      </div>

      {/* ── CHARTS ROW ─── */}
      <div className="section-charts" style={{ borderTop: '2px solid var(--border)', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ background: 'var(--accent-green)', width: 3, height: 16, borderRadius: 2, display: 'inline-block' }} />
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Análisis y métricas
          </span>
        </div>
        <ChartsRow />
      </div>

      {/* ── FOOTER ─── */}
      <div style={{
        background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
        padding: '12px 20px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-data)',
      }}>
        <span>Corrosion Detection System © 2026</span>
        <span>Uninorte · Ing. Mecánica &amp; Electrónica</span>
        <span>YOLOv8 Transfer Learning · ASTM B117</span>
      </div>
    </div>
  );
}
