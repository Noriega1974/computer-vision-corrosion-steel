import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMedicionesPunto } from '../hooks/useMedicionesPunto';
import { useResumenDiario } from '../hooks/useResumenDiario';
import { useMedicionesDia } from '../hooks/useMedicionesDia';
import {
  nivelColor, nivelBg, nivelLabel,
} from '../lib/statusUtils';
import Skeleton, { SkeletonLinea } from './Skeleton';
import { useConteoRecordado } from '../hooks/useConteoRecordado';
import { formatFecha } from '../utils/dateFormat';
import { formatoPct, etiquetaBase } from '../lib/textUtils';
import { agruparPorLote } from '../lib/galeriaCarpetas';
import { aniosDesde, textoImagenesYLotes } from '../lib/resumenDiario';
import { formatearFechaDiaPunto } from '../lib/historialPunto';
import TarjetaLote, { FichaDetalleLote } from './TarjetaLote';
import { IconoCamara, IconoHumedad, IconoLluvia, IconoReloj, IconoTemperatura, IconoViento } from './Iconos';

// Estilos de texto compartidos con el esqueleto: mismo line-height cargado o no.
const RESUMEN_STYLE = {
  fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.35,
  fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums',
};
const HISTORIAL_LINEA_STYLE = { fontSize: 'var(--text-3xs)', fontWeight: 600, fontFamily: 'var(--font-data)' };

// Filas por tanda en el detalle de un día o de un lote (un día puede tener cientos).
const FILAS_POR_TANDA = 25;

