import React, { useState } from 'react';
import NivelIcon from './NivelIcon';
import { IconoCheck, IconoMoverACarpeta, IconoReloj, IconoVolver } from './Iconos';
import { nivelBg, nivelColor, nivelColorTexto, nivelLabel } from '../lib/statusUtils';
import { formatoPct, plural } from '../lib/textUtils';
import { iniciales } from '../lib/galeriaCarpetas';
import { formatFecha } from '../utils/dateFormat';
import { CARD_PILDORA_STYLE, CARD_SUBTITULO_STYLE, CARD_TITULO_STYLE } from './cardTextStyles';

function EstadoLoteBadge({ estado }) {
  const enProceso = estado === 'en_proceso';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 'var(--text-3xs)',
        fontWeight: 600,
        fontFamily: 'var(--font-ui)',
        background: enProceso ? 'rgba(217,119,6,0.12)' : 'rgba(22,163,74,0.10)',
        border: `1px solid ${enProceso ? 'rgba(217,119,6,0.35)' : 'rgba(22,163,74,0.30)'}`,
        color: enProceso ? 'var(--accent-amber)' : 'var(--accent-green)',
        whiteSpace: 'nowrap',
      }}
    >
      {enProceso ? <IconoReloj size={11} aria-hidden="true" /> : <IconoCheck size={11} aria-hidden="true" />}
      <span>{enProceso ? 'En proceso' : 'Analizado'}</span>
    </span>
  );
}

// Tarjeta de lote como objeto único con sus 7 atributos:
// portada, nombre, fecha, cantidad, peor nivel, % máx. y estado.
export default function TarjetaLote({ lote, onClick, compacta = false }) {
  const [imgError, setImgError] = useState(false);
  const peorNivel = lote?.peorNivel ?? 0;
  const color = nivelColor(peorNivel);
  const colorTexto = nivelColorTexto(peorNivel);
  const bg = nivelBg(peorNivel);
  const fechaTexto = lote?.ultimaFecha ? formatFecha(lote.ultimaFecha) : 'Sin fecha';
  const total = lote?.total ?? 0;
  const cantidadTexto = plural(total, 'medición', 'mediciones');
  const srcPortada = !imgError ? lote?.preview : null;

  if (compacta) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="historial-fila historial-fila--link"
        style={{
          width: '100%',
          textAlign: 'left',
          borderRadius: 8,
          padding: '8px 10px',
          background: 'var(--bg-inset)',
          border: '1px solid var(--border-strong)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {srcPortada ? (
          <img
            src={srcPortada}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            style={{
              width: 42,
              height: 42,
              objectFit: 'cover',
              borderRadius: 6,
              border: '1px solid var(--border)',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 42,
              height: 42,
              borderRadius: 6,
              background: 'var(--bg-card-solid)',
              border: '1px solid var(--border-strong)',
              color: 'var(--accent-amber)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <IconoMoverACarpeta size={18} />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              Lote: {lote?.nombre || 'Lote sin nombre'}
            </span>
            <EstadoLoteBadge estado={lote?.estado} />
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            marginTop: 3,
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-ui)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <span>{cantidadTexto}</span>
            <span>·</span>
            <span>{fechaTexto}</span>
            <span>·</span>
            <span style={{ color: colorTexto, fontWeight: 700 }}>
              {nivelLabel(peorNivel)} (Máx. {formatoPct(lote?.peorPct ?? 0)})
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="medicion-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 14,
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, width: '100%' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Up to two lines (the name identifies the batch), then date and count underneath. */}
          <div className="tarjeta-lote__titulo" title={lote?.nombre || 'Lote sin nombre'} style={{ ...CARD_TITULO_STYLE, color: 'var(--text-primary)' }}>
            {lote?.nombre || 'Lote sin nombre'}
          </div>
          <div style={{
            ...CARD_SUBTITULO_STYLE,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {fechaTexto} · {cantidadTexto}
          </div>
        </div>
        <EstadoLoteBadge estado={lote?.estado} />
      </div>

      <div style={{
        height: 140,
        width: '100%',
        background: 'var(--bg-inset)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {srcPortada ? (
          <img
            src={srcPortada}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'var(--bg-card-solid)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: 24,
            }}
          >
            {iniciales(lote?.nombre)}
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        marginTop: 2,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 800,
            fontSize: 16,
            color: 'var(--text-primary)',
            lineHeight: 1.15,
          }}>
            Máx. {formatoPct(lote?.peorPct ?? 0)}
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            marginTop: 4,
            padding: '2px 8px',
            borderRadius: 999,
            background: bg,
            border: `1px solid ${color}45`,
            color: colorTexto,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--font-ui)',
          }}>
            <NivelIcon nivel={peorNivel} size={14} color={color} />
            <span>Peor nivel: {nivelLabel(peorNivel)}</span>
          </div>
        </div>
        <span style={{
          ...CARD_PILDORA_STYLE,
          background: 'var(--text-primary)',
          color: 'var(--bg-card-solid)',
          flexShrink: 0,
        }}>
          Ver lote
        </span>
      </div>
    </button>
  );
}

