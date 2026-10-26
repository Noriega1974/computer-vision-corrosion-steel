import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Upload, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';

import KPIBar from '../components/KPIBar';
import ColombiaMap from '../components/ColombiaMap';
import PlantDetail from '../components/PlantDetail';
import PlantsTable from '../components/PlantsTable';
import ChartsRow from '../components/ChartsRow';

import { useBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';
import { useAuth } from '../auth/AuthContext';


// ================================================================
// LEAFLET
// ================================================================

function useLeaflet() {

  const [ready, setReady] = useState(
    !!window.L
  );

  useEffect(() => {

    if (window.L) {
      setReady(true);
      return;
    }

    const script =
      document.createElement('script');

    script.src =
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

    script.onload = () =>
      setReady(true);

    document.head.appendChild(script);

  }, []);

  return ready;
}


// ================================================================
// DASHBOARD
// ================================================================

export default function DashboardPage() {
  const [selectedPunto, setSelectedPunto] = useState(null);
  const [selectedZona, setSelectedZona] = useState(null);
  const [showAnalisis, setShowAnalisis] = useState(false);

  const leafletReady = useLeaflet();
  const { user } = useAuth();
  const esSuperAdmin = user?.groups?.includes('super_admin');
  const { empresas } = useEmpresas(esSuperAdmin);

  // "puntos" aquí son bloques (el "Punto" viejo fue absorbido por "Bloque",
  // ver hooks/useBloques.js) -- se mantiene el nombre de variable para no
  // tocar el resto del layout de este componente.
  const {
    bloques: puntos,
    loading: loadingPuntos,
    error: errorPuntos
  } = useBloques();

  // "Ver punto en dashboard" (MedicionDetailPage) navega a /dashboard?punto=X
  // -- nadie leía ese parámetro. Selecciona el punto apenas carga la lista.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const idPunto = searchParams.get('punto');
    if (!idPunto || puntos.length === 0) return;
    const match = puntos.find(p => p.id_bloque === idPunto);
    if (match) setSelectedPunto(match);
  }, [searchParams, puntos]);


  return (

    <div
      className="dashboard-shell"
      style={{
        minHeight: '100%',
        padding: '22px',
      }}
    >

      {/* ==========================================================
          DASHBOARD CONTENT
          ========================================================== */}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          width: '100%',
        }}
      >


        {/* ========================================================
            KPI SECTION
            ======================================================== */}

        <section
          className="dashboard-section section-kpi"
          style={{
            padding: '18px 20px 20px',
          }}
        >

          {/* Header */}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
              marginBottom: 'var(--space-4)',
            }}
          >

            <div>

              <div
                className="dashboard-section-title"
              >
                Indicadores globales
              </div>

              <div
                style={{
                  marginTop: 5,
                  fontSize: 'var(--text-2xs)',
                  color: 'var(--text-faint)',
                }}
              >
                Estado general del sistema de monitoreo
              </div>

            </div>


            {/* Nueva medición */}

            <Link
              to="/upload"
              className="dashboard-action"
            >

              <Upload size={14} />

              Nueva medida

            </Link>

          </div>


          {/* KPI cards */}

          <KPIBar />

        </section>



        {/* ========================================================
            ZONAS/PUNTOS + MAPA + DETALLE
            Con 3 columnas tienen la misma altura exacta (480px); por debajo de 1280px ver index.css
            con scroll interno independiente.
            ======================================================== */}

        <div
          className="main-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(250px, 0.85fr) minmax(0, 2.1fr) minmax(320px, 1.05fr)',
            gap: 18,
            height: 'clamp(480px, 56vh, 720px)',
          }}
        >
          {/* ======================================================
              ZONAS Y PUNTOS (DESPLEGABLE JERÁRQUICO)
              ====================================================== */}
          <section
            className="dashboard-section section-plants"
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <PlantsTable
                puntos={puntos}
                loading={loadingPuntos}
                error={errorPuntos}
                selectedPunto={selectedPunto}
                onSelectPunto={setSelectedPunto}
                empresas={empresas}
                selectedZona={selectedZona}
                onSelectZona={setSelectedZona}
              />
            </div>
          </section>

          {/* ======================================================
              MAPA DE UBICACIONES
              ====================================================== */}
          <section
            className="dashboard-section section-map"
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2-5)',
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-2-5)',
                flexShrink: 0,
              }}
            >
              <div className="dashboard-section-title">
                Mapa de ubicaciones
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  color: 'var(--text-faint)',
                  textTransform: 'uppercase',
                }}
              >
                {puntos?.length ?? 0} ubicaciones
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                background: 'var(--bg-inset)',
              }}
            >
              {leafletReady ? (
                <ColombiaMap
                  selectedPunto={selectedPunto}
                  onSelectPunto={setSelectedPunto}
                  selectedZona={selectedZona}
                />
              ) : (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  Cargando mapa…
                </div>
              )}
            </div>
          </section>

          {/* ======================================================
              DETALLE DE UBICACIÓN
              ====================================================== */}
          <section
            className="dashboard-section section-detail"
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2-5)',
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div
              className="dashboard-section-title"
              style={{ flexShrink: 0 }}
            >
              Detalle de ubicación
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <PlantDetail punto={selectedPunto} />
            </div>
          </section>
        </div>

        {/* ========================================================
            ANÁLISIS Y MÉTRICAS (DESPLEGABLE / EN DESARROLLO)
            ======================================================== */}
        <section
          className="dashboard-section section-charts"
          style={{
            padding: 0,
            overflow: 'hidden',
            borderRadius: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setShowAnalisis(s => !s)}
            style={{
              width: '100%',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: showAnalisis ? 'var(--bg-inset)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              textAlign: 'left',
              transition: 'background-color 0.15s ease',
            }}
          >
            <div>
              <div
                className="dashboard-section-title"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <BarChart3 size={16} /> Análisis y métricas avanzadas (en desarrollo)
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 'var(--text-2xs)',
                  color: 'var(--text-faint)',
                }}
              >
                Comportamiento y distribución de la corrosión por ciudad y severidad
              </div>
            </div>
            {showAnalisis ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showAnalisis && (
            <div style={{ padding: '18px 20px 20px', borderTop: '1px solid var(--border)' }}>
              <ChartsRow />
            </div>
          )}
        </section>



        {/* ========================================================
            FOOTER
            ======================================================== */}

        <footer
          style={{
            display: 'flex',

            alignItems: 'center',
            justifyContent: 'space-between',

            flexWrap: 'wrap',

            gap: 'var(--space-2)',

            padding:
              '12px 6px 4px',

            fontSize: 'var(--text-3xs)',

            color:
              'var(--text-faint)',

            fontFamily:
              'var(--font-data)',

            letterSpacing:
              '0.02em',
          }}
        >

          <span>
            Corrosion Detection System © 2026
          </span>

          <span>
            Uninorte · Ing. Electrónica
          </span>

          <Link
            to="/privacidad"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            Qué datos guardamos
          </Link>

        </footer>

      </div>

    </div>
  );
}