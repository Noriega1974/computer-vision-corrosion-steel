import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { IconoCasillaMarcada, IconoEliminar, IconoMoverACarpeta, IconoSinResultados, IconoVolver } from './Iconos';
import MedicionCard from './MedicionCard';
import BarraSeleccion from './BarraSeleccion';
import { puedeGestionarMedicion, puedeGestionarLote } from '../lib/permisosMediciones';
import { EliminarLoteDialog, MoverLoteDialog } from './LoteDialogs';
import { useAuth } from '../auth/AuthContext';
import { useAccionesLote } from '../hooks/useAccionesLote';
import { NIVELES, nivelColor, nivelLabel } from '../lib/statusUtils';
import NivelInfo from './NivelInfo';
import DatePicker from './DatePicker';
import { enRangoDiasColombia, hoyColombiaISO, fechaUltimaMedicionISO } from '../lib/fechas';
import { agruparPorLote, contarOcultasPorFiltro, formatearConteoMediciones, medicionesDeLote } from '../lib/galeriaCarpetas';
import TarjetaLote, { FichaDetalleLote } from './TarjetaLote';

const ORDENES = [
  { key: 'recientes', label: 'Más recientes' },
  { key: 'antiguas', label: 'Más antiguas' },
  { key: 'mayor', label: 'Mayor corrosión' },
  { key: 'menor', label: 'Menor corrosión' },
];

const tiempo = (m) => new Date(m.timestamp).getTime() || 0;
const pct = (m) => Number(m.area_corroida_pct ?? 0);
const COMPARADORES = {
  recientes: (a, b) => tiempo(b) - tiempo(a),
  antiguas: (a, b) => tiempo(a) - tiempo(b),
  mayor: (a, b) => pct(b) - pct(a),
  menor: (a, b) => pct(a) - pct(b),
};

// Roles que pueden eliminar y mover fotos (cliente solo mira).
const ROLES_GESTION = ['super_admin', 'admin', 'tecnico'];
// La partition key de la medición; si el ítem no la trae, el bloque al que pertenece.
const idPuntoDe = (m) => m.id_punto || m.bloque_id;

const controlStyle = {
  padding: '4px 8px', background: 'var(--bg-inset)',
  border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-2xs)', height: 28, boxSizing: 'border-box',
};

const etiquetaStyle = {
  fontSize: 'var(--text-3xs)', color: 'var(--text-faint)',
  fontFamily: 'var(--font-data)', letterSpacing: '0.08em',
};