// Vista detallada de las particularidades de un lote al abrirlo.
export function FichaDetalleLote({ lote, onVolver, textoVolver = '← Volver', acciones = null, compacta = false }) {
  if (!lote) return null;
  const peorNivel = lote.peorNivel ?? 0;
  const color = nivelColor(peorNivel);
  const colorTexto = nivelColorTexto(peorNivel);
  const bg = nivelBg(peorNivel);
  const total = lote.total ?? 0;
  const fechaTexto = lote.ultimaFecha ? formatFecha(lote.ultimaFecha, { conHora: true }) : 'Sin fecha';

  if (compacta) {
    const chip = {
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 999,
      background: 'var(--bg-inset)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
      fontSize: 'var(--text-3xs)', fontWeight: 600, whiteSpace: 'nowrap',
    };
    return (
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '4px 8px', marginBottom: 6,
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
        fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums',
      }}>
        {onVolver && (
          // Botón secundario con contorno marcado y texto principal: se distingue de los chips
          // sin pasar del alto de los botones de acciones (mismo relleno que "Seleccionar lote completo").
          <button type="button" onClick={onVolver} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
            background: 'var(--bg-card-solid)', border: '1px solid var(--border-strong)', borderRadius: 7,
            cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
            fontWeight: 700, fontSize: 'var(--text-2xs)', flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            <IconoVolver size={13} aria-hidden="true" />
            {textoVolver}
          </button>
        )}
        <span title={`Lote: ${lote.nombre}`} style={{
          fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, maxWidth: '100%',
        }}>
          {lote.nombre}
        </span>
        <EstadoLoteBadge estado={lote.estado} />
        <span role="group" aria-label="Resumen del lote" style={{ display: 'contents' }}>
          <span style={chip} title={fechaTexto}>{total} img</span>
          <span style={{ ...chip, color: colorTexto, background: bg, borderColor: `${color}45`, fontWeight: 700 }}>
            <NivelIcon nivel={peorNivel} size={11} color={color} />
            {nivelLabel(peorNivel)}
          </span>
          <span style={chip}>máx {formatoPct(lote.peorPct ?? 0)}</span>
          <span style={chip}>prom {formatoPct(lote.promedioPct ?? 0)}</span>
        </span>
        {acciones && <div style={{ marginLeft: 'auto' }}>{acciones}</div>}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      padding: compacta ? '10px 12px' : '12px 14px',
      marginBottom: compacta ? 8 : 14,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {onVolver && (
            <button
              type="button"
              onClick={onVolver}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 11px',
                background: 'var(--bg-inset)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 600,
                fontSize: 'var(--text-2xs)',
              }}
            >
              {textoVolver}
            </button>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                fontSize: compacta ? 'var(--text-xs)' : 'var(--text-sm)',
                color: 'var(--text-primary)',
              }}>
                Lote: {lote.nombre}
              </span>
              <EstadoLoteBadge estado={lote.estado} />
            </div>
            <div style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-muted)',
              marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {plural(total, 'medición', 'mediciones')} · Fecha: {fechaTexto}
            </div>
          </div>
        </div>

        {acciones}
      </div>

      {/* Particularidades del lote */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 8,
        padding: '8px 10px',
        background: 'var(--bg-inset)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontFamily: 'var(--font-ui)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <div>
          <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', textTransform: 'uppercase', fontWeight: 600 }}>
            Cantidad
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
            {plural(total, 'medición', 'mediciones')}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', textTransform: 'uppercase', fontWeight: 600 }}>
            Peor nivel
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 2,
            padding: '1px 7px',
            borderRadius: 999,
            background: bg,
            border: `1px solid ${color}45`,
            color: colorTexto,
            fontSize: 'var(--text-2xs)',
            fontWeight: 700,
          }}>
            <NivelIcon nivel={peorNivel} size={12} color={color} />
            <span>{nivelLabel(peorNivel)}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', textTransform: 'uppercase', fontWeight: 600 }}>
            % máximo
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: colorTexto, marginTop: 2 }}>
            {formatoPct(lote.peorPct ?? 0)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', textTransform: 'uppercase', fontWeight: 600 }}>
            % promedio
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
            {formatoPct(lote.promedioPct ?? 0)}
          </div>
        </div>
      </div>
    </div>
  );
}
