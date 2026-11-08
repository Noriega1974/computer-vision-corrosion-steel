// Date axis of the "Tendencia del área corroída" chart. Pure: takes the points of
// puntosTendencia and returns the rows to plot plus ticks, month separators and
// gap markers. Only days with data get a slot, plus one marker slot wherever days
// were skipped ("36 días"), so a long gap never squeezes the real days.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const anioMes = (fecha) => fecha.slice(0, 7);


function filasDelEje(puntos) {
  const filas = [];
  puntos.forEach((p, i) => {
    const sinDatos = i > 0 ? p.dia - puntos[i - 1].dia - 1 : 0;
    if (sinDatos > 0) {
      filas.push({ clave: `salto-${p.fecha}`, fecha: null, dia: null, etiqueta: '', vacio: true, salto: sinDatos });
    }
    filas.push({ ...p, clave: p.fecha });
  });
  return filas;
}

// Labels every `paso`-th row counting back from the newest one, so the latest day
// is always named; never labels an empty row.
function elegirTicks(filas, anchoPx, minPx) {
  if (filas.length === 0) return [];
  const ancho = Math.max(anchoPx / filas.length, 1);
  const paso = Math.max(1, Math.ceil(minPx / ancho));
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

export function construirEje(puntos, { anchoPx = 400, minPx = 48 } = {}) {
  const lista = [...(puntos ?? [])].filter((p) => p.dia != null);
  const filas = filasDelEje(lista);
  return {
    filas,
    ticks: elegirTicks(filas, anchoPx, minPx),
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
