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

// Escala de niveles del rediseño (docs/rediseno/REDISENO_DASHBOARD.md):
// la spec define 5 filas (incluye "Crítica"), pero el backend solo calcula
// 4 niveles (0-3, ver NIVELES arriba) -- se usan las primeras 4 filas de la
// tabla y se descarta "Crítica", que no tiene ningún nivel real que la
// produzca.
export function getStatusColor(status) {
  return {
    OK:       '#6F7F55',
    EARLY:    '#E3A24F',
    MODERATE: '#D06E2A',
    CRITICAL: '#9C3A1A',
  }[status] ?? '#64748b';
}

// Fondo de píldora/etiqueta (columna "Fondo de etiqueta" de la spec) --
// antes era una versión translúcida de getStatusColor; ahora son los
// tonos pastel planos que da la spec, independientes del color del marcador.
export function getStatusBg(status) {
  return {
    OK:       '#E5E7D6',
    EARLY:    '#F8E3C4',
    MODERATE: '#F6D5BC',
    CRITICAL: '#F0D2C7',
  }[status] ?? 'transparent';
}

// Texto sobre el fondo de píldora (columna "Texto de etiqueta" de la spec)
// -- deliberadamente más oscuro/saturado que getStatusColor para mantener
// contraste AA sobre el fondo pastel de arriba.
export function getStatusPillText(status) {
  return {
    OK:       '#3D452D',
    EARLY:    '#7A4A12',
    MODERATE: '#7A3510',
    CRITICAL: '#7A2A12',
  }[status] ?? 'var(--text-primary)';
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

export function nivelBg(nivel) {
  return getStatusBg(nivelToStatus(nivel));
}

// Color de texto sobre nivelBg(nivel) -- ver getStatusPillText.
export function nivelPillText(nivel) {
  return getStatusPillText(nivelToStatus(nivel));
}
