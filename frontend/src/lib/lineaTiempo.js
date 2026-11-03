// Filtrado y agrupación cronológica de mediciones para la línea de tiempo del panel.

import { inicioDiaLocal, finDiaLocal, hoyLocalISO, desplazarDiasISO, formatearFechaAmigable } from './fechas.js';
import { NIVELES, nivelColor, nivelLabel } from './statusUtils.js';
import { normalizar } from './textUtils.js';

export const ANIO_MINIMO_LINEA_TIEMPO = 2026;
export const COLOR_DIA_SIN_FOTOS = '#94a3b8';

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
// de fechas locales (inicioDiaLocal / finDiaLocal) y texto libre.
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
  const limIni = fechaInicio ? inicioDiaLocal(fechaInicio) : null;
  const limFin = fechaFin ? finDiaLocal(fechaFin) : null;
  const q = normalizar(busqueda || '');

  return mediciones.filter((m) => {
    if (!m) return false;
    if (empresaId && empresaId !== 'all' && String(m.empresa_id) !== String(empresaId)) return false;
    const idBloque = m.bloque_id || m.id_punto;
    if (bloqueId && bloqueId !== 'all' && String(idBloque) !== String(bloqueId)) return false;
    if (nivel !== undefined && nivel !== null && nivel !== '' && nivel !== 'all') {
      if (nivelNum(m) !== Number(nivel)) return false;
    }
    if (limIni || limFin) {
      const ts = new Date(m.timestamp);
      if (Number.isNaN(ts.getTime())) return false;
      if (limIni && ts < limIni) return false;
      if (limFin && ts > limFin) return false;
    }
    if (q) {
      const texto = normalizar(
        `${m.nombre ?? ''} ${m.lote_nombre ?? ''} ${m.bloque_nombre ?? ''} ${m.notas ?? ''} ${autorDeMedicion(m)}`,
      );
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

// Ordena las mediciones de más reciente a más antigua, las agrupa por día
// calendario local ('YYYY-MM-DD') y dentro de cada día colapsa las que
// comparten `lote_id` en un único evento de lote.
export function agruparEventosPorDia(mediciones = [], { ahora = new Date() } = {}) {
  const ordenadas = [...mediciones].sort((a, b) => tiempoMs(b) - tiempoMs(a));
  const diasMap = new Map();

  for (const m of ordenadas) {
    const dt = new Date(m?.timestamp);
    const fechaISO = Number.isNaN(dt.getTime()) ? 'sin-fecha' : hoyLocalISO(dt);
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
  if (!fechaISO || fechaISO === 'sin-fecha') return 'Sin fecha';
  const hoy = hoyLocalISO(ahora);
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
  const anioActual = Math.max(ANIO_MINIMO_LINEA_TIEMPO, ref.getFullYear());
  const anios = [];
  for (let y = ANIO_MINIMO_LINEA_TIEMPO; y <= anioActual; y += 1) {
    anios.push(y);
  }
  // Mantiene la firma compatible con `mediciones` sin exponer años futuros ni previos a 2026.
  void mediciones;
  return anios;
}

// Construye los 365 (o 366 en bisiesto) días del año `anio` del 1 de enero al
// 31 de diciembre con el reparto proporcional por nivel ISO de corrosión.
export function construirBarraAnual(mediciones = [], anio = ANIO_MINIMO_LINEA_TIEMPO) {
  const parsed = Number(anio);
  const anioNum = Number.isFinite(parsed) && parsed >= ANIO_MINIMO_LINEA_TIEMPO
    ? Math.trunc(parsed)
    : ANIO_MINIMO_LINEA_TIEMPO;

  const conteosPorDia = new Map();

  for (const m of mediciones ?? []) {
    if (!m?.timestamp) continue;
    const dt = new Date(m.timestamp);
    if (Number.isNaN(dt.getTime())) continue;
    if (dt.getFullYear() !== anioNum) continue;
    const iso = hoyLocalISO(dt);
    let registro = conteosPorDia.get(iso);
    if (!registro) {
      registro = [0, 0, 0, 0];
      conteosPorDia.set(iso, registro);
    }
    const nivRaw = nivelNum(m);
    const niv = Math.min(3, Math.max(0, Math.trunc(nivRaw)));
    registro[niv] += 1;
  }

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
            color: nivelColor(niv),
            etiqueta: nivelLabel(niv),
            cantidad: cant,
          });
          peorNivel = niv;
        }
      }

      let acumulado = 0;
      const segmentos = nivelesActivos.map((item, idx) => {
        const proporcion = item.cantidad / totalFotos;
        const desdePct = round2(acumulado * 100);
        acumulado += proporcion;
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
