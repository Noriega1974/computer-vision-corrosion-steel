import React, { useState, useId } from 'react';
import { useIndicadores } from '../hooks/useIndicadores';
import Skeleton, { SkeletonLinea } from './Skeleton';
import { COLORES_NIVEL, nivelColorTexto } from '../lib/statusUtils';
import {
  VENTANA_DIAS,
  segmentosBarra,
  resumenNiveles,
  textoSinMediciones,
  textoPromedio,
  textoCobertura,
  textoAtrasado,
  textoMediciones30d,
  textoSubio,
  fechaCorta,
  sinPuntos,
  esParcial,
} from '../lib/indicadoresSistema';

const estiloValor = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--text-xl)',
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '-0.035em',
};
const estiloEtiqueta = {
  marginTop: 'var(--space-1)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  lineHeight: 1.3,
};
// 13px in the UI face; muted (not faint) so the contrast holds in both themes.
const estiloSub = {
  marginTop: 2,
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-ui)',
  lineHeight: 1.4,
  overflowWrap: 'break-word',
};
const estiloNumero = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' };
const estiloTextoValor = {
  fontFamily: 'var(--font-ui)', fontSize: 'var(--text-md)', fontWeight: 600, letterSpacing: 0,
};

// Cada tarjeta responde una pregunta; las lineas finas entre celdas las pone
// .kpi-celda en index.css. `valor` y `etiqueta` son la pareja numero + pregunta.
function Tarjeta({ etiqueta, valor, color, cargando, children }) {
  return (
    <div className="kpi-celda" aria-busy={cargando || undefined}>
      <div style={{ ...estiloValor, color: color ?? 'var(--text-primary)' }}>
        {cargando ? <SkeletonLinea width="4ch" /> : valor}
      </div>
      <div style={estiloEtiqueta}>{etiqueta}</div>
      {cargando ? <div style={estiloSub}><SkeletonLinea width="80%" /></div> : children}
    </div>
  );
}

// Barra apilada con los 4 colores de nivel. El texto accesible es la leyenda.
function BarraNiveles({ porNivel }) {
  const segmentos = segmentosBarra(porNivel);
  const texto = resumenNiveles(porNivel);
  if (!segmentos.length) return null;
  return (
    <div
      role="img"
      aria-label={texto}
      title={texto}
      style={{
        display: 'flex', height: 8, marginTop: 'var(--space-2)', borderRadius: 999,
        overflow: 'hidden', background: 'var(--border)', gap: 1,
      }}
    >
      {segmentos.map((s) => (
        <span key={s.nivel} style={{ width: `${s.ancho}%`, background: COLORES_NIVEL[s.nivel], minWidth: 3 }} />
      ))}
    </div>
  );
}

function ListaSubieron({ puntos: puntosProp, cantidad, id }) {
  const puntos = puntosProp ?? [];
  const restantes = (cantidad ?? 0) - puntos.length;
  return (
    <ul
      id={id}
      style={{
        margin: 'var(--space-1) 0 0', padding: 0, listStyle: 'none',
        fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)',
        color: 'var(--text-muted)', lineHeight: 1.45,
      }}
    >
      {puntos.map((p) => <li key={p.id_punto} style={{ overflowWrap: 'anywhere' }}>{textoSubio(p)}</li>)}
      {restantes > 0 && <li>y {restantes} más</li>}
    </ul>
  );
}

