import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IconoFlechaAbajo, IconoFlechaArriba, IconoReloj, IconoSubir } from '../components/Iconos';

import KPIBar from '../components/KPIBar';
import TendenciaPunto from '../components/TendenciaPunto';
import ColombiaMap from '../components/ColombiaMap';
import PlantDetail from '../components/PlantDetail';
import PlantsTable from '../components/PlantsTable';
import LineaTiempoMediciones from '../components/LineaTiempoMediciones';
import BarraProgresoSubida from '../components/BarraProgresoSubida';
import Skeleton from '../components/Skeleton';

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
  const [showTimeline, setShowTimeline] = useState(false);

  const leafletReady = useLeaflet();
  const { user } = useAuth();
  const esSuperAdmin = user?.groups?.includes('super_admin');
  const { empresas } = useEmpresas(esSuperAdmin);
  // /upload es solo para super_admin, admin y tecnico (RoleRoute): el cliente no ve el acceso.
  const puedeSubir = ['super_admin', 'admin', 'tecnico'].some(r => user?.groups?.includes(r));

  // "puntos" aquí son bloques (el "Punto" viejo fue absorbido por "Bloque",
  // ver hooks/useBloques.js) -- se mantiene el nombre de variable para no
  // tocar el resto del layout de este componente.
  const {
    bloques: puntos,
    loading: loadingPuntos,
    error: errorPuntos,
    refetch: refetchPuntos
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


  // On narrow screens the detail sits far below the list and the map: bring it into
  // view when the user picks a point (not on the first render, not for a deselect).
  const detalleRef = useRef(null);
  const idSeleccionadoPrevio = useRef(null);
  const idSeleccionado = selectedPunto?.id_bloque ?? null;
  useEffect(() => {
    const previo = idSeleccionadoPrevio.current;
    idSeleccionadoPrevio.current = idSeleccionado;
    if (!idSeleccionado || idSeleccionado === previo) return;
    if (!window.matchMedia('(max-width: 1024px)').matches) return;
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    detalleRef.current?.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'start' });
  }, [idSeleccionado]);

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
        <BarraProgresoSubida enlaceNuevaMedicion />

        {/* ========================================================
            KPI SECTION
            ======================================================== */}

        <section className="dashboard-kpi" aria-labelledby="titulo-indicadores">
          {/* Título de la sección y acción alineados; las dos tarjetas de abajo son el único nivel de superficie. */}
          <div className="dashboard-kpi__cabecera">
            <h2 id="titulo-indicadores" className="dashboard-section-title">
              Indicadores globales
            </h2>

            {puedeSubir && (
              <Link
                to="/upload"
                className="dashboard-action"
                style={{ padding: '6px 14px', flexShrink: 0 }}
              >
                <IconoSubir size={14} />
                Nueva medición
              </Link>
            )}
          </div>

          <div className="indicadores-split">
            <KPIBar empresaId={esSuperAdmin && selectedZona?.id_empresa && selectedZona.id_empresa !== 'propia' ? selectedZona.id_empresa : null} />
            <TendenciaPunto punto={selectedPunto} />
          </div>
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
            gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(0, 1.8fr) minmax(320px, 1.15fr)',
            gap: 18,
            height: 'clamp(540px, 66vh, 820px)',
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
                onRetry={refetchPuntos}
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
                  fontSize: 11,
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
                <div aria-busy="true" style={{ height: '100%' }}>
                  <Skeleton height="100%" radius={0} />
                </div>
              )}
            </div>
          </section>

          {/* ======================================================
              DETALLE DE UBICACIÓN
              ====================================================== */}
          <section
            ref={detalleRef}
            className={`dashboard-section section-detail${selectedPunto ? '' : ' section-detail--vacio'}`}
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
            LÍNEA DE TIEMPO DE MEDICIONES
            ======================================================== */}
        <section
          className="dashboard-section section-timeline"
          style={{
            padding: 0,
            overflow: 'hidden',
            borderRadius: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setShowTimeline(s => !s)}
            style={{
              width: '100%',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: showTimeline ? 'var(--bg-inset)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              textAlign: 'left',
              transition: 'background-color var(--dur-fast) var(--ease-out)',
            }}
          >
            <div>
              <div
                className="dashboard-section-title"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <IconoReloj size={16} /> Línea de tiempo de mediciones
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 'var(--text-2xs)',
                  color: 'var(--text-faint)',
                }}
              >
                Historial cronológico de inspecciones y lotes procesados
              </div>
            </div>
            {showTimeline ? <IconoFlechaArriba size={18} /> : <IconoFlechaAbajo size={18} />}
          </button>

          {showTimeline && (
            <div style={{ padding: '18px 20px 20px', borderTop: '1px solid var(--border)' }}>
              <LineaTiempoMediciones />
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
            Sistema de detección de corrosión © 2026
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