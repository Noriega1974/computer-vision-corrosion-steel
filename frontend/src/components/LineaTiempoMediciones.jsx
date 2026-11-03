import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  IconoBuscar,
  IconoCamara,
  IconoCerrar,
  IconoFlechaAbajo,
  IconoFlechaArriba,
  IconoMoverACarpeta,
  IconoReloj,
  IconoSinResultados,
} from './Iconos';
import NivelIcon from './NivelIcon';
import NivelInfo from './NivelInfo';
import DatePicker from './DatePicker';
import Skeleton, { SkeletonLinea } from './Skeleton';
import { useMediciones, LIMITE_DASHBOARD } from '../hooks/useMediciones';
import { useResumenDiario } from '../hooks/useResumenDiario';
import { useBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';
import { useAuth } from '../auth/AuthContext';
import { NIVELES, nivelColor, nivelLabel, nivelBg } from '../lib/statusUtils';
import { formatoPct, etiquetaBase } from '../lib/textUtils';
import { hoyLocalISO, fechaUltimaMedicionISO } from '../lib/fechas';
import { formatFecha } from '../utils/dateFormat';
import { tiempoRelativo } from '../lib/tiempoRelativo';
import {
  filtrarMedicionesLineaTiempo,
  agruparEventosPorDia,
  autorDeMedicion,
  ANIO_MINIMO_LINEA_TIEMPO,
  aniosDisponiblesLineaTiempo,
  construirBarraAnualDesdeResumen,
  colorNivelBarra,
} from '../lib/lineaTiempo';

const EVENTOS_POR_PAGINA = 25;
// Same limit as the dashboard so apiGet dedupes both requests into one.
const LIMITE_LINEA_TIEMPO = LIMITE_DASHBOARD;

const etiquetaFiltroStyle = {
  fontSize: 'var(--text-3xs)',
  color: 'var(--text-faint)',
  fontFamily: 'var(--font-data)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 600,
};

const selectStyle = {
  height: 32,
  padding: '0 10px',
  background: 'var(--bg-card-solid)',
  border: '1px solid var(--border-strong)',
  borderRadius: 7,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  boxSizing: 'border-box',
};

function NivelBadge({ nivel }) {
  const niv = nivel ?? 0;
  const color = nivelColor(niv);
  const bg = nivelBg(niv);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 9px',
      borderRadius: 999,
      background: bg,
      border: `1px solid ${color}55`,
      color,
      fontFamily: 'var(--font-ui)',
      fontWeight: 700,
      fontSize: 'var(--text-2xs)',
      whiteSpace: 'nowrap',
    }}>
      <NivelIcon nivel={niv} size={14} color={color} />
      <span>{nivelLabel(niv)}</span>
    </span>
  );
}

function TarjetaMedicionIndividual({ medicion, esSuperAdmin, nombreEmpresa }) {
  const nivel = medicion.nivel_corrosion ?? 0;
  const color = nivelColor(nivel);
  const idBloque = medicion.bloque_id || medicion.id_punto;
  const destino = idBloque
    ? `/galeria/${medicion.id_medicion}?punto=${encodeURIComponent(idBloque)}`
    : `/galeria/${medicion.id_medicion}`;
  const autor = autorDeMedicion(medicion);
  const puntoNombre = medicion.bloque_nombre || 'Sin punto asignado';
  const thumb = medicion.url_thumbnail || medicion.url_imagen;

  return (
    <Link
      to={destino}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        textDecoration: 'none',
        color: 'inherit',
        flexWrap: 'wrap',
        transition: 'border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 260px' }}>
        {thumb ? (
          <img
            src={thumb}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            style={{
              width: 48,
              height: 48,
              objectFit: 'cover',
              borderRadius: 8,
              border: '1px solid var(--border)',
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            background: `${color}15`,
            border: `1px solid ${color}35`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
            flexShrink: 0,
          }}>
            <IconoCamara size={18} aria-hidden="true" />
          </div>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {medicion.nombre || puntoNombre}
            </span>
            {medicion.nombre && (
              <span style={{
                fontSize: 'var(--text-2xs)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-ui)',
              }}>
                · {puntoNombre}
              </span>
            )}
            {esSuperAdmin && medicion.empresa_id && (
              <span style={{
                padding: '1px 7px',
                borderRadius: 999,
                background: 'var(--bg-inset)',
                border: '1px solid var(--border)',
                fontSize: 'var(--text-3xs)',
                fontFamily: 'var(--font-data)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
              }}>
                {nombreEmpresa(medicion.empresa_id)}
              </span>
            )}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 4,
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-ui)',
          }}>
            <span>{formatFecha(medicion.timestamp, { conHora: true })}</span>
            <span>·</span>
            <span>{tiempoRelativo(medicion.timestamp, { vacio: 'Sin fecha', formatFecha })}</span>
            {autor && (
              <>
                <span>·</span>
                <span>Por {autor}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 800,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-primary)',
          }}>
            {formatoPct(medicion.area_corroida_pct)}
          </div>
          <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>
            {etiquetaBase(medicion)}
          </div>
        </div>
        <NivelBadge nivel={nivel} />
      </div>
    </Link>
  );
}

