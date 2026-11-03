import React from 'react';
import { Link } from 'react-router-dom';
import { useMedicionesPunto } from '../hooks/useMedicionesPunto';
import {
  nivelColor, nivelBg, nivelLabel,
} from '../lib/statusUtils';
import Skeleton, { SkeletonLinea } from './Skeleton';
import { useConteoRecordado } from '../hooks/useConteoRecordado';
import { formatFecha } from '../utils/dateFormat';
import { formatoPct, etiquetaBase } from '../lib/textUtils';
import { IconoCamara, IconoHumedad, IconoLluvia, IconoTemperatura, IconoViento } from './Iconos';

// Estilos de texto compartidos con el esqueleto: mismo line-height cargado o no.
const RESUMEN_STYLE = {
  fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.35,
  fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums',
};
const HISTORIAL_LINEA_STYLE = { fontSize: 'var(--text-3xs)', fontWeight: 600, fontFamily: 'var(--font-data)' };

// ─── Tarjeta Flashcard de Ubicación (Dashboard) ─────────────────────────────
export default function PlantDetail({ punto }) {
  const { mediciones, loading, error } = useMedicionesPunto(punto?.id_bloque);
  const filasSkeleton = useConteoRecordado(`dashboard:historial:${punto?.id_bloque}`, mediciones, loading, 4);

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

        {/* 4. Resumen: total de mediciones y última área corroída */}
        {loading ? (
          <div aria-busy="true" style={RESUMEN_STYLE}><SkeletonLinea width={200} /></div>
        ) : (
          <div style={RESUMEN_STYLE}>
            <strong style={{ color: 'var(--text-primary)' }}>
              {mediciones.length} {mediciones.length === 1 ? 'medición' : 'mediciones'}
            </strong>
            {' · '}
            {ultimaMedicion?.area_corroida_pct != null
              ? `Última área corroída: ${formatoPct(ultimaMedicion.area_corroida_pct)} ${etiquetaBase(ultimaMedicion)}`
              : 'Sin lecturas registradas'}
          </div>
        )}
      </div>

      {/* Historial de mediciones */}
      {/* minHeight: 0 + columna flex: sin esto el bloque crecía con su
          contenido, el overflow hidden de la tarjeta lo recortaba y la lista
          interna nunca llegaba a tener scroll (la rueda no hacía nada). */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'var(--space-2)' }}>
        <div style={{ flexShrink: 0, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', letterSpacing: '0.04em', padding: '4px 8px 8px', fontWeight: 600 }}>
          HISTORIAL DE MEDICIONES
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
        {!loading && !error && mediciones.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            Sin mediciones registradas para este punto.
          </div>
        )}
        {/* Antes esta lista crecia con la cantidad real de fotos: una planta
            con 10 mediciones estiraba toda la seccion, y como el grid del
            Dashboard reparte una sola fila entre plantas/mapa/detalle, el
            mapa se estiraba con ella. `height: 100%` mas arriba solo funciona
            si un ancestro tiene un alto DEFINIDO — la seccion solo tenia
            minHeight (un piso, no un techo), asi que "100%" no tenia contra
            que resolver y el contenido crecia libre. Ahora el visor queda
            fijo en ~5 filas (280px, medido sobre MedicionRow real) y el
            resto se recorre con la rueda del mouse ahi adentro, sin mover el
            alto de nada mas alrededor. */}
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
            flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
            paddingRight: 2,
          }}
        >
          {mediciones.slice(0, 50).map((m, i) => (
            <MedicionRow key={m.id_medicion ?? i} medicion={m} idPunto={punto.id_bloque} />
          ))}
        </div>
      </div>
    </div>
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
    ? `/galeria/${medicion.id_medicion}?punto=${encodeURIComponent(idBloque)}`
    : `/galeria/${medicion.id_medicion}`;
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