// Rejilla de fotos con filtros de nivel y fechas y orden. Se usa tanto en la
// página de un punto como en los resultados de búsqueda.
//  - mediciones: las fotos a mostrar (ya acotadas por punto o por búsqueda).
//  - contexto: función opcional (medicion) => "Empresa · Punto" para el subtítulo.
//  - volverA: ruta (con query) a la que regresa la ficha de una medición.
//  - puntoActual: id del punto que se está viendo (se excluye como destino de "Mover").
//  - toolbarTarget: nodo DOM opcional en la fila del buscador para alinear
//    conteo, orden y botón "Seleccionar" en una sola barra.
//  - onSeleccionChange: avisa a la página cuando entra/sale del modo selección.
//  - listaIncompleta: el punto llegó al tope de fotos que devuelve la API, así que
//    no se puede saber qué contiene un lote completo: se bloquean las acciones de lote.
export default function GaleriaFotos({
  mediciones, contexto, volverA, puntoActual, toolbarTarget, onSeleccionChange, listaIncompleta = false,
}) {
  const location = useLocation();
  const { user } = useAuth();
  const puedeGestionar = ROLES_GESTION.some(r => user?.groups?.includes(r));
  // El técnico solo mueve y elimina lo que él tomó (regla del backend): las demás fotos no se pueden marcar.
  const gestionable = (m) => Boolean(idPuntoDe(m)) && puedeGestionarMedicion(user?.groups, user?.sub, m);
  const { eliminar, mover, procesando } = useAccionesLote();
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [dialogo, setDialogo] = useState(null); // 'mover' | 'eliminar'
  // Las acciones de lote actúan sobre TODO el lote, no solo sobre lo que dejan ver los filtros.
  const [seleccionLoteCompleto, setSeleccionLoteCompleto] = useState(false);
  const [resumen, setResumen] = useState(null); // { texto, errores: [...] }
  // Al volver desde la ficha de una medición, los filtros llegan por el state
  // de navegación (ver handleBack en MedicionDetailPage). Se leen una sola vez.
  const [restored] = useState(() => location.state ?? {});
  const [nivelFilter, setNivelFilter] = useState(restored.nivelFilter ?? 'all');
  const [fechaInicio, setFechaInicio] = useState(restored.fechaInicio ?? '');
  const [fechaFin, setFechaFin] = useState(restored.fechaFin ?? '');
  const [orden, setOrden] = useState(restored.orden ?? 'recientes');
  const [loteAbiertoId, setLoteAbiertoId] = useState(restored.loteAbiertoId ?? null);
  const [mostrarTodas, setMostrarTodas] = useState(false);

  // Reset the open batch only when the viewed point changes, not on mount, so a
  // batch folder restored from the navigation state (coming back from a photo
  // detail) stays open.
  const puntoPrevio = useRef(puntoActual);
  useEffect(() => {
    if (puntoPrevio.current === puntoActual) return;
    puntoPrevio.current = puntoActual;
    setLoteAbiertoId(null);
    setMostrarTodas(false);
  }, [puntoActual]);

  useEffect(() => {
    onSeleccionChange?.(seleccionando);
    return () => onSeleccionChange?.(false);
  }, [seleccionando, onSeleccionChange]);

  const hayFiltros = nivelFilter !== 'all' || fechaInicio || fechaFin;
  const medicionesPorNivel = mediciones.filter(
    m => nivelFilter === 'all' || (m.nivel_corrosion ?? 0) === Number(nivelFilter),
  );
  const filtradas = medicionesPorNivel
    .filter(m => enRangoDiasColombia(m.timestamp, fechaInicio, fechaFin))
    .sort(COMPARADORES[orden]);

  const agrupado = puntoActual ? agruparPorLote(filtradas) : { lotes: [], sueltas: filtradas };
  const lotes = agrupado.lotes;
  const sueltas = [...agrupado.sueltas].sort(COMPARADORES[orden]);
  const loteAbierto = loteAbiertoId ? lotes.find(l => l.id === loteAbiertoId) ?? null : null;

  useEffect(() => {
    if (loteAbiertoId && !loteAbierto) {
      setLoteAbiertoId(null);
    }
  }, [loteAbiertoId, loteAbierto]);

  const visibles = loteAbierto
    ? [...loteAbierto.mediciones].sort(COMPARADORES[orden])
    : (lotes.length > 0 && !mostrarTodas ? sueltas : filtradas);

  // Lote abierto con TODAS sus fotos, sin filtros de nivel/fechas (solo datos del punto).
  const loteCompleto = loteAbierto ? medicionesDeLote(mediciones, loteAbierto.id) : [];
  const accionesLoteBloqueadas = listaIncompleta;
  const tituloAccionLote = accionesLoteBloqueadas
    ? 'Este punto tiene más fotos de las que se pueden cargar a la vez, así que no se puede garantizar el lote completo.'
    : undefined;

  // Por defecto solo cuentan las marcadas que siguen visibles tras los filtros:
  // nunca las fotos escondidas dentro de una carpeta de lote que no está abierta.
  // Con una acción de lote, el universo es el lote entero aunque los filtros oculten parte.
  const universo = seleccionLoteCompleto && loteAbierto ? loteCompleto : visibles;
  const elegibles = universo.filter(gestionable);
  const elegidas = elegibles.filter(m => marcadas.has(m.id_medicion));
  const ocultasPorFiltro = seleccionLoteCompleto && loteAbierto
    ? contarOcultasPorFiltro(elegidas, visibles, marcadas, idPuntoDe)
    : 0;

  const salirDeSeleccion = () => {
    setSeleccionando(false); setSeleccionLoteCompleto(false); setMarcadas(new Set()); setDialogo(null);
  };
  const accionDeLote = (dialogoInicial) => {
    const idsLote = new Set(loteCompleto.filter(gestionable).map(m => m.id_medicion));
    setSeleccionLoteCompleto(true);
    setSeleccionando(true);
    setMarcadas(idsLote);
    setResumen(null);
    setDialogo(dialogoInicial);
  };
  const alternar = (id) => setMarcadas(prev => {
    const sig = new Set(prev);
    if (sig.has(id)) sig.delete(id); else sig.add(id);
    return sig;
  });
  const alternarTodas = () => setMarcadas(
    elegidas.length === elegibles.length ? new Set() : new Set(elegibles.map(m => m.id_medicion)),
  );

  // Escape cierra el diálogo abierto o, si no hay, sale del modo selección.
  useEffect(() => {
    if (!seleccionando) return undefined;
    const alTecla = (e) => {
      if (e.key !== 'Escape' || procesando) return;
      if (dialogo) setDialogo(null); else salirDeSeleccion();
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [seleccionando, dialogo, procesando]);

  async function ejecutar(accion, verbo, destinoNombre) {
    const nombres = new Map(elegidas.map(m => [m.id_medicion, m.nombre || m.bloque_nombre || m.id_medicion]));
    const { ok, error } = await accion(elegidas.map(m => ({ id_punto: idPuntoDe(m), id_medicion: m.id_medicion })));
    // "3 fotos movidas a <punto>" / "1 foto eliminada".
    const accionTxt = `${ok.length} ${ok.length === 1 ? 'foto' : 'fotos'} ${ok.length === 1 ? verbo.sing : verbo.plur}`;
    const partes = [destinoNombre ? `${accionTxt} a ${destinoNombre}` : accionTxt];
    if (error.length) partes.push(`${error.length} con error`);
    setResumen({
      texto: partes.join(', '),
      errores: error.map(e => `${nombres.get(e.id_medicion) ?? e.id_medicion}: ${e.motivo}`),
      conError: error.length > 0,
    });
    salirDeSeleccion();
  }

  const controlesBarra = (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {formatearConteoMediciones(filtradas)}
        {filtradas.length !== mediciones.length ? ` (de ${mediciones.length} en total)` : ''}
      </span>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <label htmlFor="galeria-orden" style={etiquetaStyle}>ORDEN:</label>
        <select id="galeria-orden" value={orden} onChange={e => setOrden(e.target.value)} style={{ ...controlStyle, height: 32 }}>
          {ORDENES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      {puedeGestionar && !seleccionando && elegibles.length > 0 && (
        <button
          type="button" onClick={() => { setSeleccionLoteCompleto(false); setSeleccionando(true); setResumen(null); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 11px', height: 32,
            background: 'var(--bg-card-solid)', border: '1px solid var(--border-strong)', borderRadius: 7,
            cursor: 'pointer', color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)',
          }}
        >
          <IconoCasillaMarcada size={14} aria-hidden="true" />
          Seleccionar
        </button>
      )}
    </div>
  );

  return (
    <>
      {toolbarTarget ? createPortal(controlesBarra, toolbarTarget) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          {controlesBarra}
        </div>
      )}

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 9, padding: '7px 12px', marginBottom: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', rowGap: 6, columnGap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={etiquetaStyle}>NIVEL:</span>
          {[
            { key: 'all', label: 'Todos', color: 'var(--text-muted)' },
            ...NIVELES.map((_, n) => ({ key: String(n), label: nivelLabel(n), color: nivelColor(n) })),
          ].map(({ key, label, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => setNivelFilter(key)}
              style={{
                padding: '2px 8px', borderRadius: 20,
                border: `1px solid ${nivelFilter === key ? color : 'var(--border)'}`,
                background: nivelFilter === key ? `${color}18` : 'transparent',
                color: nivelFilter === key ? color : 'var(--text-muted)',
                fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', cursor: 'pointer',
                fontWeight: nivelFilter === key ? 600 : 400, lineHeight: 1.35,
                transition: 'color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
              }}
            >
              {label}
            </button>
          ))}
          <NivelInfo />
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginLeft: 'auto',
        }}>
          <span style={etiquetaStyle}>FECHA:</span>
          <DatePicker
            id="galeria-fechas"
            mode="range"
            allowModeSwitch={true}
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
            onChangeRango={(ini, fin) => {
              setFechaInicio(ini);
              setFechaFin(fin);
            }}
            maxISO={hoyColombiaISO()}
            inspecciones={medicionesPorNivel}
            mesInicial={fechaUltimaMedicionISO(mediciones)}
            ctaLabel="Filtrar fotos"
            clearLabel="Limpiar filtro"
            futureTitle="No hay fotos en fechas futuras"
          />
          {hayFiltros && (
            <button
              type="button"
              onClick={() => { setNivelFilter('all'); setFechaInicio(''); setFechaFin(''); }}
              style={{
                padding: '3px 8px', background: 'transparent',
                border: '1px dashed var(--border-strong)', borderRadius: 6,
                cursor: 'pointer', color: 'var(--text-muted)',
                fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)',
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {resumen && (
        <div role="status" style={{
          display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 10,
          padding: '9px 12px', borderRadius: 9, background: 'var(--bg-card)',
          border: `1px solid ${resumen.conError ? 'var(--accent-red)' : 'var(--border)'}`,
          fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{resumen.texto}</strong>
            {resumen.errores.map(t => (
              <div key={t} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>{t}</div>
            ))}
          </div>
          <button
            type="button" onClick={() => setResumen(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}
          >
            Cerrar
          </button>
        </div>
      )}

      {filtradas.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
          textAlign: 'center', padding: '40px 20px',
          color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
        }}>
          <IconoSinResultados size={26} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
          No hay fotos que coincidan con los filtros seleccionados.
        </div>
      ) : (
        <>
          {loteAbierto && (
            <FichaDetalleLote
              lote={loteAbierto}
              onVolver={() => { setLoteAbiertoId(null); salirDeSeleccion(); }}
              textoVolver="← Todos los lotes del punto"
              compacta
              acciones={puedeGestionar && puedeGestionarLote(user?.groups, user?.sub, loteCompleto) ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => accionDeLote(null)}
                    disabled={accionesLoteBloqueadas}
                    title={tituloAccionLote}
                    style={{
                      opacity: accionesLoteBloqueadas ? 0.5 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
                      background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 7,
                      cursor: accionesLoteBloqueadas ? 'not-allowed' : 'pointer', color: 'var(--text-primary)',
                      fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-2xs)',
                    }}
                  >
                    <IconoCasillaMarcada size={13} aria-hidden="true" />
                    Seleccionar lote completo
                  </button>
                  <button
                    type="button"
                    onClick={() => accionDeLote('mover')}
                    disabled={accionesLoteBloqueadas}
                    title={tituloAccionLote}
                    style={{
                      opacity: accionesLoteBloqueadas ? 0.5 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
                      background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 7,
                      cursor: accionesLoteBloqueadas ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-2xs)',
                    }}
                  >
                    <IconoMoverACarpeta size={13} aria-hidden="true" />
                    Mover lote
                  </button>
                  <button
                    type="button"
                    onClick={() => accionDeLote('eliminar')}
                    disabled={accionesLoteBloqueadas}
                    title={tituloAccionLote}
                    style={{
                      opacity: accionesLoteBloqueadas ? 0.5 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
                      background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 7,
                      cursor: accionesLoteBloqueadas ? 'not-allowed' : 'pointer', color: 'var(--accent-red)',
                      fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-2xs)',
                    }}
                  >
                    <IconoEliminar size={13} aria-hidden="true" />
                    Eliminar lote
                  </button>
                </div>
              ) : null}
            />
          )}

          {!loteAbierto && lotes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 8, marginBottom: 10,
              }}>
                <div style={{
                  fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                  Lotes del punto ({lotes.length})
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarTodas(prev => !prev)}
                  style={{
                    padding: '4px 10px', borderRadius: 999,
                    border: `1px solid ${mostrarTodas ? 'var(--accent-amber)' : 'var(--border)'}`,
                    background: mostrarTodas ? 'rgba(156,54,16,0.1)' : 'var(--bg-inset)',
                    color: mostrarTodas ? 'var(--accent-amber)' : 'var(--text-secondary)',
                    fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {mostrarTodas ? 'Ver solo fotos individuales abajo' : 'Todas las fotos'}
                </button>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 'var(--space-4)',
              }}>
                {lotes.map(lote => (
                  <TarjetaLote
                    key={lote.id}
                    lote={lote}
                    onClick={() => { setLoteAbiertoId(lote.id); salirDeSeleccion(); }}
                  />
                ))}
              </div>
            </div>
          )}

          {!loteAbierto && lotes.length > 0 && visibles.length > 0 && (
            <div style={{
              fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              {mostrarTodas ? `Todas las fotos (${visibles.length})` : `Fotos individuales (${visibles.length})`}
            </div>
          )}

          {visibles.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 'var(--space-4)',
            }}>
              {visibles.map(m => (
                <MedicionCard
                  key={m.id_medicion}
                  medicion={m}
                  contexto={contexto?.(m)}
                  to={m.bloque_id ? `/galeria/${m.id_medicion}?punto=${encodeURIComponent(m.bloque_id)}` : `/galeria/${m.id_medicion}`}
                  state={{ filters: { nivelFilter, fechaInicio, fechaFin, orden, loteAbiertoId }, volver: volverA }}
                  seleccion={seleccionando && gestionable(m) ? {
                    marcada: marcadas.has(m.id_medicion),
                    onToggle: () => alternar(m.id_medicion),
                  } : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}

      {seleccionando && (
        <BarraSeleccion
          cantidad={elegidas.length}
          total={elegibles.length}
          deshabilitado={procesando}
          onSeleccionarTodo={alternarTodas}
          onMover={() => setDialogo('mover')}
          onEliminar={() => setDialogo('eliminar')}
          onCancelar={salirDeSeleccion}
        />
      )}
      {dialogo === 'eliminar' && (
        <EliminarLoteDialog
          cantidad={elegidas.length}
          ocultasPorFiltro={ocultasPorFiltro}
          procesando={procesando}
          onCancelar={() => setDialogo(null)}
          onConfirmar={() => ejecutar(eliminar, { sing: 'eliminada', plur: 'eliminadas' })}
        />
      )}
      {dialogo === 'mover' && (
        <MoverLoteDialog
          cantidad={elegidas.length}
          ocultasPorFiltro={ocultasPorFiltro}
          puntoActual={puntoActual}
          procesando={procesando}
          onCancelar={() => setDialogo(null)}
          onConfirmar={(destino, nombreDestino) => ejecutar(items => mover(items, destino), { sing: 'movida', plur: 'movidas' }, nombreDestino)}
        />
      )}
    </>
  );
}
