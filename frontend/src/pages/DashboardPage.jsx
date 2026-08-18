import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';

import KPIBar from '../components/KPIBar';
import ColombiaMap from '../components/ColombiaMap';
import PlantDetail from '../components/PlantDetail';
import PlantsTable from '../components/PlantsTable';
import ChartsRow from '../components/ChartsRow';

import { usePuntos } from '../hooks/usePuntos';


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

  const [
    selectedPunto,
    setSelectedPunto
  ] = useState(null);

  const leafletReady =
    useLeaflet();

  const {
    puntos,
    loading: loadingPuntos,
    error: errorPuntos
  } = usePuntos();


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
          maxWidth: 1800,
          margin: '0 auto',
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
            PLANTAS + MAP + DETAIL

            Las tres columnas son la misma tarea: elegir una planta,
            ubicarla y leer su detalle. Estaban partidas en dos filas,
            con la lista debajo del mapa, asi que seleccionar obligaba a
            bajar y volver a subir. El mapa manda al centro por ser el
            unico que necesita ancho real.
            ======================================================== */}

        <div
          className="main-grid"
          style={{
            display: 'grid',

            gridTemplateColumns:
              'minmax(210px, 0.8fr) minmax(0, 2fr) minmax(320px, 1fr)',

            gap: 18,

            minHeight: 0,
          }}
        >


          {/* ======================================================
              PLANTAS
              ====================================================== */}

          <section
            className="dashboard-section section-plants"
            style={{
              padding: '18px',

              display: 'flex',
              flexDirection: 'column',

              gap: 'var(--space-3)',

              minHeight: 430,

              overflow: 'hidden',
            }}
          >

            {/* Title */}

            <div style={{ flexShrink: 0 }}>

              <div className="dashboard-section-title">
                Plantas
              </div>

              <div
                style={{
                  marginTop: 5,

                  fontSize: 'var(--text-2xs)',

                  color: 'var(--text-faint)',
                }}
              >
                Seleccioná una para ver su detalle
              </div>

            </div>


            {/* Table */}

            <div
              style={{
                flex: 1,

                minHeight: 0,

                overflow: 'auto',

                paddingRight: 2,
              }}
            >

              <PlantsTable
                puntos={puntos}
                loading={loadingPuntos}
                error={errorPuntos}
                selectedPunto={selectedPunto}
                onSelectPunto={setSelectedPunto}
              />

            </div>

          </section>


          {/* ======================================================
              MAP
              ====================================================== */}

          <section
            className="dashboard-section section-map"
            style={{
              padding: '18px',

              display: 'flex',
              flexDirection: 'column',

              gap: 'var(--space-3)',

              minHeight: 430,
            }}
          >

            {/* Title */}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',

                gap: 'var(--space-2-5)',

                flexShrink: 0,
              }}
            >

              <div
                className="dashboard-section-title"
              >
                Mapa de ubicaciones
              </div>


              <div
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  color: 'var(--text-faint)',
                  textTransform: 'uppercase',
                }}
              >
                {puntos?.length ?? 0} ubicaciones
              </div>

            </div>


            {/* Map */}

            <div
              style={{
                flex: 1,

                minHeight: 0,

                borderRadius: 14,

                overflow: 'hidden',

                border:
                  '1px solid var(--border)',

                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.45)',

                background:
                  'var(--bg-inset)',
              }}
            >

              {leafletReady ? (

                <ColombiaMap
                  selectedPunto={selectedPunto}
                  onSelectPunto={setSelectedPunto}
                />

              ) : (

                <div
                  style={{
                    height: '100%',

                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',

                    color:
                      'var(--text-muted)',

                    fontSize: 'var(--text-sm)',
                  }}
                >

                  Cargando mapa…

                </div>

              )}

            </div>

          </section>



          {/* ======================================================
              LOCATION DETAIL
              ====================================================== */}

          <section
            className="dashboard-section section-detail"
            style={{
              padding: '18px',

              display: 'flex',
              flexDirection: 'column',

              gap: 'var(--space-3)',

              minHeight: 430,

              overflow: 'hidden',
            }}
          >

            {/* Title */}

            <div
              className="dashboard-section-title"
              style={{
                flexShrink: 0,
              }}
            >
              Detalle de ubicación
            </div>


            {/* Detail */}

            <div
              style={{
                flex: 1,

                minHeight: 0,

                overflow: 'auto',

                paddingRight: 2,
              }}
            >

              <PlantDetail
                punto={selectedPunto}
              />

            </div>

          </section>

        </div>



        {/* ========================================================
            ANALYSIS
            ======================================================== */}

        <section
          className="dashboard-section section-charts"
          style={{
            padding: '18px 20px 20px',
          }}
        >

          {/* Header */}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',

              gap: 'var(--space-2-5)',

              marginBottom: 'var(--space-4)',
            }}
          >

            <div>

              <div
                className="dashboard-section-title"
              >
                Análisis y métricas
              </div>

              <div
                style={{
                  marginTop: 5,

                  fontSize: 'var(--text-2xs)',

                  color:
                    'var(--text-faint)',
                }}
              >
                Comportamiento y distribución de la corrosión
              </div>

            </div>

          </div>


          {/* Charts */}

          <ChartsRow />

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
            Uninorte · Ing. Mecánica &amp; Electrónica
          </span>

          <span>
            YOLOv8 Transfer Learning · ASTM B117
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