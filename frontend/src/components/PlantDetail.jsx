import React from 'react';
import { Link } from 'react-router-dom';
import { useMedicionesPunto } from '../hooks/useMedicionesPunto';
import {
  nivelColor, nivelBg, nivelPillText, nivelLabel,
} from '../lib/statusUtils';
import Skeleton, { SkeletonLinea } from './Skeleton';
import { useConteoRecordado } from '../hooks/useConteoRecordado';
import { formatFecha } from '../utils/dateFormat';
import { formatoPct } from '../lib/textUtils';
import { IconoCamara, IconoHumedad, IconoLluvia, IconoTemperatura, IconoViento } from './Iconos';

// Estilos de texto compartidos con el esqueleto: mismo line-height cargado o no.
const FOOTER_TITULO_STYLE = {
  fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 22,
  color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.01em',
};
const FOOTER_SUB_STYLE = { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-ui)' };
const HISTORIAL_LINEA_STYLE = { fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-ui)' };

// ─── Tarjeta Flashcard de Ubicación (Dashboard) ─────────────────────────────
export default function PlantDetail({ punto }) {
  const { mediciones, loading, error } = useMedicionesPunto(punto?.id_bloque);
  const filasSkeleton = useConteoRecordado(`dashboard:historial:${punto?.id_bloque}`, mediciones, loading, 4);

  if (!punto) {
    return (
      <div style={{
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
  const pillBg = nivel >= 0 ? nivelBg(nivel) : 'var(--bg-inset)';
  const pillText = nivel >= 0 ? nivelPillText(nivel) : 'var(--text-secondary)';

  const clima = ultimaMedicion?.clima;
  const stats = [
    ...(clima ? [
      { Icon: IconoTemperatura, label: 'Temp.', v: clima.temperatura_c != null ? `${clima.temperatura_c}°C` : null },
      { Icon: IconoHumedad, label: 'Humedad', v: clima.humedad_pct != null ? `${clima.humedad_pct}%` : null },
      { Icon: IconoLluvia, label: 'Precip.', v: clima.precipitacion_mm != null ? `${clima.precipitacion_mm} mm` : null },
      { Icon: IconoViento, label: 'Viento', v: (clima.viento_kmh ?? clima.velocidad_viento_kmh) != null ? `${clima.viento_kmh ?? clima.velocidad_viento_kmh} km/h` : null },
    ] : []),
  ].filter(x => x.v);

  // "Ver historial completo" lleva a la galería filtrada por este bloque.
  // Sin empresa_id (no debería pasar fuera de super_admin viendo un punto
  // huérfano) no hay a dónde enlazar -- se omite el link en ese caso.
  const hrefHistorialCompleto = punto.empresa_id
    ? `/galeria/zona/${punto.empresa_id}/${punto.id_bloque}`
    : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Flashcard superior del punto: 1) Título + píldora de estado,
          2) Caja encuadrada de clima en el centro, 3) Pie con total de
          mediciones y última área corroída */}
      <div style={{
        padding: 16, borderRadius: 14, background: 'var(--bg-highlight)',
        flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* 1. Título + píldora */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{
              fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 20,
              color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.15,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {punto.nombre ?? 'Punto sin nombre'}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {punto.ciudad ?? '—'}{punto.departamento ? ` · ${punto.departamento}` : ''}
            </span>
          </div>

          {nivel >= 0 && (
            <div className={nivel === 3 ? 'severa-pulse' : undefined} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 999,
              background: pillBg, color: pillText,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              flexShrink: 0,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
              {nivelLabel(nivel)}
            </div>
          )}
        </div>

        {/* 2. Bloque central encuadrado: datos meteorológicos con iconos y textos grandes */}
        {stats.length > 0 && (
          <div style={{
            background: 'var(--bg-card-solid)', borderRadius: 12, padding: '10px 4px',
            display: 'grid',
            gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
            gap: 4,
          }}>
            {stats.map(({ Icon, label, v }) => (
              <div key={label} style={{ textAlign: 'center', minWidth: 0 }}>
                <Icon size={18} strokeWidth={2} style={{ color: 'var(--accent-blue)' }} />
                {/* 12px en vez de 15px -- a tamaños mayores "11 km/h" se
                    recortaba en esta columna (la más angosta de las 3 del
                    dashboard). */}
                <div style={{
                  fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 12,
                  color: 'var(--text-primary)', lineHeight: 1.1, marginTop: 4,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {v}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3. Pie de la flashcard: total de mediciones a la izquierda, última área corroída a la derecha */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          {loading ? (
            <div aria-busy="true">
              <div style={FOOTER_TITULO_STYLE}><SkeletonLinea width={110} /></div>
              <div style={FOOTER_SUB_STYLE}><SkeletonLinea width={160} /></div>
            </div>
          ) : (
            <div>
              <div style={FOOTER_TITULO_STYLE}>
                {mediciones.length} {mediciones.length === 1 ? 'medición' : 'mediciones'}
              </div>
              <div style={FOOTER_SUB_STYLE}>
                Última área corroída
              </div>
            </div>
          )}

          {ultimaMedicion?.area_corroida_pct != null && (
            <span style={{
              fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 28,
              color: 'var(--accent-amber)', lineHeight: 1, flexShrink: 0,
            }}>
              {formatoPct(ultimaMedicion.area_corroida_pct)}
            </span>
          )}
        </div>
      </div>

      {/* Historial de mediciones */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 0 0', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="dashboard-section-title" style={{ padding: '0 2px 10px' }}>
          Historial de mediciones
        </div>

        {loading && (
          <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {Array.from({ length: filasSkeleton }, (_, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  border: '1px solid var(--border)', borderRadius: 12,
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                }}
              >
                <Skeleton width={52} height={52} radius={10} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...HISTORIAL_LINEA_STYLE, marginBottom: 2 }}><SkeletonLinea width="45%" /></div>
                  <Skeleton height={6} radius={3} />
                  <div style={{ fontSize: 12, marginTop: 4 }}><SkeletonLinea width="70%" /></div>
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
        {/* Visor acotado a ~5 filas, el resto se recorre con scroll interno --
            así no estira el alto de la fila que comparte con mapa y zonas. */}
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
            flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
            paddingRight: 2,
          }}
        >
          {mediciones.slice(0, 50).map((m, i) => (
            <MedicionRow key={m.id_medicion ?? i} medicion={m} />
          ))}
        </div>

        {!loading && !error && mediciones.length > 0 && hrefHistorialCompleto && (
          <Link
            to={hrefHistorialCompleto}
            style={{
              display: 'block', marginTop: 10, padding: '2px 2px 0',
              fontSize: 13, fontWeight: 700, color: 'var(--accent-blue)', textDecoration: 'none',
            }}
          >
            Ver historial completo
          </Link>
        )}
      </div>
    </div>
  );
}

function MedicionRow({ medicion }) {
  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const fecha = formatFecha(medicion.timestamp, { conHora: true });

  return (
    <div style={{
      padding: 12,
      background: 'var(--bg-card-solid)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    }}>
      {/* Miniatura -- 52px, así que usa url_thumbnail (~400px) en vez de
          bajar la foto original completa para mostrar un cuadrito */}
      {medicion.url_imagen ? (
        <img
          src={medicion.url_thumbnail || medicion.url_imagen}
          alt=""
          loading="lazy"
          style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 52, height: 52, borderRadius: 10, flexShrink: 0,
          background: `${color}15`, border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
        }}>
          <IconoCamara size={18} aria-hidden="true" />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {medicion.nombre || 'Medición'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{fecha}</span>
        </div>

        <div style={{ height: 6, background: 'var(--bg-inset)', borderRadius: 3 }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, (medicion.area_corroida_pct ?? 0) * 2)}%`,
            background: color, borderRadius: 3,
          }} />
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span>Área corroída: <strong style={{ color: 'var(--text-primary)' }}>{formatoPct(medicion.area_corroida_pct)}</strong></span>
          <span style={{ ...HISTORIAL_LINEA_STYLE, color, flexShrink: 0, textTransform: 'uppercase' }}>
            {nivelLabel(nivel)}
          </span>
        </div>
      </div>
    </div>
  );
}
