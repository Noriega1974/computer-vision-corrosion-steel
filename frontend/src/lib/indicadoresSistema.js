// Helpers puros para las tarjetas de "Estado general del sistema". Los
// números los calcula el servidor (GET /indicadores); aquí solo se convierten
// en texto y proporciones para pintarlos.

import { nivelLabel } from './statusUtils.js';
import { formatearFechaAmigable } from './fechas.js';

export const VENTANA_DIAS = 30;

// De severo a sin corrosión, para leer primero lo urgente.
const ORDEN_LEYENDA = [3, 2, 1, 0];
const NOMBRE_NIVEL = [
  { uno: 'sin corrosión', varios: 'sin corrosión' },
  { uno: 'leve', varios: 'leves' },
  { uno: 'moderado', varios: 'moderados' },
  { uno: 'severo', varios: 'severos' },
];

const entero = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);

// [{ nivel, cantidad, texto: "2 severos" }] solo de los niveles con puntos.
export function leyendaNiveles(porNivel = []) {
  return ORDEN_LEYENDA
    .map((nivel) => ({ nivel, cantidad: entero(porNivel[nivel]) }))
    .filter((s) => s.cantidad > 0)
    .map((s) => ({
      ...s,
      texto: `${s.cantidad} ${s.cantidad === 1 ? NOMBRE_NIVEL[s.nivel].uno : NOMBRE_NIVEL[s.nivel].varios}`,
    }));
}

// Segmentos de la barra apilada (mismo orden que la leyenda) con su ancho en %.
export function segmentosBarra(porNivel = []) {
  const segmentos = leyendaNiveles(porNivel);
  const total = segmentos.reduce((suma, s) => suma + s.cantidad, 0);
  return segmentos.map((s) => ({ ...s, ancho: total ? (s.cantidad / total) * 100 : 0 }));
}

// "2 severos · 1 moderado · 3 leves · 2 sin corrosión" (para lectores de pantalla y tooltip).
export function resumenNiveles(porNivel = []) {
  return leyendaNiveles(porNivel).map((s) => s.texto).join(' · ');
}

// "N sin mediciones" / "1 sin mediciones" -> texto, o '' si no hay.
export function textoSinMediciones(n) {
  const c = entero(n);
  return c ? `${c} sin ${c === 1 ? 'medición' : 'mediciones'}` : '';
}

// 36.55 -> "36,6 % promedio"; sin dato -> ''.
export function textoPromedio(pct) {
  const n = Number(pct);
  if (pct === null || pct === undefined || !Number.isFinite(n)) return '';
  return `${n.toFixed(1).replace('.', ',')} % promedio`;
}

// "5 de 8 puntos"
export function textoCobertura(cobertura) {
  const con = entero(cobertura?.con_medicion_30d);
  const total = entero(cobertura?.total_puntos);
  return `${con} de ${total} ${total === 1 ? 'punto' : 'puntos'}`;
}

// "Más atrasado: Bloque A, hace 45 días" | "..., sin mediciones" | ''.
export function textoAtrasado(masAtrasado) {
  if (!masAtrasado?.nombre) return '';
  const { nombre, dias } = masAtrasado;
  if (dias === null || dias === undefined) return `Más atrasado: ${nombre}, sin mediciones`;
  if (dias <= 0) return `Más atrasado: ${nombre}, medido hoy`;
  return `Más atrasado: ${nombre}, hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

// "N mediciones en 30 días"
export function textoMediciones30d(n) {
  const c = entero(n);
  return `${c} ${c === 1 ? 'medición' : 'mediciones'} en ${VENTANA_DIAS} días`;
}

// "Bloque A: Leve → Severa (3 nov)"
export function textoSubio(p, opciones) {
  const fecha = p?.fecha ? formatearFechaAmigable(p.fecha, { incluirDiaSemana: false, ...opciones }) : '';
  return `${p?.nombre ?? 'Punto sin nombre'}: ${nivelLabel(p?.de)} → ${nivelLabel(p?.a)}${fecha ? ` (${fecha})` : ''}`;
}

// "3 nov" para la fecha de la última medición.
export function fechaCorta(iso, opciones) {
  return iso ? formatearFechaAmigable(iso, { incluirDiaSemana: false, ...opciones }) : '';
}

// Sin puntos en el alcance no hay nada que resumir.
export function sinPuntos(datos) {
  return !datos || !(datos.total_puntos > 0);
}

// El servidor marca `parcial` (o `mediciones_30d_truncado`) cuando un tope de
// paginación cortó el cálculo: las cifras pueden estar incompletas.
export function esParcial(datos) {
  return Boolean(datos && (datos.parcial || datos.mediciones_30d_truncado));
}