function TarjetaEventoLote({ evento, esSuperAdmin, nombreEmpresa }) {
  const [expandido, setExpandido] = useState(false);
  const color = nivelColor(evento.peorNivel ?? 0);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 260px' }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-amber)',
            flexShrink: 0,
          }}>
            <IconoMoverACarpeta size={20} aria-hidden="true" />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
              }}>
                Lote: {evento.loteNombre} · {evento.totalFotos} {evento.totalFotos === 1 ? 'foto' : 'fotos'}
              </span>
              <span style={{
                fontSize: 'var(--text-2xs)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-ui)',
              }}>
                · {evento.puntoNombre}
              </span>
              {esSuperAdmin && evento.empresaId && (
                <span style={{
                  padding: '1px 7px',
                  borderRadius: 999,
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--border)',
                  fontSize: 'var(--text-3xs)',
                  fontFamily: 'var(--font-data)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                }}>
                  {nombreEmpresa(evento.empresaId)}
                </span>
              )}
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 4,
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-ui)',
            }}>
              <span>{formatFecha(evento.timestamp, { conHora: true })}</span>
              <span>·</span>
              <span>Promedio {formatoPct(evento.promedioPct)}</span>
              {evento.autor && (
                <>
                  <span>·</span>
                  <span>Por {evento.autor}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: 'var(--font-ui)',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 800,
              fontSize: 'var(--text-sm)',
              color,
            }}>
              Máx. {formatoPct(evento.peorPct)}
            </div>
            <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>
              Peor lectura del lote
            </div>
          </div>
          <NivelBadge nivel={evento.peorNivel} />
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              background: 'var(--bg-inset)',
              border: '1px solid var(--border)',
              borderRadius: 7,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 'var(--text-2xs)',
              cursor: 'pointer',
            }}
          >
            <span>{expandido ? 'Ocultar fotos' : `Ver las ${evento.totalFotos} fotos`}</span>
            {expandido ? <IconoFlechaArriba size={14} /> : <IconoFlechaAbajo size={14} />}
          </button>
        </div>
      </div>

      {expandido && (
        <div style={{
          padding: '10px 14px 12px',
          background: 'var(--bg-inset)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {evento.mediciones.map((m) => (
            <TarjetaMedicionIndividual
              key={m.id_medicion}
              medicion={m}
              esSuperAdmin={esSuperAdmin}
              nombreEmpresa={nombreEmpresa}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Fed by the server's daily summary (`resumenDias`, one year), not by the loaded
// measurement list: the bar covers every photo of the year, not the 1000 latest.
// `nivel` ('all' | '0'..'3') keeps only that level in the days.
export function BarraAnualLineaTiempo({
  resumenDias = [],
  nivel = 'all',
  cargando = false,
  anioSeleccionado,
  onChangeAnio,
  diaFiltradoISO = '',
  onSeleccionarDia,
  onLimpiarDia,
  modoColorInicial = 'segmentos',
}) {
  const aniosDisponibles = useMemo(() => aniosDisponiblesLineaTiempo(), []);
  const anioActivo = aniosDisponibles.includes(Number(anioSeleccionado))
    ? Number(anioSeleccionado)
    : aniosDisponibles[aniosDisponibles.length - 1] ?? ANIO_MINIMO_LINEA_TIEMPO;

  const [modoColor, setModoColor] = useState(
    modoColorInicial === 'degradado' ? 'degradado' : 'segmentos',
  );
  const [diaHoverISO, setDiaHoverISO] = useState('');

  const barra = useMemo(
    () => construirBarraAnualDesdeResumen(resumenDias, anioActivo, { nivel }),
    [resumenDias, anioActivo, nivel],
  );

  const ultimoDiaConFotos = useMemo(() => {
    for (let i = barra.dias.length - 1; i >= 0; i -= 1) {
      if (!barra.dias[i].sinFotos) return barra.dias[i];
    }
    return null;
  }, [barra.dias]);

  const diaInspeccionado = useMemo(() => {
    if (diaHoverISO) {
      const encontrado = barra.dias.find((d) => d.fechaISO === diaHoverISO);
      if (encontrado) return encontrado;
    }
    if (diaFiltradoISO) {
      const filtrado = barra.dias.find((d) => d.fechaISO === diaFiltradoISO);
      if (filtrado) return filtrado;
    }
    return ultimoDiaConFotos;
  }, [barra.dias, diaHoverISO, diaFiltradoISO, ultimoDiaConFotos]);

  return (
    <div className="lt-barra-anual" aria-label={`Actividad anual de mediciones ${barra.anio}`}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-primary)',
          }}>
            Actividad anual ({barra.anio}) · 1 de enero al 31 de diciembre
          </div>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-muted)',
            marginTop: 2,
          }}>
            {barra.diasConFotos} {barra.diasConFotos === 1 ? 'día con mediciones' : 'días con mediciones'} · {barra.totalFotosAnio} {barra.totalFotosAnio === 1 ? 'imagen registrada' : 'imágenes registradas'} en {barra.anio}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            role="group"
            aria-label="Modo de color en días con múltiples niveles"
            style={{
              display: 'inline-flex',
              padding: 2,
              background: 'var(--bg-inset)',
              border: '1px solid var(--border)',
              borderRadius: 7,
              gap: 2,
            }}
          >
            {[
              { id: 'segmentos', label: 'Segmentos' },
              { id: 'degradado', label: 'Degradado' },
            ].map((op) => {
              const activo = modoColor === op.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setModoColor(op.id)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 5,
                    border: activo ? '1px solid var(--border-strong)' : '1px solid transparent',
                    background: activo ? 'var(--bg-card-solid)' : 'transparent',
                    color: activo ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-3xs)',
                    fontWeight: activo ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {op.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <label htmlFor="lt-anio-barra" style={etiquetaFiltroStyle}>Año:</label>
            <select
              id="lt-anio-barra"
              aria-label="Año de la barra anual"
              value={anioActivo}
              onChange={(e) => onChangeAnio?.(Number(e.target.value))}
              style={selectStyle}
            >
              {aniosDisponibles.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {diaFiltradoISO && (
            <button
              type="button"
              onClick={onLimpiarDia}
              style={{
                padding: '4px 10px',
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-strong)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-2xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Ver todo el año
            </button>
          )}
        </div>
      </div>

      {/* Pista horizontal de 365/366 días */}
      <div
        className="lt-barra-anual__pista"
        onMouseLeave={() => setDiaHoverISO('')}
      >
        {barra.dias.map((dia) => {
          const esInicioMes = dia.diaMes === 1 && dia.mes > 1;
          const esActivo = diaFiltradoISO === dia.fechaISO;
          const claseBase = [
            'lt-barra-anual__dia',
            esInicioMes ? 'lt-barra-anual__dia--inicio-mes' : '',
            !dia.sinFotos ? 'lt-barra-anual__dia--con-fotos' : '',
            esActivo ? 'lt-barra-anual__dia--activo' : '',
          ]
            .filter(Boolean)
            .join(' ');

          if (dia.sinFotos) {
            return (
              <div
                key={dia.fechaISO}
                className={claseBase}
                title={dia.resumenTexto}
                aria-hidden="true"
              />
            );
          }

          const fondo =
            modoColor === 'degradado' ? dia.gradienteSuave : dia.gradienteSegmentos;

          return (
            <button
              key={dia.fechaISO}
              type="button"
              className={claseBase}
              style={{ background: fondo }}
              title={dia.resumenTexto}
              aria-label={dia.resumenTexto}
              aria-pressed={esActivo}
              onMouseEnter={() => setDiaHoverISO(dia.fechaISO)}
              onFocus={() => setDiaHoverISO(dia.fechaISO)}
              onBlur={() => setDiaHoverISO('')}
              onClick={() => {
                if (diaFiltradoISO === dia.fechaISO) {
                  onLimpiarDia?.();
                } else {
                  onSeleccionarDia?.(dia.fechaISO);
                }
              }}
            />
          );
        })}
      </div>

      {/* Etiquetas de los 12 meses alineadas por proporción de días */}
      <div className="lt-barra-anual__meses" aria-hidden="true">
        {barra.meses.map((m) => (
          <span
            key={m.mes}
            className="lt-barra-anual__mes"
            style={{ flex: `${m.diasMes} 0 0` }}
          >
            {m.etiqueta}
          </span>
        ))}
      </div>

      {/* Leyenda y detalle del día inspeccionado */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        paddingTop: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-ui)',
          }}>
            <span style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: 'var(--lt-barra-vacio)',
              border: '1px solid var(--border-strong)',
              display: 'inline-block',
            }} />
            Sin mediciones
          </span>
          {NIVELES.map((item, idx) => (
            <span
              key={item.status}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 'var(--text-2xs)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)',
              }}
            >
              <span style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: colorNivelBarra(idx),
                display: 'inline-block',
              }} />
              {item.label}
            </span>
          ))}
        </div>

        <div
          aria-live="polite"
          style={{
            fontSize: 'var(--text-2xs)',
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-secondary)',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 9px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {diaInspeccionado
            ? diaInspeccionado.resumenTexto
            : cargando ? 'Cargando la actividad del año...' : `Sin mediciones registradas en ${barra.anio}`}
        </div>
      </div>
    </div>
  );
}

