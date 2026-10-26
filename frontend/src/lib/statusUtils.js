// Mapeo de nivel_corrosion (0-3) según la norma ISO 10289.
// El nivel lo calcula el backend (única fuente de verdad); el frontend solo
// lo traduce a texto/color a través de la tabla NIVELES. No recalcular acá.
//   0: Sin corrosión   <0,05 % del área
//   1: Leve            0,05 – <10 %
//   2: Moderada        10 – <25 %
//   3: Severa          ≥25 %

export const NIVELES = [
  { status: 'OK',       label: 'Sin corrosión', short: 'Sin corrosión', range: '<0,05 %' },
  { status: 'EARLY',    label: 'Leve',          short: 'Leve',          range: '0,05–<10 %' },
  { status: 'MODERATE', label: 'Moderada',      short: 'Moderada',      range: '10–<25 %' },
  { status: 'CRITICAL', label: 'Severa',        short: 'Severa',        range: '≥25 %' },
];

const byStatus = (status) => NIVELES.find(n => n.status === status);

export function nivelToStatus(nivel) {
  return ['OK', 'EARLY', 'MODERATE', 'CRITICAL'][nivel] ?? 'OK';
}

export function getStatusColor(status) {
  return {
    OK:       '#16a34a',
    EARLY:    '#d97706',
    MODERATE: '#ea580c',
    CRITICAL: '#dc2626',
  }[status] ?? '#64748b';
}

export function getStatusBg(status) {
  return {
    OK:       'rgba(22,163,74,0.08)',
    EARLY:    'rgba(217,119,6,0.08)',
    MODERATE: 'rgba(234,88,12,0.10)',
    CRITICAL: 'rgba(220,38,38,0.10)',
  }[status] ?? 'transparent';
}

export function getStatusLabel(status) {
  return byStatus(status)?.label ?? status;
}

export function getStatusShortLabel(status) {
  return byStatus(status)?.short ?? status;
}

// Atajo: nivel (0-3) directo a color
export function nivelColor(nivel) {
  return getStatusColor(nivelToStatus(nivel));
}

// Texto único para chips, filtros, mapa, KPI y gráficas: "Severa ≥25 %".
export function nivelLabel(nivel) {
  return getStatusLabel(nivelToStatus(nivel));
}

// Rango de área corroída del nivel: "≥25 %".
export function nivelRange(nivel) {
  return NIVELES[nivel]?.range ?? '';
}

export function nivelShortLabel(nivel) {
  return getStatusShortLabel(nivelToStatus(nivel));
}

export function nivelBg(nivel) {
  return getStatusBg(nivelToStatus(nivel));
}
