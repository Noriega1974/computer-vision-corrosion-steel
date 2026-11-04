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

  const nombreEmpresa = (id) => empresas.find((e) => e.id_empresa === id)?.nombre || 'Zona';

  const bloquesDisponibles = useMemo(() => {
    if (!esSuperAdmin || empresaId === 'all') return bloques;
    return bloques.filter((b) => String(b.empresa_id) === String(empresaId));
  }, [bloques, esSuperAdmin, empresaId]);

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