export default function LineaTiempoMediciones() {
  const { user } = useAuth();
  const esSuperAdmin = Boolean(user?.groups?.includes('super_admin'));
  const { mediciones, loading, error } = useMediciones(LIMITE_LINEA_TIEMPO, { resumen: true });
  const { bloques } = useBloques();
  const { empresas } = useEmpresas(esSuperAdmin);

  const [empresaId, setEmpresaId] = useState('all');
  const [bloqueId, setBloqueId] = useState('all');
  const [nivel, setNivel] = useState('all');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [limiteEventos, setLimiteEventos] = useState(EVENTOS_POR_PAGINA);
  const [anioBarra, setAnioBarra] = useState(() =>
    Math.max(ANIO_MINIMO_LINEA_TIEMPO, new Date().getFullYear()),
  );

  const nombreEmpresa = (id) => empresas.find((e) => e.id_empresa === id)?.nombre || 'Zona';

  const bloquesDisponibles = useMemo(() => {
    if (!esSuperAdmin || empresaId === 'all') return bloques;
    return bloques.filter((b) => String(b.empresa_id) === String(empresaId));
  }, [bloques, esSuperAdmin, empresaId]);

  // Barra anual: agregados del servidor para el año elegido (todas las fotos del
  // año, no solo las 1000 recientes). Respeta zona, punto y nivel; la búsqueda por
  // texto solo afecta la lista de abajo.
  const resumenAnual = useResumenDiario({
    anios: [anioBarra],
    idPunto: bloqueId !== 'all' ? bloqueId : undefined,
    empresaId: esSuperAdmin && empresaId !== 'all' ? empresaId : undefined,
  });

  const medicionesFiltradas = useMemo(
    () =>
      filtrarMedicionesLineaTiempo(mediciones, {
        empresaId: esSuperAdmin ? empresaId : 'all',
        bloqueId,
        nivel,
        fechaInicio,
        fechaFin,
        busqueda,
      }),
    [mediciones, esSuperAdmin, empresaId, bloqueId, nivel, fechaInicio, fechaFin, busqueda],
  );

  const diaUnicoFiltradoISO =
    fechaInicio && fechaFin && fechaInicio === fechaFin ? fechaInicio : '';

  const diasAgrupados = useMemo(
    () => agruparEventosPorDia(medicionesFiltradas),
    [medicionesFiltradas],
  );

  const totalEventos = useMemo(
    () => diasAgrupados.reduce((acc, d) => acc + d.eventos.length, 0),
    [diasAgrupados],
  );

  // Recorta los grupos de días para mostrar hasta `limiteEventos` eventos en total.
  const diasPaginados = useMemo(() => {
    let restantes = limiteEventos;
    const salida = [];
    for (const d of diasAgrupados) {
      if (restantes <= 0) break;
      const evs = d.eventos.slice(0, restantes);
      restantes -= evs.length;
      salida.push({ ...d, eventos: evs });
    }
    return salida;
  }, [diasAgrupados, limiteEventos]);

  const hayFiltros =
    (esSuperAdmin && empresaId !== 'all') ||
    bloqueId !== 'all' ||
    nivel !== 'all' ||
    Boolean(fechaInicio) ||
    Boolean(fechaFin) ||
    Boolean(busqueda.trim());

  const limpiarFiltros = () => {
    setEmpresaId('all');
    setBloqueId('all');
    setNivel('all');
    setFechaInicio('');
    setFechaFin('');
    setBusqueda('');
    setLimiteEventos(EVENTOS_POR_PAGINA);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Barra horizontal anual (exclusiva de Línea de tiempo) */}
      <BarraAnualLineaTiempo
        resumenDias={resumenAnual.dias}
        nivel={nivel}
        cargando={resumenAnual.loading}
        anioSeleccionado={anioBarra}
        onChangeAnio={(nuevoAnio) => {
          setAnioBarra(nuevoAnio);
          if (
            diaUnicoFiltradoISO &&
            !diaUnicoFiltradoISO.startsWith(`${nuevoAnio}-`)
          ) {
            setFechaInicio('');
            setFechaFin('');
          }
        }}
        diaFiltradoISO={diaUnicoFiltradoISO}
        onSeleccionarDia={(iso) => {
          setFechaInicio(iso);
          setFechaFin(iso);
          setLimiteEventos(EVENTOS_POR_PAGINA);
        }}
        onLimpiarDia={() => {
          setFechaInicio('');
          setFechaFin('');
          setLimiteEventos(EVENTOS_POR_PAGINA);
        }}
      />

      {/* Barra de filtros */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        padding: '10px 12px',
        background: 'var(--bg-inset)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {esSuperAdmin && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="lt-empresa" style={etiquetaFiltroStyle}>Zona:</label>
              <select
                id="lt-empresa"
                value={empresaId}
                onChange={(e) => {
                  setEmpresaId(e.target.value);
                  setBloqueId('all');
                  setLimiteEventos(EVENTOS_POR_PAGINA);
                }}
                style={selectStyle}
              >
                <option value="all">Todas las zonas</option>
                {empresas.map((emp) => (
                  <option key={emp.id_empresa} value={emp.id_empresa}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <label htmlFor="lt-punto" style={etiquetaFiltroStyle}>Punto:</label>
            <select
              id="lt-punto"
              value={bloqueId}
              onChange={(e) => {
                setBloqueId(e.target.value);
                setLimiteEventos(EVENTOS_POR_PAGINA);
              }}
              style={selectStyle}
            >
              <option value="all">Todos los puntos</option>
              {bloquesDisponibles.map((b) => (
                <option key={b.id_bloque} value={b.id_bloque}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={etiquetaFiltroStyle}>Nivel:</span>
            {[
              { key: 'all', label: 'Todos', color: 'var(--text-muted)' },
              ...NIVELES.map((_, n) => ({ key: String(n), label: nivelLabel(n), color: nivelColor(n) })),
            ].map(({ key, label, color }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setNivel(key);
                  setLimiteEventos(EVENTOS_POR_PAGINA);
                }}
                style={{
                  padding: '3px 9px',
                  borderRadius: 999,
                  border: `1px solid ${nivel === key ? color : 'var(--border)'}`,
                  background: nivel === key ? `${color}18` : 'transparent',
                  color: nivel === key ? color : 'var(--text-muted)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-2xs)',
                  fontWeight: nivel === key ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
            <NivelInfo />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <div style={{ position: 'relative', minWidth: 190 }}>
            <IconoBuscar
              size={13}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 9,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-faint)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="search"
              aria-label="Buscar en línea de tiempo"
              placeholder="Buscar lote, foto o autor…"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setLimiteEventos(EVENTOS_POR_PAGINA);
              }}
              style={{
                ...selectStyle,
                width: '100%',
                paddingLeft: 28,
                paddingRight: busqueda ? 26 : 10,
              }}
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                aria-label="Limpiar búsqueda"
                style={{
                  position: 'absolute',
                  right: 7,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--text-faint)',
                  display: 'flex',
                }}
              >
                <IconoCerrar size={12} />
              </button>
            )}
          </div>

          <DatePicker
            id="linea-tiempo-fechas"
            mode="range"
            allowModeSwitch={true}
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
            onChangeRango={(ini, fin) => {
              setFechaInicio(ini);
              setFechaFin(fin);
              setLimiteEventos(EVENTOS_POR_PAGINA);
            }}
            maxISO={hoyLocalISO()}
            inspecciones={mediciones}
            mesInicial={fechaUltimaMedicionISO(mediciones)}
            ctaLabel="Filtrar línea de tiempo"
            clearLabel="Limpiar fechas"
            futureTitle="No hay fotos en fechas futuras"
          />

          {hayFiltros && (
            <button
              type="button"
              onClick={limpiarFiltros}
              style={{
                padding: '4px 10px',
                background: 'transparent',
                border: '1px dashed var(--border-strong)',
                borderRadius: 6,
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-2xs)',
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Estado de carga / error / vacío / listado */}
      {loading && mediciones.length === 0 ? (
        <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
              }}
            >
              <Skeleton width={48} height={48} radius={8} />
              <div style={{ flex: 1 }}>
                <SkeletonLinea width="35%" />
                <div style={{ marginTop: 6 }}>
                  <SkeletonLinea width="55%" />
                </div>
              </div>
              <Skeleton width={90} height={24} radius={999} />
            </div>
          ))}
        </div>
      ) : error && mediciones.length === 0 ? (
        <div style={{ padding: 16, color: 'var(--accent-red)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)' }}>
          {error}
        </div>
      ) : diasPaginados.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '36px 20px',
          background: 'var(--bg-inset)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-ui)',
          textAlign: 'center',
        }}>
          <IconoSinResultados size={24} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            No hay mediciones que coincidan con los filtros seleccionados
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Ajusta el punto, el nivel de corrosión o el rango de fechas para ver más actividad.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {diasPaginados.map((dia) => (
            <div key={dia.fechaISO} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: 'var(--bg-inset)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-primary)',
                }}>
                  <IconoReloj size={14} color="var(--accent-amber)" />
                  {dia.etiquetaDia}
                </span>
                <span style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 'var(--text-2xs)',
                  color: 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {dia.totalEventos} {dia.totalEventos === 1 ? 'evento' : 'eventos'} · {dia.totalFotos} {dia.totalFotos === 1 ? 'foto' : 'fotos'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dia.eventos.map((ev) =>
                  ev.tipo === 'lote' ? (
                    <TarjetaEventoLote
                      key={`lote-${ev.id}`}
                      evento={ev}
                      esSuperAdmin={esSuperAdmin}
                      nombreEmpresa={nombreEmpresa}
                    />
                  ) : (
                    <TarjetaMedicionIndividual
                      key={`med-${ev.id}`}
                      medicion={ev.medicion}
                      esSuperAdmin={esSuperAdmin}
                      nombreEmpresa={nombreEmpresa}
                    />
                  ),
                )}
              </div>
            </div>
          ))}

          {totalEventos > limiteEventos && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setLimiteEventos((n) => n + EVENTOS_POR_PAGINA)}
                style={{
                  padding: '8px 18px',
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 600,
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                Mostrar más actividad ({totalEventos - limiteEventos} restantes)
              </button>
            </div>
          )}
        </div>
      )}

      {mediciones.length >= LIMITE_LINEA_TIEMPO && (
        <div role="note" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
          Se muestran las {LIMITE_LINEA_TIEMPO} mediciones más recientes por fecha de medición; las anteriores no aparecen aquí.
        </div>
      )}
    </div>
  );
}
