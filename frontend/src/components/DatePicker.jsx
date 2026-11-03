import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import { IconoCalendario, IconoFlechaAtras, IconoFlechaAdelante } from './Iconos';
import {
  DIAS_SEMANA_CORTOS,
  MESES_LARGOS,
  hoyLocalISO,
  esFechaISOValida,
  inicioDiaLocal,
  finDiaLocal,
  desplazarDiasISO,
  inicioMesISO,
  formatearFechaAmigable,
  contarDiasRango,
  resumenRangoContextual,
  construirGrillaMes,
  moverFocoGrilla,
  aplicarClickRango,
  rangoAConfirmar,
  etiquetaFiltroFechas,
} from '../lib/fechas';

// Selector de fechas reutilizable (día único o rango) con popover flotante.
//
// Reglas de confirmación:
//  - Día único: elegir un día confirma al instante (no hay borrador que se pierda).
//    Con `allowModeSwitch={false}` dispara solo `onChange(iso)`; si el modo se puede
//    cambiar, dispara solo `onChangeRango(iso, iso)`.
//  - Rango: los clics arman un borrador y "Aplicar" lo confirma. Cerrar sin aplicar
//    descarta el borrador y al reabrir se muestra el valor confirmado. Con solo el
//    inicio elegido, Aplicar confirma "desde X en adelante" (fin vacío); el chip
//    "Todo hasta este día" confirma el caso inverso (inicio vacío).
//
// Teclado (patrón grid de WAI-ARIA): un solo tab stop en la grilla, flechas,
// Inicio/Fin (lunes/domingo de la semana), RePág/AvPág (mes), Enter/Espacio
// seleccionan, Escape cierra y devuelve el foco al botón disparador.
export default function DatePicker({
  mode: initialMode = 'range',
  allowModeSwitch = true,
  // Modo single
  value = '',
  onChange,
  // Modo range
  fechaInicio = '',
  fechaFin = '',
  onChangeRango,
  // Límites y contexto
  maxISO = hoyLocalISO(),
  inspecciones = null,
  // Fecha ISO (p. ej. la última medición) donde abre el calendario si no hay valor elegido
  mesInicial = '',
  ctaLabel = 'Filtrar fotos',
  clearLabel = 'Limpiar filtro',
  futureTitle = 'No puedes elegir una fecha futura',
  align = 'right',
  id,
}) {
  const hoyISO = hoyLocalISO();
  const tope = esFechaISOValida(maxISO) && maxISO < hoyISO ? maxISO : hoyISO;
  const esSoloUnico = !allowModeSwitch && initialMode === 'single';

  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const solicitarFoco = useRef(false);
  const popoverId = useId();
  const [abierto, setAbierto] = useState(false);

  // Modo elegido por el usuario cuando se puede cambiar; si no, manda la prop.
  const [modoElegido, setModoElegido] = useState(null);
  const modo = allowModeSwitch ? (modoElegido ?? initialMode) : initialMode;

  // Borradores mientras el usuario elige. Se reinician desde las props al abrir.
  const [draftUnica, setDraftUnica] = useState('');
  const [draftDesde, setDraftDesde] = useState('');
  const [draftHasta, setDraftHasta] = useState('');
  const [hoverFecha, setHoverFecha] = useState('');
  const [vistaMes, setVistaMes] = useState(() => ({
    anio: Number(hoyISO.slice(0, 4)),
    mes: Number(hoyISO.slice(5, 7)) - 1,
  }));
  const [focoISO, setFocoISO] = useState('');

  const abrir = () => {
    const unicaConfirmada = esSoloUnico
      ? value
      : fechaInicio && fechaInicio === fechaFin
        ? fechaInicio
        : '';
    const unica = esSoloUnico && !esFechaISOValida(unicaConfirmada) ? '' : unicaConfirmada;
    setDraftUnica(unica);
    setDraftDesde(esSoloUnico ? '' : fechaInicio || '');
    setDraftHasta(esSoloUnico ? '' : fechaFin || '');
    setHoverFecha('');
    if (allowModeSwitch) {
      setModoElegido(
        fechaInicio && fechaInicio === fechaFin ? 'single' : fechaInicio || fechaFin ? 'range' : initialMode,
      );
    }
    const inicialValida = esFechaISOValida(mesInicial) ? (mesInicial > tope ? tope : mesInicial) : '';
    const ref = [unica, fechaFin, fechaInicio].find(esFechaISOValida) || inicialValida || tope;
    setVistaMes({ anio: Number(ref.slice(0, 4)), mes: Number(ref.slice(5, 7)) - 1 });
    setFocoISO(ref);
    setAbierto(true);
  };

  const cerrar = (devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) triggerRef.current?.focus();
  };

  // Cerrar con clic afuera (el foco queda donde el usuario hizo clic)
  useEffect(() => {
    if (!abierto) return undefined;
    const alClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', alClick);
    return () => document.removeEventListener('mousedown', alClick);
  }, [abierto]);

  // Conteo de fotos dentro de la selección actual (si se provee la lista)
  const conteoEnSeleccion = useMemo(() => {
    if (!Array.isArray(inspecciones)) return null;
    const d = modo === 'single' ? draftUnica : draftDesde;
    const h = modo === 'single' ? draftUnica : draftHasta;
    if (!esFechaISOValida(d) && !esFechaISOValida(h)) return inspecciones.length;
    const ini = esFechaISOValida(d) ? inicioDiaLocal(d) : null;
    const fin = esFechaISOValida(h) ? finDiaLocal(h) : null;
    return inspecciones.filter((m) => {
      const t = new Date(m.timestamp);
      if (Number.isNaN(t.getTime())) return false;
      if (ini && t < ini) return false;
      if (fin && t > fin) return false;
      return true;
    }).length;
  }, [inspecciones, modo, draftUnica, draftDesde, draftHasta]);

  const resumen = useMemo(() => {
    if (modo === 'single') {
      return resumenRangoContextual(draftUnica, draftUnica, {
        conteoInspecciones: conteoEnSeleccion,
        modo: 'single',
      });
    }
    return resumenRangoContextual(draftDesde, draftHasta, {
      conteoInspecciones: conteoEnSeleccion,
      modo: 'range',
    });
  }, [modo, draftUnica, draftDesde, draftHasta, conteoEnSeleccion]);

  const celdas = useMemo(
    () =>
      construirGrillaMes(vistaMes.anio, vistaMes.mes, {
        hoyISO,
        maxISO,
        modo,
        fechaUnica: draftUnica,
        desde: draftDesde,
        hasta: draftHasta,
        hoverFecha,
      }),
    [vistaMes.anio, vistaMes.mes, hoyISO, maxISO, modo, draftUnica, draftDesde, draftHasta, hoverFecha],
  );

  const semanas = useMemo(() => {
    const filas = [];
    for (let i = 0; i < celdas.length; i += 7) filas.push(celdas.slice(i, i + 7));
    return filas;
  }, [celdas]);

  // Roving tabindex: un único día de la grilla es alcanzable con Tab.
  const diaTabulable = useMemo(() => {
    const habilitadas = celdas.filter((c) => c.esMesActual && !c.deshabilitada);
    return (
      habilitadas.find((c) => c.iso === focoISO) ||
      habilitadas.find((c) => c.esSeleccionada) ||
      habilitadas.find((c) => c.esHoy) ||
      habilitadas[0] ||
      null
    )?.iso;
  }, [celdas, focoISO]);

  // Al abrir, el foco entra al calendario (día tabulable).
  useEffect(() => {
    if (!abierto) return;
    rootRef.current?.querySelector('.dp-day[tabindex="0"]')?.focus();
    // Solo al abrir: los cambios de mes no deben robar el foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Mover el foco tras navegar con teclado (el botón destino puede ser de otro mes).
  useEffect(() => {
    if (!solicitarFoco.current) return;
    solicitarFoco.current = false;
    rootRef.current?.querySelector(`.dp-day[data-iso="${focoISO}"]`)?.focus();
  }, [focoISO, vistaMes]);

  // No permitir navegar a meses íntegramente posteriores a maxISO
  const puedeMesSiguiente = useMemo(() => {
    if (!esFechaISOValida(maxISO)) return true;
    const [maxY, maxM] = maxISO.split('-').map(Number);
    return vistaMes.anio < maxY || (vistaMes.anio === maxY && vistaMes.mes < maxM - 1);
  }, [vistaMes, maxISO]);

  const cambiarMes = (delta) => {
    setVistaMes((prev) => {
      const dt = new Date(prev.anio, prev.mes + delta, 1);
      return { anio: dt.getFullYear(), mes: dt.getMonth() };
    });
  };

  const irAMes = (iso) => setVistaMes({ anio: Number(iso.slice(0, 4)), mes: Number(iso.slice(5, 7)) - 1 });

  const cambiarModo = (nuevoModo) => {
    setModoElegido(nuevoModo);
    setHoverFecha('');
    if (nuevoModo === 'single') {
      const base = draftDesde || draftHasta;
      if (base) setDraftUnica(base);
    } else if (!draftDesde && !draftHasta && draftUnica) {
      setDraftDesde(draftUnica);
    }
  };

  // Día único: confirma de inmediato por el callback que corresponde y cierra.
  const confirmarUnica = (iso) => {
    setDraftUnica(iso);
    if (esSoloUnico) onChange?.(iso);
    else onChangeRango?.(iso, iso);
    cerrar();
  };

  const seleccionarCelda = (celda) => {
    if (celda.deshabilitada) return;
    if (!celda.esMesActual) irAMes(celda.iso);
    setFocoISO(celda.iso);
    if (modo === 'single') {
      confirmarUnica(celda.iso);
      return;
    }
    const siguiente = aplicarClickRango({ desde: draftDesde, hasta: draftHasta }, celda.iso);
    setDraftDesde(siguiente.desde);
    setDraftHasta(siguiente.hasta);
    setHoverFecha('');
  };

  const alTeclaGrilla = (e) => {
    const iso = e.target?.dataset?.iso;
    if (!iso) return;
    const destino = moverFocoGrilla(iso, e.key, { maxISO });
    if (!destino) return;
    e.preventDefault();
    solicitarFoco.current = true;
    irAMes(destino);
    setFocoISO(destino);
  };

  const aplicarAtajo = (tipo) => {
    irAMes(tope);
    setFocoISO(tope);

    if (tipo === 'hoy' || tipo === 'ayer') {
      const dia = tipo === 'ayer' ? desplazarDiasISO(tope, -1) : tope;
      if (modo === 'single') {
        irAMes(dia);
        confirmarUnica(dia);
      } else {
        setDraftDesde(dia);
        setDraftHasta(dia);
      }
      return;
    }

    if (allowModeSwitch && modo !== 'range') setModoElegido('range');

    if (tipo === '7d') {
      setDraftDesde(desplazarDiasISO(tope, -6));
      setDraftHasta(tope);
    } else if (tipo === '30d') {
      setDraftDesde(desplazarDiasISO(tope, -29));
      setDraftHasta(tope);
    } else if (tipo === 'mes') {
      setDraftDesde(inicioMesISO(tope));
      setDraftHasta(tope);
    }
  };

  const aplicarSeleccion = () => {
    const { desde, hasta } = rangoAConfirmar({
      modo: 'range',
      desde: draftDesde,
      hasta: draftHasta,
    });
    onChangeRango?.(desde, hasta);
    cerrar();
  };

  // Rango abierto por el inicio: "todo hasta este día" (sin fecha de inicio).
  const aplicarSoloHasta = () => {
    onChangeRango?.('', draftDesde);
    cerrar();
  };

  const limpiarSeleccion = () => {
    setHoverFecha('');
    if (esSoloUnico) {
      onChange?.(tope);
    } else {
      onChangeRango?.('', '');
    }
    cerrar();
  };

  const alTeclaRaiz = (e) => {
    if (e.key === 'Escape' && abierto) {
      // Solo se cierra el selector: un modal padre no debe cerrarse con la misma tecla.
      e.stopPropagation();
      cerrar();
    }
  };

  // Etiqueta del botón disparador cuando está cerrado
  const etiquetaDisparador = useMemo(() => {
    if (esSoloUnico) {
      if (!esFechaISOValida(value)) return 'Seleccionar fecha';
      const txt = formatearFechaAmigable(value);
      return value === hoyISO ? `Hoy · ${txt}` : txt;
    }
    return etiquetaFiltroFechas(fechaInicio, fechaFin);
  }, [esSoloUnico, value, fechaInicio, fechaFin, hoyISO]);

  // Insignia con la cantidad de días; no aplica a rangos abiertos ni a día único.
  const diasActivosBadge = useMemo(() => {
    if (esSoloUnico) return null;
    if (!esFechaISOValida(fechaInicio) || !esFechaISOValida(fechaFin)) return null;
    const d = contarDiasRango(fechaInicio, fechaFin);
    return d > 0 ? `${d} ${d === 1 ? 'día' : 'días'}` : null;
  }, [esSoloUnico, fechaInicio, fechaFin]);

  const tieneFiltroActivo = esSoloUnico ? Boolean(value) : Boolean(fechaInicio || fechaFin);

  const rangoAbiertoPorInicio = modo === 'range' && Boolean(draftDesde) && !draftHasta;

  return (
    <div className="dp-root" ref={rootRef} onKeyDown={alTeclaRaiz}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`dp-trigger ${tieneFiltroActivo ? 'dp-trigger--active' : ''}`}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-controls={abierto ? popoverId : undefined}
        onClick={() => (abierto ? cerrar(false) : abrir())}
      >
        <IconoCalendario size={14} />
        <span>{etiquetaDisparador}</span>
        {diasActivosBadge && <span className="dp-trigger__badge">{diasActivosBadge}</span>}
      </button>

      {abierto && (
        <div
          id={popoverId}
          className={`dp-popover ${align === 'left' ? 'dp-popover--left' : ''}`}
          role="dialog"
          aria-label="Selector de fecha"
        >
          {/* Fondo y cierre visibles solo en pantallas angostas (hoja inferior) */}
          <div className="dp-backdrop" onClick={() => cerrar()} aria-hidden="true" />
          <button type="button" className="dp-close" aria-label="Cerrar selector de fecha" onClick={() => cerrar()}>
            Cerrar
          </button>

          {/* Encabezado contextual legible */}
          <div className="dp-header-summary" aria-live="polite">
            <div className="dp-header-summary__title">{resumen.titulo}</div>
            <div className="dp-header-summary__subtitle">{resumen.subtitulo}</div>
          </div>

          {/* Selector de modo: Día único vs Rango de fechas */}
          {allowModeSwitch && (
            <div className="dp-mode-switch" role="group" aria-label="Modo de selección de fecha">
              <button
                type="button"
                className="dp-mode-btn"
                aria-pressed={modo === 'single'}
                onClick={() => cambiarModo('single')}
              >
                Día único
              </button>
              <button
                type="button"
                className="dp-mode-btn"
                aria-pressed={modo === 'range'}
                onClick={() => cambiarModo('range')}
              >
                Rango de fechas
              </button>
            </div>
          )}

          {/* Atajos rápidos */}
          <div className="dp-shortcuts" role="group" aria-label="Atajos de fecha">
            <button type="button" className="dp-shortcut-chip" onClick={() => aplicarAtajo('hoy')}>
              Hoy
            </button>
            {esSoloUnico ? (
              <button type="button" className="dp-shortcut-chip" onClick={() => aplicarAtajo('ayer')}>
                Ayer
              </button>
            ) : (
              <>
                <button type="button" className="dp-shortcut-chip" onClick={() => aplicarAtajo('7d')}>
                  Últimos 7 días
                </button>
                <button type="button" className="dp-shortcut-chip" onClick={() => aplicarAtajo('30d')}>
                  Últimos 30 días
                </button>
                <button type="button" className="dp-shortcut-chip" onClick={() => aplicarAtajo('mes')}>
                  Este mes
                </button>
              </>
            )}
            {/* Siempre presente (oculto cuando no aplica) para que la grilla no se desplace */}
            {!esSoloUnico && (
              <button
                type="button"
                className="dp-shortcut-chip"
                style={rangoAbiertoPorInicio ? undefined : { visibility: 'hidden' }}
                disabled={!rangoAbiertoPorInicio}
                tabIndex={rangoAbiertoPorInicio ? 0 : -1}
                aria-hidden={rangoAbiertoPorInicio ? undefined : true}
                onClick={aplicarSoloHasta}
              >
                Todo hasta este día
              </button>
            )}
          </div>

          {/* Navegación de mes y año */}
          <div className="dp-nav">
            <button
              type="button"
              className="dp-nav__btn"
              aria-label="Mes anterior"
              onClick={() => cambiarMes(-1)}
            >
              <IconoFlechaAtras size={15} />
            </button>
            <div className="dp-nav__label" aria-hidden="true">
              {MESES_LARGOS[vistaMes.mes]} {vistaMes.anio}
            </div>
            <button
              type="button"
              className="dp-nav__btn"
              aria-label="Mes siguiente"
              disabled={!puedeMesSiguiente}
              onClick={() => cambiarMes(1)}
            >
              <IconoFlechaAdelante size={15} />
            </button>
          </div>

          {/* Grilla: encabezados + 6 semanas (role=row) con un solo tab stop */}
          <div
            className="dp-grid"
            role="grid"
            aria-label={`${MESES_LARGOS[vistaMes.mes]} ${vistaMes.anio}`}
            onKeyDown={alTeclaGrilla}
            onMouseLeave={() => setHoverFecha('')}
          >
            <div className="dp-weekdays" role="row">
              {DIAS_SEMANA_CORTOS.map((dia) => (
                <div key={dia} className="dp-weekday" role="columnheader">
                  {dia}
                </div>
              ))}
            </div>
            {semanas.map((semana) => (
              <div key={semana[0].iso} className="dp-week" role="row">
                {semana.map((celda) => {
                  const clasesDia = [
                    'dp-day',
                    !celda.esMesActual ? 'dp-day--outside' : '',
                    celda.esHoy ? 'dp-day--today' : '',
                    celda.enRango ? 'dp-day--in-range' : '',
                    celda.esSeleccionada ? 'dp-day--endpoint' : '',
                    celda.deshabilitada ? 'dp-day--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  const mostrarBanda =
                    modo === 'range' &&
                    (celda.posicionBanda === 'inicio' ||
                      celda.posicionBanda === 'medio' ||
                      celda.posicionBanda === 'fin');

                  const amigable = formatearFechaAmigable(celda.iso);
                  const nombre = celda.esHoy ? `Hoy, ${amigable}` : amigable;

                  return (
                    <div
                      key={celda.iso}
                      className="dp-cell"
                      role="gridcell"
                      aria-selected={celda.esSeleccionada || celda.enRango}
                    >
                      {mostrarBanda && (
                        <div
                          className={[
                            'dp-cell-band',
                            celda.posicionBanda === 'inicio' ? 'dp-cell-band--inicio' : '',
                            celda.posicionBanda === 'fin' ? 'dp-cell-band--fin' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-hidden="true"
                        />
                      )}
                      <button
                        type="button"
                        className={clasesDia}
                        data-iso={celda.iso}
                        tabIndex={celda.iso === diaTabulable ? 0 : -1}
                        aria-disabled={celda.deshabilitada || undefined}
                        aria-current={celda.esHoy ? 'date' : undefined}
                        aria-label={celda.deshabilitada ? `${nombre}. ${futureTitle}` : nombre}
                        title={celda.deshabilitada ? futureTitle : undefined}
                        onFocus={() => {
                          if (rangoAbiertoPorInicio && !celda.deshabilitada) setHoverFecha(celda.iso);
                        }}
                        onMouseEnter={() => {
                          if (rangoAbiertoPorInicio && !celda.deshabilitada) setHoverFecha(celda.iso);
                        }}
                        onClick={() => seleccionarCelda(celda)}
                      >
                        <span>{celda.dia}</span>
                        {celda.esHoy && <span className="dp-day__hoy-dot">Hoy</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Acciones: el día único ya se confirmó al elegirlo, solo el rango necesita Aplicar */}
          <div className="dp-footer">
            <button type="button" className="dp-btn-clear" onClick={limpiarSeleccion}>
              {clearLabel}
            </button>
            {modo === 'range' && (
              <button
                type="button"
                className="dp-btn-apply"
                disabled={!draftDesde && !draftHasta}
                onClick={aplicarSeleccion}
              >
                {ctaLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