// ─── Tarjeta Flashcard de Ubicación (Dashboard) ─────────────────────────────
// Historial: las cajas de día salen del resumen diario del servidor (una consulta por
// año, desde 2026 hasta el actual; hoy es una sola), así que cuentan TODAS las fotos
// del punto y no solo las más recientes. Al abrir un día se piden sus fotos completas
// (hasta 500) y se muestran primero las tarjetas de lote de ese día y después SOLO las
// fotos sueltas: las de un lote se ven dentro de su tarjeta, nunca repetidas aquí.
export default function PlantDetail({ punto }) {
  const idPunto = punto?.id_bloque;
  // Solo la última medición (nivel, clima, área); el historial sale del resumen.
  const { mediciones: ultimas, loading: cargandoUltima, error: errorUltima } = useMedicionesPunto(idPunto, { limite: 1 });
  const anios = useMemo(() => aniosDesde(new Date().getFullYear()), []);
  const resumen = useResumenDiario({ anios, idPunto, habilitado: Boolean(idPunto) });
  const loading = resumen.loading || cargandoUltima;
  const error = resumen.error || errorUltima;
  const filasSkeleton = useConteoRecordado(`dashboard:historial:${idPunto}`, resumen.dias, resumen.loading, 4);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [loteSeleccionado, setLoteSeleccionado] = useState(null);
  const [filasVisibles, setFilasVisibles] = useState(FILAS_POR_TANDA);
  const delDia = useMedicionesDia(idPunto, diaSeleccionado);

  useEffect(() => {
    setDiaSeleccionado(null);
    setLoteSeleccionado(null);
  }, [idPunto]);

  useEffect(() => {
    setLoteSeleccionado(null);
    setFilasVisibles(FILAS_POR_TANDA);
  }, [diaSeleccionado]);

  useEffect(() => {
    setFilasVisibles(FILAS_POR_TANDA);
  }, [loteSeleccionado]);

  const mediciones = ultimas;

  const diaResumen = useMemo(
    () => (diaSeleccionado ? resumen.dias.find((d) => d.fecha === diaSeleccionado) ?? null : null),
    [resumen.dias, diaSeleccionado],
  );

  // Fotos del día abierto separadas en lotes y sueltas (sin duplicar).
  const agrupadoDia = useMemo(() => agruparPorLote(delDia.mediciones), [delDia.mediciones]);
  const sueltasDia = useMemo(
    () => [...agrupadoDia.sueltas].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [agrupadoDia.sueltas],
  );

  const loteActual = useMemo(
    () => (loteSeleccionado ? agrupadoDia.lotes.find((l) => l.id === loteSeleccionado) ?? null : null),
    [agrupadoDia.lotes, loteSeleccionado],
  );

  useEffect(() => {
    if (diaSeleccionado && !resumen.loading && !diaResumen) {
      setDiaSeleccionado(null);
    }
  }, [diaSeleccionado, diaResumen, resumen.loading]);

  if (!punto) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', gap: 'var(--space-3)',
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" opacity="0.3">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="#7a9ab5" strokeWidth="1.5"/>
          <circle cx="12" cy="9" r="2.5" stroke="#7a9ab5" strokeWidth="1.5"/>
        </svg>
        <div style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.02em', textTransform: 'uppercase', textAlign: 'center', padding: '0 16px', fontWeight: 500 }}>
          Selecciona un punto en el mapa
        </div>
      </div>
    );
  }

  const ultimaMedicion = mediciones[0] ?? null;
  const nivel = ultimaMedicion?.nivel_corrosion ?? -1;
  const color = nivel >= 0 ? nivelColor(nivel) : 'var(--text-muted)';
  const bg = nivel >= 0 ? nivelBg(nivel) : 'transparent';

  const clima = ultimaMedicion?.clima;
  const stats = [
    ...(clima ? [
      { Icon: IconoTemperatura, label: 'Temp.', v: clima.temperatura_c != null ? `${clima.temperatura_c}°C` : null },
      { Icon: IconoHumedad, label: 'Humedad', v: clima.humedad_pct != null ? `${clima.humedad_pct}%` : null },
      { Icon: IconoLluvia, label: 'Precip.', v: clima.precipitacion_mm != null ? `${clima.precipitacion_mm} mm` : null },
      { Icon: IconoViento, label: 'Viento', v: (clima.viento_kmh ?? clima.velocidad_viento_kmh) != null ? `${clima.viento_kmh ?? clima.velocidad_viento_kmh} km/h` : null },
    ] : []),
  ].filter(x => x.v);

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Encabezado compacto del punto: 1) nombre + estado, 2) ciudad,
          3) clima en una cuadrícula 2x2 de una línea por dato, 4) resumen. */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
        background: bg, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {/* 1-2. Nombre y estado en la misma línea; ciudad debajo */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{
              minWidth: 0, fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 15,
              color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {punto.nombre ?? 'Punto sin nombre'}
            </div>
            {nivel >= 0 && (
              <div className={nivel === 3 ? 'severa-pulse' : undefined} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 9px', borderRadius: 999,
                background: 'var(--bg-card)', border: `1px solid ${color}60`,
                fontSize: 11, fontWeight: 700, color,
                flexShrink: 0,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                {nivelLabel(nivel)}
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
            {punto.ciudad ?? 'Sin ciudad'}{punto.departamento ? ` · ${punto.departamento}` : ''}
          </div>
        </div>

        {/* 3. Clima: cada dato en una línea (icono, valor, nombre) */}
        {stats.length > 0 && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '5px 8px',
            display: 'grid',
            gridTemplateColumns: 'auto auto',
            justifyContent: 'space-between',
            gap: '3px 10px',
          }}>
            {stats.map(({ Icon, label, v }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, whiteSpace: 'nowrap' }}>
                <Icon size={14} strokeWidth={2} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
                <span style={{
                  fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 13,
                  color: 'var(--text-primary)', letterSpacing: '-0.01em',
                }}>
                  {v}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 4. Resumen: conteo unificado de imágenes/lotes y última área corroída */}
        {loading ? (
          <div aria-busy="true" style={RESUMEN_STYLE}><SkeletonLinea width={200} /></div>
        ) : (
          <div style={RESUMEN_STYLE}>
            <strong style={{ color: 'var(--text-primary)' }}>
              {textoImagenesYLotes(resumen.totales.imagenes, {
                count: resumen.totales.lotes,
                imagenes: resumen.totales.imagenes_en_lotes,
              })}
            </strong>
            {' · '}
            {ultimaMedicion?.area_corroida_pct != null
              ? `Última área corroída: ${formatoPct(ultimaMedicion.area_corroida_pct)} ${etiquetaBase(ultimaMedicion)}`
              : 'Sin lecturas registradas'}
          </div>
        )}
      </div>

      {/* Historial: una caja por día; al abrir un día, sus lotes y fotos sueltas */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'var(--space-2)' }}>
        <div style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          padding: '4px 8px 8px',
          fontWeight: 600,
        }}>
          <span>HISTORIAL DE MEDICIONES</span>
          {diaSeleccionado && (
            <button
              type="button"
              onClick={() => {
                if (loteActual) {
                  setLoteSeleccionado(null);
                } else {
                  setDiaSeleccionado(null);
                }
              }}
              style={botonVolverStyle}
            >
              ← Volver
            </button>
          )}
        </div>

        {loading && (
          <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {Array.from({ length: filasSkeleton }, (_, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                }}
              >
                <Skeleton width={36} height={36} radius={4} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...HISTORIAL_LINEA_STYLE, marginBottom: 2 }}><SkeletonLinea width="45%" /></div>
                  <Skeleton height={3} radius={2} />
                  <div style={{ fontSize: 12, marginTop: 2 }}><SkeletonLinea width="70%" /></div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 'var(--space-3)', fontSize: 'var(--text-2xs)', color: 'var(--accent-red)' }}>{error}</div>
        )}
        {!loading && !error && resumen.dias.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            Sin mediciones registradas para este punto.
          </div>
        )}

        {!loading && !error && resumen.dias.length > 0 && (
          <div
            style={{
              display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
              flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
              paddingRight: 2,
            }}
          >
            {!diaResumen ? (
              resumen.dias.map((dia) => <CajaDia key={dia.fecha} dia={dia} onAbrir={() => setDiaSeleccionado(dia.fecha)} />)
            ) : (
              <>
                <div style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  padding: '6px 8px',
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  flexWrap: 'wrap',
                }}>
                  <button
                    type="button"
                    onClick={() => (loteActual ? setLoteSeleccionado(null) : setDiaSeleccionado(null))}
                    style={botonVolverStyle}
                  >
                    {loteActual ? `← Volver al día ${formatearFechaDiaPunto(diaResumen.fecha)}` : '← Volver'}
                  </button>
                  {loteActual && (
                    <button
                      type="button"
                      onClick={() => { setLoteSeleccionado(null); setDiaSeleccionado(null); }}
                      style={{ ...botonVolverStyle, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}
                    >
                      ← Todos los días
                    </button>
                  )}
                  {!loteActual && (
                    <div style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 'var(--text-2xs)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {formatearFechaDiaPunto(diaResumen.fecha)} · {textoImagenesYLotes(diaResumen.total, diaResumen.lotes)}
                    </div>
                  )}
                </div>

                {delDia.loading && (
                  <div aria-busy="true" style={{ padding: 16, textAlign: 'center', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    Cargando las imágenes del día...
                  </div>
                )}
                {!delDia.loading && delDia.error && (
                  <div style={{ padding: 'var(--space-3)', fontSize: 'var(--text-2xs)', color: 'var(--accent-red)' }}>{delDia.error}</div>
                )}
                {!delDia.loading && !delDia.error && delDia.truncado && (
                  <div role="status" style={{ padding: '6px 9px', fontSize: 'var(--text-3xs)', color: 'var(--text-secondary)', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 7 }}>
                    Este día tiene más de 500 imágenes. Aquí se muestran las 500 más recientes.
                  </div>
                )}

                {!delDia.loading && !delDia.error && (loteActual ? (
                  <>
                    <FichaDetalleLote lote={loteActual} compacta />
                    <ListaFilas
                      filas={loteActual.mediciones}
                      visibles={filasVisibles}
                      onMas={() => setFilasVisibles((n) => n + FILAS_POR_TANDA)}
                      idPunto={idPunto}
                    />
                  </>
                ) : (
                  <>
                    {agrupadoDia.lotes.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
                        {agrupadoDia.lotes.map((lote) => (
                          <TarjetaLote
                            key={lote.id}
                            lote={lote}
                            compacta
                            onClick={() => setLoteSeleccionado(lote.id)}
                          />
                        ))}
                      </div>
                    )}
                    <ListaFilas
                      filas={sueltasDia}
                      visibles={filasVisibles}
                      onMas={() => setFilasVisibles((n) => n + FILAS_POR_TANDA)}
                      idPunto={idPunto}
                    />
                  </>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const botonVolverStyle = {
  padding: '3px 9px',
  borderRadius: 6,
  border: '1px solid var(--border-strong)',
  background: 'var(--bg-card-solid)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-2xs)',
  fontWeight: 600,
  cursor: 'pointer',
};

// Caja de un día: fecha como título, "N imágenes · x lotes con y imágenes" debajo.
function CajaDia({ dia, onAbrir }) {
  const nivel = dia.peor_nivel;
  const color = nivel == null ? 'var(--text-muted)' : nivelColor(nivel);
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="historial-fila historial-fila--link"
      style={{ width: '100%', textAlign: 'left', borderRadius: 8, justifyContent: 'space-between', padding: '9px 11px' }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-xs)',
          color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
        }}>
          <IconoReloj size={13} color="var(--accent-amber)" />
          <span>{formatearFechaDiaPunto(dia.fecha)}</span>
        </div>
        <div style={{
          fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
          marginTop: 2, fontVariantNumeric: 'tabular-nums',
        }}>
          {textoImagenesYLotes(dia.total, dia.lotes)}
        </div>
      </div>

      {nivel != null && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
          <span style={{ ...HISTORIAL_LINEA_STYLE, color, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
            {nivelLabel(nivel)}
          </span>
          {dia.max_pct != null && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              Máx. {formatoPct(dia.max_pct)}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// Filas de fotos en tandas de FILAS_POR_TANDA con "Mostrar más".
function ListaFilas({ filas, visibles, onMas, idPunto }) {
  const mostradas = filas.slice(0, visibles);
  return (
    <>
      {mostradas.map((m, i) => (
        <MedicionRow key={m.id_medicion ?? i} medicion={m} idPunto={idPunto} />
      ))}
      {filas.length > visibles && (
        <button type="button" onClick={onMas} style={{ ...botonVolverStyle, alignSelf: 'center', margin: '4px 0' }}>
          Mostrar más ({filas.length - visibles} restantes)
        </button>
      )}
    </>
  );
}

// Cada fila abre el detalle de esa foto en la galería.
function MedicionRow({ medicion, idPunto }) {
  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const fecha = formatFecha(medicion.timestamp, { conHora: true });

  const idBloque = medicion.bloque_id ?? idPunto;
  const contenido = (
    <>
      {/* Miniatura -- 36px, así que usa url_thumbnail (~400px) en vez de
          bajar la foto original completa para mostrar un cuadrito */}
      {medicion.url_imagen ? (
        <img
          src={medicion.url_thumbnail || medicion.url_imagen}
          alt=""
          loading="lazy"
          style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--border)' }}
        />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: 4, flexShrink: 0,
          background: `${color}15`, border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
        }}>
          <IconoCamara size={16} aria-hidden="true" />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {medicion.nombre && (
          <div style={{
            fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2,
            fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {medicion.nombre}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ ...HISTORIAL_LINEA_STYLE, color, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {/* Decorative: the label carries the meaning */}
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {nivelLabel(nivel)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fecha}</span>
        </div>
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, (medicion.area_corroida_pct ?? 0) * 2)}%`,
            background: color, borderRadius: 2,
          }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
          <span>Área corroída: {formatoPct(medicion.area_corroida_pct)} {etiquetaBase(medicion)}</span>
          {medicion.notas && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{medicion.notas}</span>}
        </div>
      </div>
    </>
  );

  if (!medicion.id_medicion) {
    return <div className="historial-fila">{contenido}</div>;
  }
  const destino = idBloque
    ? `/galeria/${encodeURIComponent(medicion.id_medicion)}?punto=${encodeURIComponent(idBloque)}`
    : `/galeria/${encodeURIComponent(medicion.id_medicion)}`;
  return (
    <Link
      to={destino}
      className="historial-fila historial-fila--link"
      aria-label={`Ver foto del ${fecha}: ${nivelLabel(nivel)}, ${formatoPct(medicion.area_corroida_pct)}`}
    >
      {contenido}
    </Link>
  );
}
