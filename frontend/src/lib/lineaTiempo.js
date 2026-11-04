// Filtrado y agrupación cronológica de mediciones para la línea de tiempo del panel.

import { diaColombiaISO, enRangoDiasColombia, hoyColombiaISO, desplazarDiasISO, formatearFechaAmigable, esFechaISOValida } from './fechas.js';
import { NIVELES, nivelLabel } from './statusUtils.js';
import { normalizar } from './textUtils.js';

export const ANIO_MINIMO_LINEA_TIEMPO = 2026;
export const COLOR_DIA_SIN_FOTOS = '#94a3b8';

// Paleta propia de la barra anual (la del resto de la app usa naranjas casi
// iguales para leve y moderada, y en una franja de 3 px no se distinguen):
// verde / ámbar claro / naranja intenso / rojo.
export const COLORES_BARRA_ANUAL = ['#16a34a', '#fbbf24', '#ea580c', '#dc2626'];
export const colorNivelBarra = (nivel) => COLORES_BARRA_ANUAL[nivel] ?? '#64748b';

// Parte mínima de la altura de un día que ocupa cada nivel presente, para que una
// foto severa entre cientos no desaparezca.
export const PROPORCION_MINIMA_NIVEL = 0.12;

export const MESES_BARRA_ANUAL = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const tiempoMs = (m) => {
  const t = new Date(m?.timestamp).getTime();
  return Number.isFinite(t) ? t : 0;
};

