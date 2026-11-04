// Mapeo de nivel_corrosion (0-3) según la norma ISO 10289.
// El nivel lo calcula el backend (única fuente de verdad); el frontend solo
// lo traduce a texto/color a través de la tabla NIVELES. No recalcular acá.
//   0: Sin corrosión   <0,05 % del área
//   1: Leve            0,05 – <10 %
//   2: Moderada        10 – <25 %
//   3: Severa          ≥25 %

export const NIVELES = [
  { status: 'OK',       label: 'Sin corrosión', range: 'Menor a 0,05%' },
  { status: 'EARLY',    label: 'Leve',          range: '0,05% a 10%' },
  { status: 'MODERATE', label: 'Moderada',      range: '10% a 25%' },
  { status: 'CRITICAL', label: 'Severa',        range: '25% o más' },
];

const byStatus = (status) => NIVELES.find(n => n.status === status);

export function nivelToStatus(nivel) {
  return ['OK', 'EARLY', 'MODERATE', 'CRITICAL'][nivel] ?? 'OK';
}

// Única paleta de niveles (relleno de chips, puntos, mapa, leyendas y barra
// anual): verde / ámbar / naranja intenso / rojo. El ámbar es #f59e0b porque en
// la barra anual (franjas de 3 px) el leve debía distinguirse del moderado.
export const COLORES_NIVEL = ['#16a34a', '#f59e0b', '#ea580c', '#dc2626'];
export const COLOR_NIVEL_DESCONOCIDO = '#64748b';

export function getStatusColor(status) {
  const i = NIVELES.findIndex(n => n.status === status);
  return COLORES_NIVEL[i] ?? COLOR_NIVEL_DESCONOCIDO;
}

export function getStatusBg(status) {
  return {
    OK:       'rgba(22,163,74,0.08)',
    EARLY:    'rgba(245,158,11,0.10)',
    MODERATE: 'rgba(234,88,12,0.10)',
    CRITICAL: 'rgba(220,38,38,0.10)',
  }[status] ?? 'transparent';
}

export function getStatusLabel(status) {
  return byStatus(status)?.label ?? status;
}

// Atajo: nivel (0-3) directo a color
export function nivelColor(nivel) {
  return getStatusColor(nivelToStatus(nivel));
}

// Texto único para chips, filtros, mapa, KPI y gráficas: "Severa ≥25 %".
export function nivelLabel(nivel) {
  return getStatusLabel(nivelToStatus(nivel));
}

// Color para TEXTO de un nivel: el relleno ámbar (#f59e0b) no llega a 4,5:1 sobre
// fondo claro, así que el texto usa variables CSS con una variante más oscura en
// tema claro y la clara en tema oscuro (definidas en index.css).
export function nivelColorTexto(nivel) {
  const i = Math.trunc(Number(nivel));
  return i >= 0 && i < COLORES_NIVEL.length ? `var(--nivel-${i}-texto)` : 'var(--text-muted)';
}

export function nivelBg(nivel) {
  return getStatusBg(nivelToStatus(nivel));
}
