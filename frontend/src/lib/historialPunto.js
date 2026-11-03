// Agrupación por día calendario local del historial de mediciones de un punto
// de monitoreo (detalle de ubicación del dashboard).

import { hoyLocalISO } from './fechas.js';
import {
  agruparPorLote,
  formatearConteoMediciones,
  resumenConteoMediciones,
} from './galeriaCarpetas.js';

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
  return Number.isFinite(n) ? Math.min(3, Math.max(0, Math.trunc(n))) : 0;
};

export function formatearFechaDiaPunto(fechaISO) {
  if (!fechaISO || fechaISO === 'sin-fecha' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) {
    return 'Sin fecha';
  }
  const [y, m, d] = fechaISO.split('-');
  return `${d}/${m}/${y}`;
}

export function agruparHistorialPuntoPorDia(mediciones = []) {
  const lista = Array.isArray(mediciones) ? [...mediciones] : [];
  lista.sort((a, b) => tiempoMs(b) - tiempoMs(a));

  const mapaDias = new Map();

  for (const m of lista) {
    const dt = new Date(m?.timestamp);
    const fechaISO = Number.isNaN(dt.getTime()) ? 'sin-fecha' : hoyLocalISO(dt);
    let grupo = mapaDias.get(fechaISO);
    if (!grupo) {
      grupo = [];
      mapaDias.set(fechaISO, grupo);
    }
    grupo.push(m);
  }

  return Array.from(mapaDias.entries())
    .sort(([isoA], [isoB]) => {
      if (isoA === 'sin-fecha') return 1;
      if (isoB === 'sin-fecha') return -1;
      return isoB.localeCompare(isoA);
    })
    .map(([fechaISO, medsDia]) => {
      const fechaEtiqueta = formatearFechaDiaPunto(fechaISO);
      const totalImagenes = medsDia.length;
      const etiquetaDia = `${totalImagenes} ${totalImagenes === 1 ? 'imagen' : 'imágenes'} · ${fechaEtiqueta}`;
      const resumenConteo = resumenConteoMediciones(medsDia);
      const etiquetaConteo = formatearConteoMediciones(medsDia);
      const { lotes, sueltas } = agruparPorLote(medsDia);

      let peorNivel = 0;
      let peorPct = 0;
      for (let i = 0; i < medsDia.length; i += 1) {
        const niv = nivelNum(medsDia[i]);
        const p = pctNum(medsDia[i]);
        if (i === 0 || niv > peorNivel) peorNivel = niv;
        if (i === 0 || p > peorPct) peorPct = p;
      }

      return {
        fechaISO,
        fechaEtiqueta,
        totalImagenes,
        etiquetaDia,
        resumenConteo,
        etiquetaConteo,
        peorNivel,
        peorPct: Math.round(peorPct * 10) / 10,
        lotes,
        sueltas,
        mediciones: medsDia,
      };
    });
}