const pctNum = (m) => {
  const n = Number(m?.area_corroida_pct ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const nivelNum = (m) => {
  const n = Number(m?.nivel_corrosion ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function autorDeMedicion(m) {
  return (
    m?.creado_por_nombre ||
    m?.tomado_por_nombre ||
    m?.usuario_email ||
    m?.usuario_id ||
    ''
  );
}

// Filtra la lista de mediciones por empresa, punto (bloque), nivel ISO, rango
// de días colombianos (mismo día que usa el servidor) y texto libre.
export function filtrarMedicionesLineaTiempo(
  mediciones = [],
  {
    empresaId = 'all',
    bloqueId = 'all',
    nivel = 'all',
    fechaInicio = '',
    fechaFin = '',
    busqueda = '',
  } = {},
) {
  const q = normalizar(busqueda || '');

  return mediciones.filter((m) => {
    if (!m) return false;
    if (empresaId && empresaId !== 'all' && String(m.empresa_id) !== String(empresaId)) return false;
    const idBloque = m.bloque_id || m.id_punto;
    if (bloqueId && bloqueId !== 'all' && String(idBloque) !== String(bloqueId)) return false;
    if (nivel !== undefined && nivel !== null && nivel !== '' && nivel !== 'all') {
      if (nivelNum(m) !== Number(nivel)) return false;
    }
    if (!enRangoDiasColombia(m.timestamp, fechaInicio, fechaFin)) return false;
    if (q) {
      const texto = normalizar(
        `${m.nombre ?? ''} ${m.lote_nombre ?? ''} ${m.bloque_nombre ?? ''} ${m.notas ?? ''} ${autorDeMedicion(m)}`,
      );
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

export const SIN_FECHA = 'sin-fecha';

// Ordena de más reciente a más antigua y agrupa por día colombiano. Devuelve
// [[fechaISO, mediciones[]], ...] con los días en orden de aparición (los
// días más recientes primero). `claveDe(m)` permite otra clave de día; una
// clave vacía cae en 'sin-fecha'.
export function agruparPorDia(mediciones = [], claveDe = (m) => diaColombiaISO(m?.timestamp)) {
  const ordenadas = [...(mediciones ?? [])].sort((a, b) => tiempoMs(b) - tiempoMs(a));
  const dias = new Map();
  for (const m of ordenadas) {
    const clave = claveDe(m) || SIN_FECHA;
    const lista = dias.get(clave);
    if (lista) lista.push(m);
    else dias.set(clave, [m]);
  }
  return Array.from(dias.entries());
}

// Agrupa por día colombiano y dentro de cada día colapsa las mediciones que
// comparten `lote_id` en un único evento de lote.
export function agruparEventosPorDia(mediciones = [], { ahora = new Date() } = {}) {
  const diasMap = new Map();

  const filas = agruparPorDia(mediciones).flatMap(([dia, meds]) => meds.map((m) => [dia, m]));

  for (const [fechaISO, m] of filas) {
    let grupoDia = diasMap.get(fechaISO);
    if (!grupoDia) {
      grupoDia = {
        fechaISO,
        etiquetaDia: etiquetarDiaLineaTiempo(fechaISO, ahora),
        eventos: [],
        lotesVistos: new Map(),
        totalFotos: 0,
      };
      diasMap.set(fechaISO, grupoDia);
    }

    grupoDia.totalFotos += 1;
    const idLote = typeof m?.lote_id === 'string' ? m.lote_id.trim() : '';

    if (idLote) {
      let evLote = grupoDia.lotesVistos.get(idLote);
      if (!evLote) {
        evLote = {
          tipo: 'lote',
          id: idLote,
          loteNombre: (typeof m.lote_nombre === 'string' && m.lote_nombre.trim()) || 'Lote sin nombre',
          puntoNombre: m.bloque_nombre || 'Sin punto asignado',
          bloqueId: m.bloque_id || m.id_punto || null,
          empresaId: m.empresa_id || null,
          totalFotos: 0,
          peorPct: 0,
          peorNivel: 0,
          promedioPct: 0,
          _sumaPct: 0,
          timestamp: m.timestamp || null,
          autor: autorDeMedicion(m),
          mediciones: [],
        };
        grupoDia.lotesVistos.set(idLote, evLote);
        grupoDia.eventos.push(evLote);
      }
      evLote.mediciones.push(m);
      evLote.totalFotos = evLote.mediciones.length;
      const p = pctNum(m);
      const niv = nivelNum(m);
      if (evLote.totalFotos === 1 || p > evLote.peorPct) evLote.peorPct = p;
      if (evLote.totalFotos === 1 || niv > evLote.peorNivel) evLote.peorNivel = niv;
      evLote._sumaPct += p;
      evLote.promedioPct = Math.round((evLote._sumaPct / evLote.totalFotos) * 10) / 10;
      if (!evLote.autor) evLote.autor = autorDeMedicion(m);
      if (evLote.loteNombre === 'Lote sin nombre' && typeof m.lote_nombre === 'string' && m.lote_nombre.trim()) {
        evLote.loteNombre = m.lote_nombre.trim();
      }
    } else {
      grupoDia.eventos.push({
        tipo: 'medicion',
        id: m.id_medicion || `${fechaISO}-${grupoDia.eventos.length}`,
        timestamp: m.timestamp || null,
        medicion: m,
      });
    }
  }

  return Array.from(diasMap.values()).map(({ fechaISO, etiquetaDia, eventos, totalFotos }) => ({
    fechaISO,
    etiquetaDia,
    totalEventos: eventos.length,
    totalFotos,
    eventos: eventos.map((ev) => {
      if (ev.tipo === 'lote') {
        const { _sumaPct, ...resto } = ev;
        return resto;
      }
      return ev;
    }),
  }));
}

export function etiquetarDiaLineaTiempo(fechaISO, ahora = new Date()) {
  if (!fechaISO || fechaISO === SIN_FECHA) return 'Sin fecha';
  const hoy = hoyColombiaISO(ahora);
  const ayer = desplazarDiasISO(hoy, -1);
  const amigable = formatearFechaAmigable(fechaISO, { ahora });
  if (fechaISO === hoy) return `Hoy · ${amigable}`;
  if (fechaISO === ayer) return `Ayer · ${amigable}`;
  return amigable;
}

const pad2 = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round(n * 100) / 100;

// Devuelve la lista de años seleccionables en la barra anual de la línea de
// tiempo: desde 2026 hasta el año calendario actual (nunca años futuros).
export function aniosDisponiblesLineaTiempo(mediciones = [], fechaReferencia = new Date()) {
  const ref =
    fechaReferencia instanceof Date && !Number.isNaN(fechaReferencia.getTime())
      ? fechaReferencia
      : new Date();
  const anioActual = Math.max(ANIO_MINIMO_LINEA_TIEMPO, Number(diaColombiaISO(ref).slice(0, 4)) || 0);
  const anios = [];
  for (let y = ANIO_MINIMO_LINEA_TIEMPO; y <= anioActual; y += 1) {
    anios.push(y);
  }
  // Mantiene la firma compatible con `mediciones` sin exponer años futuros ni previos a 2026.
  void mediciones;
  return anios;
}

// Reparte la altura de un día entre los niveles presentes: proporcional a la
// cantidad, pero ningún nivel presente baja de `minimo`. `cantidades` es [n0..n3];
// devuelve las partes (suman 1; 0 para los niveles ausentes).
export function repartoVisible(cantidades, minimo = PROPORCION_MINIMA_NIVEL) {
  const total = cantidades.reduce((a, c) => a + c, 0);
  const partes = cantidades.map(() => 0);
  if (total <= 0) return partes;
  const activos = cantidades.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
  if (activos.length * minimo >= 1) {
    activos.forEach((i) => { partes[i] = 1 / activos.length; });
    return partes;
  }
  const fijos = new Set();
  for (let cambio = true; cambio;) {
    cambio = false;
    const libres = activos.filter((i) => !fijos.has(i));
    const sumaLibres = libres.reduce((a, i) => a + cantidades[i], 0);
    const restante = 1 - fijos.size * minimo;
    for (const i of libres) {
      if ((cantidades[i] / sumaLibres) * restante < minimo) { fijos.add(i); cambio = true; }
    }
  }
  const libres = activos.filter((i) => !fijos.has(i));
  const sumaLibres = libres.reduce((a, i) => a + cantidades[i], 0);
  const restante = 1 - fijos.size * minimo;
  activos.forEach((i) => {
    partes[i] = fijos.has(i) ? minimo : (cantidades[i] / sumaLibres) * restante;
  });
  return partes;
}

const nivelValido = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? Math.min(3, Math.max(0, Math.trunc(n))) : null;
};

// Construye los 365 (o 366 en bisiesto) días del año `anio` del 1 de enero al
// 31 de diciembre con el reparto proporcional por nivel ISO de corrosión,
// a partir de una lista de mediciones. Las que no tienen nivel válido se omiten.
export function construirBarraAnual(mediciones = [], anio = ANIO_MINIMO_LINEA_TIEMPO) {
  const anioNum = anioValido(anio);
  const conteosPorDia = new Map();

  for (const m of mediciones ?? []) {
    if (!m?.timestamp) continue;
    const dt = new Date(m.timestamp);
    if (Number.isNaN(dt.getTime())) continue;
    const iso = diaColombiaISO(dt);
    if (!iso.startsWith(`${anioNum}-`)) continue;
    const niv = nivelValido(m.nivel_corrosion);
    if (niv === null) continue;
    let registro = conteosPorDia.get(iso);
    if (!registro) {
      registro = [0, 0, 0, 0];
      conteosPorDia.set(iso, registro);
    }
    registro[niv] += 1;
  }
  return construirBarraDesdeConteos(conteosPorDia, anioNum);
}

// Igual, pero desde los agregados del servidor (GET /mediciones/resumen-diario):
// `[{fecha, por_nivel:[n0..n3], ...}]` con el día local ya resuelto y sin el tope
// de mediciones recientes. `nivel` ('all' | '0'..'3') deja solo ese nivel.
export function construirBarraAnualDesdeResumen(dias = [], anio = ANIO_MINIMO_LINEA_TIEMPO, { nivel = 'all' } = {}) {
  const anioNum = anioValido(anio);
  const filtro = nivel === 'all' || nivel === '' || nivel == null ? null : Number(nivel);
  const conteosPorDia = new Map();
  for (const d of dias ?? []) {
    if (typeof d?.fecha !== 'string' || !d.fecha.startsWith(`${anioNum}-`) || !Array.isArray(d.por_nivel)) continue;
    const conteo = [0, 1, 2, 3].map((n) => {
      const c = Number(d.por_nivel[n]);
      return Number.isFinite(c) && c > 0 && (filtro === null || filtro === n) ? Math.trunc(c) : 0;
    });
    if (conteo.some((c) => c > 0)) conteosPorDia.set(d.fecha, conteo);
  }
  return construirBarraDesdeConteos(conteosPorDia, anioNum);
}

function anioValido(anio) {
  const parsed = Number(anio);
  return Number.isFinite(parsed) && parsed >= ANIO_MINIMO_LINEA_TIEMPO
    ? Math.trunc(parsed)
    : ANIO_MINIMO_LINEA_TIEMPO;
}

function construirBarraDesdeConteos(conteosPorDia, anioNum) {
  const dias = [];
  const meses = [];
  let diasConFotos = 0;
  let totalFotosAnio = 0;

  for (let mesIdx = 0; mesIdx < 12; mesIdx += 1) {
    const mes = mesIdx + 1;
    const diasMes = new Date(anioNum, mes, 0).getDate();
    const inicioIndice = dias.length;
    let fotosMes = 0;
    let diasActivosMes = 0;

    for (let diaMes = 1; diaMes <= diasMes; diaMes += 1) {
      const fechaISO = `${anioNum}-${pad2(mes)}-${pad2(diaMes)}`;
      const etiquetaCorta = `${pad2(diaMes)}/${pad2(mes)}/${anioNum}`;
      const conteo = conteosPorDia.get(fechaISO) || [0, 0, 0, 0];
      const conteoPorNivel = [conteo[0], conteo[1], conteo[2], conteo[3]];
      const totalFotos =
        conteoPorNivel[0] + conteoPorNivel[1] + conteoPorNivel[2] + conteoPorNivel[3];

      if (totalFotos === 0) {
        dias.push({
          fechaISO,
          etiquetaCorta,
          mes,
          diaMes,
          totalFotos: 0,
          sinFotos: true,
          conteoPorNivel,
          segmentos: [],
          gradienteSegmentos: COLOR_DIA_SIN_FOTOS,
          gradienteSuave: COLOR_DIA_SIN_FOTOS,
          peorNivel: null,
          resumenTexto: `${etiquetaCorta} · Sin mediciones`,
        });
        continue;
      }

      diasConFotos += 1;
      diasActivosMes += 1;
      totalFotosAnio += totalFotos;
      fotosMes += totalFotos;

      const nivelesActivos = [];
      let peorNivel = 0;
      for (let niv = 0; niv < NIVELES.length; niv += 1) {
        const cant = conteoPorNivel[niv];
        if (cant > 0) {
          nivelesActivos.push({
            nivel: niv,
            color: colorNivelBarra(niv),
            etiqueta: nivelLabel(niv),
            cantidad: cant,
          });
          peorNivel = niv;
        }
      }

      // Real shares go in the tooltip text; the painted height gets a floor per level.
      const partesVisibles = repartoVisible(conteoPorNivel);
      let acumulado = 0;
      const segmentos = nivelesActivos.map((item, idx) => {
        const proporcion = item.cantidad / totalFotos;
        const desdePct = round2(acumulado * 100);
        acumulado += partesVisibles[item.nivel];
        const hastaPct = idx === nivelesActivos.length - 1 ? 100 : round2(acumulado * 100);
        return {
          ...item,
          proporcion,
          porcentaje: round2(proporcion * 100),
          porcentajeRedondeado: Math.round(proporcion * 100),
          desdePct,
          hastaPct,
        };
      });

      let gradienteSegmentos;
      let gradienteSuave;

      if (segmentos.length === 1) {
        const unicoColor = segmentos[0].color;
        gradienteSegmentos = `linear-gradient(to bottom, ${unicoColor} 0%, ${unicoColor} 100%)`;
        gradienteSuave = `linear-gradient(to bottom, ${unicoColor} 0%, ${unicoColor} 100%)`;
      } else {
        const paradasDuras = segmentos
          .map((s) => `${s.color} ${s.desdePct}% ${s.hastaPct}%`)
          .join(', ');
        gradienteSegmentos = `linear-gradient(to bottom, ${paradasDuras})`;

        const paradasSuaves = [`${segmentos[0].color} 0%`];
        for (let i = 0; i < segmentos.length - 1; i += 1) {
          const actual = segmentos[i];
          const siguiente = segmentos[i + 1];
          const anchoActual = actual.hastaPct - actual.desdePct;
          const anchoSiguiente = siguiente.hastaPct - siguiente.desdePct;
          const banda = round2(Math.min(7, Math.max(1.5, Math.min(anchoActual, anchoSiguiente) * 0.28)));
          const antes = round2(Math.max(actual.desdePct, actual.hastaPct - banda));
          const despues = round2(Math.min(siguiente.hastaPct, actual.hastaPct + banda));
          paradasSuaves.push(`${actual.color} ${antes}%`);
          paradasSuaves.push(`${siguiente.color} ${despues}%`);
        }
        paradasSuaves.push(`${segmentos[segmentos.length - 1].color} 100%`);
        gradienteSuave = `linear-gradient(to bottom, ${paradasSuaves.join(', ')})`;
      }

      const desglose = [...segmentos]
        .reverse()
        .map((s) => `${s.cantidad} ${s.etiqueta.toLowerCase()} (${s.porcentajeRedondeado}%)`)
        .join(', ');

      dias.push({
        fechaISO,
        etiquetaCorta,
        mes,
        diaMes,
        totalFotos,
        sinFotos: false,
        conteoPorNivel,
        segmentos,
        gradienteSegmentos,
        gradienteSuave,
        peorNivel,
        resumenTexto: `${etiquetaCorta} · ${totalFotos} ${totalFotos === 1 ? 'imagen' : 'imágenes'}: ${desglose}`,
      });
    }

    meses.push({
      mes,
      etiqueta: MESES_BARRA_ANUAL[mesIdx],
      diasMes,
      inicioIndice,
      fotosMes,
      diasActivosMes,
    });
  }

  const totalDias = dias.length;
  for (const m of meses) {
    m.proporcionAnio = m.diasMes / totalDias;
  }

  return {
    anio: anioNum,
    totalDias,
    diasConFotos,
    totalFotosAnio,
    meses,
    dias,
  };
}

// True when the selected day range (local 'YYYY-MM-DD', either end may be empty)
// reaches back to or beyond the oldest day of the loaded "recent" window, so the
// window can't be trusted to hold all of it. A window shorter than `limite` is the
// complete history. The oldest loaded day is partial (the window cuts mid-day),
// hence `<=`.
export function rangoFueraDeVentana(mediciones, fechaInicio, fechaFin, limite) {
  if (!Array.isArray(mediciones) || !(limite > 0) || mediciones.length < limite) return false;
  const piso = fechaInicio || fechaFin;
  if (!esFechaISOValida(piso) || (fechaFin && !esFechaISOValida(fechaFin))) return false;
  let masAntigua = Infinity;
  for (const m of mediciones) {
    const t = new Date(m?.timestamp).getTime();
    if (!Number.isNaN(t) && t < masAntigua) masAntigua = t;
  }
  if (masAntigua === Infinity) return false;
  return piso <= diaColombiaISO(masAntigua);
}

// GET /mediciones/recientes limited to a local-day range (without heavy fields).
export function urlMedicionesRango(fechaInicio, fechaFin, limite = 1000) {
  const qs = new URLSearchParams({ limit: String(limite), resumen: '1' });
  if (fechaInicio) qs.set('desde', fechaInicio);
  if (fechaFin) qs.set('hasta', fechaFin);
  return `/mediciones/recientes?${qs}`;
}
