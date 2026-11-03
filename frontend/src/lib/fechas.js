// Utilidades puras para manejo de fechas en hora local, validación ISO,
// rangos inclusivos y construcción de la grilla del calendario (lunes a domingo).

export const DIAS_SEMANA_CORTOS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

export const DIAS_SEMANA_ABREV = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

export const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Devuelve 'YYYY-MM-DD' usando la fecha local del dispositivo (no UTC).
export function hoyLocalISO(ahora = new Date()) {
  const y = ahora.getFullYear();
  const m = ahora.getMonth() + 1;
  const d = ahora.getDate();
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// Valida que str sea un string con formato estricto YYYY-MM-DD y represente una
// fecha real del calendario (rechaza por ejemplo '2026-02-30').
export function esFechaISOValida(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() + 1 === m &&
    dt.getDate() === d
  );
}

// Devuelve true si str es una fecha ISO válida posterior al día local actual.
export function esFechaFutura(str, ahora = new Date()) {
  if (!esFechaISOValida(str)) return false;
  return str > hoyLocalISO(ahora);
}

// Inicio del día en hora local (00:00:00.000) para comparaciones de filtro.
export function inicioDiaLocal(str) {
  if (!esFechaISOValida(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

// Fin del día en hora local (23:59:59.999) para comparaciones de filtro.
export function finDiaLocal(str) {
  if (!esFechaISOValida(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

// Suma o resta días a una fecha 'YYYY-MM-DD' y devuelve 'YYYY-MM-DD'.
export function desplazarDiasISO(str, deltaDias) {
  if (!esFechaISOValida(str)) return '';
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDias);
  return hoyLocalISO(dt);
}

// Primer día del mes de una fecha 'YYYY-MM-DD'.
export function inicioMesISO(str) {
  if (!esFechaISOValida(str)) return '';
  const [y, m] = str.split('-').map(Number);
  return `${y}-${pad2(m)}-01`;
}

// Convierte 'YYYY-MM-DD' en etiqueta contextual en español, ej. "Vie 13 nov"
// (agrega el año si difiere del año de referencia).
export function formatearFechaAmigable(str, { ahora = new Date(), incluirDiaSemana = true } = {}) {
  if (!esFechaISOValida(str)) return '';
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const diaSem = DIAS_SEMANA_ABREV[dt.getDay()];
  const mes = MESES_CORTOS[m - 1];
  const anioActual = ahora.getFullYear();
  const base = incluirDiaSemana ? `${diaSem} ${d} ${mes}` : `${d} ${mes}`;
  return y !== anioActual ? `${base} ${y}` : base;
}

// Fecha local ISO de la medición más reciente (donde abre el calendario sin valor elegido).
export function fechaUltimaMedicionISO(mediciones) {
  let max = 0;
  for (const m of mediciones ?? []) {
    const t = new Date(m?.timestamp).getTime();
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max ? hoyLocalISO(new Date(max)) : '';
}

// Cuenta la cantidad de días inclusivos entre dos fechas 'YYYY-MM-DD'.
export function contarDiasRango(desde, hasta) {
  if (!esFechaISOValida(desde) && !esFechaISOValida(hasta)) return 0;
  if (esFechaISOValida(desde) && !esFechaISOValida(hasta)) return 1;
  if (!esFechaISOValida(desde) && esFechaISOValida(hasta)) return 1;
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  if (utc2 < utc1) return 0;
  return Math.round((utc2 - utc1) / 86400000) + 1;
}

// Genera título y subtítulo legibles para el encabezado del selector de fechas.
export function resumenRangoContextual(
  desde,
  hasta,
  { conteoInspecciones = null, ahora = new Date(), modo = 'range' } = {},
) {
  const hoy = hoyLocalISO(ahora);
  const sufijoInspecciones =
    typeof conteoInspecciones === 'number'
      ? ` · ${conteoInspecciones} ${conteoInspecciones === 1 ? 'foto' : 'fotos'}`
      : '';

  if (modo === 'single') {
    if (!esFechaISOValida(desde)) {
      return {
        titulo: 'Sin fecha seleccionada',
        subtitulo: 'Selecciona un día del calendario',
      };
    }
    const amigable = formatearFechaAmigable(desde, { ahora });
    const esHoy = desde === hoy;
    return {
      titulo: esHoy ? `Hoy · ${amigable}` : amigable,
      subtitulo: `1 día seleccionado${sufijoInspecciones}`,
    };
  }

  if (!esFechaISOValida(desde) && !esFechaISOValida(hasta)) {
    return {
      titulo: 'Todas las fechas',
      subtitulo: `Elige un día o un rango${sufijoInspecciones}`,
    };
  }

  if (esFechaISOValida(desde) && (!esFechaISOValida(hasta) || desde === hasta)) {
    const amigable = formatearFechaAmigable(desde, { ahora });
    const esHoy = desde === hoy;
    if (!esFechaISOValida(hasta)) {
      // Rango abierto: "desde X" sin fecha final.
      return {
        titulo: `Desde ${esHoy ? `hoy · ${amigable}` : amigable}`,
        subtitulo: `Elige el día final o aplica${sufijoInspecciones}`,
      };
    }
    return {
      titulo: esHoy ? `Hoy · ${amigable}` : amigable,
      subtitulo: `1 día seleccionado${sufijoInspecciones}`,
    };
  }

  if (!esFechaISOValida(desde) && esFechaISOValida(hasta)) {
    const amigable = formatearFechaAmigable(hasta, { ahora });
    return {
      titulo: `Hasta ${amigable}`,
      subtitulo: `Filtro hasta esta fecha${sufijoInspecciones}`,
    };
  }

  const dias = contarDiasRango(desde, hasta);
  const txtDesde = formatearFechaAmigable(desde, { ahora });
  const txtHasta = formatearFechaAmigable(hasta, { ahora });
  return {
    titulo: `${txtDesde} → ${txtHasta}`,
    subtitulo: `${dias} ${dias === 1 ? 'día seleccionado' : 'días seleccionados'}${sufijoInspecciones}`,
  };
}

// Construye una grilla de 6 semanas (42 celdas) comenzando en lunes para (anio, mes 0-11).
export function construirGrillaMes(
  anio,
  mes,
  {
    hoyISO = hoyLocalISO(),
    maxISO = hoyISO,
    modo = 'range',
    fechaUnica = '',
    desde = '',
    hasta = '',
    hoverFecha = '',
  } = {},
) {
  const primerDia = new Date(anio, mes, 1);
  // getDay(): 0=Dom, 1=Lun, ..., 6=Sáb -> convertir a índice lunes=0..domingo=6
  const offsetLunes = (primerDia.getDay() + 6) % 7;

  // En modo rango, si ya hay `desde` y aún no hay `hasta`, `hoverFecha` previsualiza el rango.
  let inicioRango = modo === 'single' ? fechaUnica : desde;
  let finRango = modo === 'single' ? fechaUnica : hasta;

  if (modo === 'range' && inicioRango && !finRango && hoverFecha && (!maxISO || hoverFecha <= maxISO)) {
    if (hoverFecha >= inicioRango) {
      finRango = hoverFecha;
    } else {
      finRango = inicioRango;
      inicioRango = hoverFecha;
    }
  }

  const celdas = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(anio, mes, 1 - offsetLunes + i);
    const iso = hoyLocalISO(dt);
    const esMesActual = dt.getMonth() === mes && dt.getFullYear() === anio;
    const esHoy = iso === hoyISO;
    const deshabilitada = Boolean(maxISO && iso > maxISO);

    const esInicioRango = Boolean(inicioRango && iso === inicioRango);
    const esFinRango = Boolean(finRango && iso === finRango);
    const esSeleccionada =
      modo === 'single'
        ? Boolean(fechaUnica && iso === fechaUnica)
        : esInicioRango || esFinRango;
    const enRango =
      modo === 'range' &&
      Boolean(inicioRango && finRango && iso > inicioRango && iso < finRango);

    let posicionBanda = null;
    if (modo === 'range' && inicioRango && finRango) {
      if (inicioRango === finRango && iso === inicioRango) {
        posicionBanda = 'unica';
      } else if (esInicioRango) {
        posicionBanda = 'inicio';
      } else if (esFinRango) {
        posicionBanda = 'fin';
      } else if (enRango) {
        posicionBanda = 'medio';
      }
    } else if (esSeleccionada) {
      posicionBanda = 'unica';
    }

    celdas.push({
      iso,
      dia: dt.getDate(),
      esMesActual,
      esHoy,
      deshabilitada,
      esSeleccionada,
      esInicioRango,
      esFinRango,
      enRango,
      posicionBanda,
    });
  }

  return celdas;
}

// ---------------------------------------------------------------------------
// Helpers puros del selector de fechas (navegación por teclado y rangos).
// ---------------------------------------------------------------------------

// Suma meses a 'YYYY-MM-DD' ajustando el día al último del mes destino
// (31 ene + 1 mes = 28/29 feb). Devuelve '' si la fecha no es válida.
export function sumarMesesISO(str, deltaMeses) {
  if (!esFechaISOValida(str)) return '';
  const [y, m, d] = str.split('-').map(Number);
  const ultimoDia = new Date(y, m - 1 + deltaMeses + 1, 0).getDate();
  const dt = new Date(y, m - 1 + deltaMeses, Math.min(d, ultimoDia));
  return hoyLocalISO(dt);
}

// Calcula el día que recibe el foco al pulsar `tecla` sobre `iso` en la grilla
// (semanas lunes-domingo). Devuelve null si la tecla no navega. Nunca pasa de
// `maxISO`: los días futuros no son alcanzables.
export function moverFocoGrilla(iso, tecla, { maxISO = '' } = {}) {
  if (!esFechaISOValida(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const diaSemanaLunes = (new Date(y, m - 1, d).getDay() + 6) % 7;
  let destino;
  switch (tecla) {
    case 'ArrowLeft': destino = desplazarDiasISO(iso, -1); break;
    case 'ArrowRight': destino = desplazarDiasISO(iso, 1); break;
    case 'ArrowUp': destino = desplazarDiasISO(iso, -7); break;
    case 'ArrowDown': destino = desplazarDiasISO(iso, 7); break;
    case 'Home': destino = desplazarDiasISO(iso, -diaSemanaLunes); break;
    case 'End': destino = desplazarDiasISO(iso, 6 - diaSemanaLunes); break;
    case 'PageUp': destino = sumarMesesISO(iso, -1); break;
    case 'PageDown': destino = sumarMesesISO(iso, 1); break;
    default: return null;
  }
  if (esFechaISOValida(maxISO) && destino > maxISO) return maxISO;
  return destino;
}

// Resultado de hacer clic en `iso` en modo rango. El primer clic fija el inicio,
// el segundo el fin (reordenando si es anterior) y un tercero reinicia.
export function aplicarClickRango({ desde = '', hasta = '' }, iso) {
  if (!desde || hasta) return { desde: iso, hasta: '' };
  if (iso < desde) return { desde: iso, hasta: desde };
  return { desde, hasta: iso };
}

// Valores que se confirman al pulsar "Aplicar". En rango se conservan los
// rangos abiertos: solo inicio = "desde X en adelante", solo fin = "hasta X".
export function rangoAConfirmar({ modo, unica = '', desde = '', hasta = '' }) {
  if (modo === 'single') {
    return esFechaISOValida(unica) ? { desde: unica, hasta: unica } : { desde: '', hasta: '' };
  }
  return {
    desde: esFechaISOValida(desde) ? desde : '',
    hasta: esFechaISOValida(hasta) ? hasta : '',
  };
}

// Texto del botón disparador según el filtro confirmado.
export function etiquetaFiltroFechas(desde, hasta, { ahora = new Date(), vacio = 'Filtrar por fecha' } = {}) {
  const hoy = hoyLocalISO(ahora);
  const hayDesde = esFechaISOValida(desde);
  const hayHasta = esFechaISOValida(hasta);
  if (!hayDesde && !hayHasta) return vacio;
  if (hayDesde && hayHasta && desde !== hasta) {
    return `${formatearFechaAmigable(desde, { ahora })} → ${formatearFechaAmigable(hasta, { ahora })}`;
  }
  if (hayDesde && !hayHasta) return `Desde ${formatearFechaAmigable(desde, { ahora })}`;
  if (!hayDesde && hayHasta) return `Hasta ${formatearFechaAmigable(hasta, { ahora })}`;
  const txt = formatearFechaAmigable(desde, { ahora });
  return desde === hoy ? `Hoy · ${txt}` : txt;
}
