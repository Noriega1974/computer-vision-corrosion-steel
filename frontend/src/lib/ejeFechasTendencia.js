// Date axis of the "Tendencia del área corroída" chart. Pure: takes the points of
// puntosTendencia and returns the rows to plot plus ticks, month separators and
// gap markers. Three modes:
//   'compacto'      only days with data, equal spacing, no sign of skipped days.
//   'proporcional'  every calendar day between the first and the last measurement,
//                   so a month without data shows as a month of empty space.
//   'saltos'        (default) only days with data, plus a marker slot where days were skipped.
import { etiquetaDia } from './tendenciaDiaria.js';

export const MODOS_FECHAS = ['compacto', 'proporcional', 'saltos'];
export const MODO_FECHAS_DEFECTO = 'saltos';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const PASOS_DIAS = [1, 2, 3, 7, 14, 30, 60];

const fechaDeDia = (dia) => new Date(dia * 86400000).toISOString().slice(0, 10);
const anioMes = (fecha) => fecha.slice(0, 7);


function filasDelEje(puntos, modo) {
  const reales = puntos.map((p) => ({ ...p, clave: p.fecha }));
  if (reales.length === 0) return [];
  const conAnio = new Set(puntos.map((p) => p.fecha.slice(0, 4))).size > 1;
  if (modo === 'proporcional') {
    const porDia = new Map(reales.map((p) => [p.dia, p]));
    const filas = [];
    for (let d = reales[0].dia; d <= reales[reales.length - 1].dia; d += 1) {
      const fecha = fechaDeDia(d);
      filas.push(porDia.get(d) ?? { clave: fecha, fecha, dia: d, etiqueta: etiquetaDia(fecha, { conAnio }), vacio: true });
    }
    return filas;
  }
  if (modo !== 'saltos') return reales;
  const filas = [];
  reales.forEach((p, i) => {
    const sinDatos = i > 0 ? p.dia - reales[i - 1].dia - 1 : 0;
    if (sinDatos > 0) {
      filas.push({ clave: `salto-${p.fecha}`, fecha: null, dia: null, etiqueta: '', vacio: true, salto: sinDatos });
    }
    filas.push(p);
  });
  return filas;
}

// Labels every `paso`-th row counting back from the newest one, so the latest day
// is always named; never labels an empty row.
function elegirTicks(filas, anchoPx, modo, minPx) {
  if (filas.length === 0) return [];
  const ancho = Math.max(anchoPx / filas.length, 1);
  let paso = Math.max(1, Math.ceil(minPx / ancho));
  if (modo === 'proporcional') paso = PASOS_DIAS.find((p) => p >= paso) ?? paso;
  const ticks = [];
  for (let i = filas.length - 1; i >= 0; i -= paso) {
    if (!filas[i].vacio) ticks.push(filas[i].clave);
  }
  return ticks.reverse();
}

// Where a new month starts: a thin separator with the month name. Marker slots are
// skipped (the gap marker already says days went by).
function separadoresDeMes(filas) {
  const salida = [];
  let previa = null;
  filas.forEach((f, i) => {
    if (!f.fecha) return;
    const mes = anioMes(f.fecha);
    if (previa != null && mes !== previa && filas[i - 1]?.salto == null) {
      const [anio, m] = mes.split('-');
      const cambioDeAnio = previa.slice(0, 4) !== anio;
      salida.push({ clave: f.clave, texto: `${MESES[Number(m) - 1]}${cambioDeAnio ? ` ${anio}` : ''}` });
    }
    previa = mes;
  });
  return salida;
}

export function construirEje(puntos, { modo = MODO_FECHAS_DEFECTO, anchoPx = 400, minPx = 48 } = {}) {
  const lista = [...(puntos ?? [])].filter((p) => p.dia != null);
  const modoValido = MODOS_FECHAS.includes(modo) ? modo : MODO_FECHAS_DEFECTO;
  const filas = filasDelEje(lista, modoValido);
  return {
    filas,
    ticks: elegirTicks(filas, anchoPx, modoValido, minPx),
    meses: separadoresDeMes(filas),
    saltos: filas.filter((f) => f.salto != null).map((f) => ({ clave: f.clave, texto: `${f.salto} ${f.salto === 1 ? 'día' : 'días'}` })),
    etiquetas: Object.fromEntries(filas.map((f) => [f.clave, f.etiqueta])),
  };
}

// Row with data nearest to `indice` (hovering an empty day or a gap marker snaps to it).
export function filaConDatosCercana(filas, indice) {
  if (!filas?.length || indice == null) return null;
  for (let d = 0; d < filas.length; d += 1) {
    for (const j of [indice - d, indice + d]) {
      if (filas[j] && !filas[j].vacio) return filas[j];
    }
  }
  return null;
}