export default function KPIBar({ empresaId = null }) {
  const { datos, loading, error, refetch } = useIndicadores(empresaId);
  const [verSubieron, setVerSubieron] = useState(false);
  const idLista = useId();

  // Con datos en cache, una recarga fallida los conserva; solo un fallo sin
  // datos es un estado de error (nunca mostrar 0 como si fuera real).
  const sinDatos = Boolean(error) && !datos;
  const cargando = loading && !datos;
  const vacio = !cargando && !sinDatos && sinPuntos(datos);

  const subieron = datos?.subieron_nivel;
  const critico = datos?.mas_critico;
  const atrasado = textoAtrasado(datos?.cobertura?.mas_atrasado);
  const sinMed = textoSinMediciones(datos?.sin_mediciones);

  return (
    <div className="card ind-card">
      <div className="ind-card-label">Estado general del sistema</div>

      {sinDatos ? (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)',
            fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
          }}
        >
          <span>No se pudieron cargar los indicadores. Revisa tu conexión.</span>
          <button
            type="button" onClick={refetch}
            style={{
              padding: '6px 12px', minHeight: 32, borderRadius: 6,
              border: '1px solid var(--border-strong)', background: 'transparent',
              color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      ) : vacio ? (
        <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Aún no hay puntos para resumir. Cuando crees un punto y subas fotos, aquí verás su estado.
        </p>
      ) : (
        <>
          <div className="kpi-grid">
            <Tarjeta
              etiqueta="Puntos por nivel"
              valor={datos?.total_puntos}
              cargando={cargando}
            >
              <BarraNiveles porNivel={datos?.por_nivel} />
              <div style={estiloSub}>{resumenNiveles(datos?.por_nivel) || 'Ningún punto medido'}</div>
              {sinMed && <div style={estiloSub}>{sinMed}</div>}
            </Tarjeta>

            <Tarjeta
              etiqueta="Punto más crítico"
              valor={critico
                ? <span className="kpi-nombre" title={critico.nombre} style={{ ...estiloTextoValor, fontSize: 'var(--text-lg)' }}>{critico.nombre}</span>
                : 'Sin datos'}
              color={critico ? undefined : 'var(--text-faint)'}
              cargando={cargando}
            >
              {critico ? (
                <div style={estiloSub}>
                  <span style={{ color: nivelColorTexto(critico.nivel), fontWeight: 600, ...estiloNumero, fontFamily: 'var(--font-ui)' }}>
                    {textoPromedio(critico.promedio_pct)}
                  </span>
                  {` · ${fechaCorta(critico.fecha)}`}
                </div>
              ) : (
                <div style={estiloSub}>sin mediciones con %</div>
              )}
            </Tarjeta>

            <Tarjeta
              etiqueta="Subieron de nivel"
              valor={subieron?.cantidad ?? 0}
              color={subieron?.cantidad > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
              cargando={cargando}
            >
              <div style={estiloSub}>en {VENTANA_DIAS} días</div>
              {subieron?.cantidad > 0 && (
                <>
                  <button
                    type="button"
                    className="kpi-enlace"
                    aria-expanded={verSubieron}
                    aria-controls={idLista}
                    onClick={() => setVerSubieron((v) => !v)}
                  >
                    {verSubieron ? 'Ocultar puntos' : 'Ver puntos'}
                  </button>
                  {verSubieron && <ListaSubieron id={idLista} puntos={subieron.puntos} cantidad={subieron.cantidad} />}
                </>
              )}
            </Tarjeta>

            <Tarjeta
              etiqueta={`Medidos en ${VENTANA_DIAS} días`}
              valor={(
                textoCobertura(datos?.cobertura) === 'Sin datos'
                  ? <span style={estiloTextoValor}>Sin datos</span>
                  : (
                    <span title={textoCobertura(datos?.cobertura)}>
                      <span>{Number(datos?.cobertura?.con_medicion_30d) || 0}</span>
                      <span style={estiloTextoValor}>{` de ${Number(datos?.cobertura?.total_puntos)} ${Number(datos?.cobertura?.total_puntos) === 1 ? 'punto' : 'puntos'}`}</span>
                    </span>
                  )
              )}
              cargando={cargando}
            >
              {atrasado && <div className="kpi-sub-recortado" title={atrasado} style={estiloSub}>{atrasado}</div>}
            </Tarjeta>
          </div>

          <div style={{ ...estiloSub, marginTop: 'var(--space-2)' }} aria-busy={cargando || undefined}>
            {cargando ? <Skeleton width="30%" height={10} /> : textoMediciones30d(datos?.mediciones_30d)}
          </div>
          {!cargando && esParcial(datos) && (
            <div role="note" style={{ ...estiloSub, marginTop: 'var(--space-1)' }}>
              Datos parciales: algunos puntos tienen demasiadas mediciones y las cifras pueden estar incompletas.
            </div>
          )}
        </>
      )}
    </div>
  );
}
