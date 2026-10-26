// Mapeo de nivel_corrosion (0-3) según la norma ISO 10289 (evaluación de probetas recubiertas)
// 0: Sin corrosión (<0.05 % del área, Rp 10)
// 1: Corrosión Leve (0.05 % - <10 % del área, Rp 9 a 7)
// 2: Corrosión Moderada (10 % - <25 % del área, Rp 6 a 4)
// 3: Corrosión Severa (≥25 % del área, Rp 3 a 0)

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
  return {
    OK:       'Sin Corrosión (Rp 10)',
    EARLY:    'Corrosión Leve (Rp 9-7)',
    MODERATE: 'Corrosión Moderada (Rp 6-4)',
    CRITICAL: 'Corrosión Severa (Rp 3-0)',
  }[status] ?? status;
}

export function getStatusShortLabel(status) {
  return {
    OK:       'Sin Corrosión',
    EARLY:    'Leve',
    MODERATE: 'Moderada',
    CRITICAL: 'Severa',
  }[status] ?? status;
}

export function calcularNivelISO(areaPct) {
  const p = Number(areaPct) || 0;
  if (p < 0.05) return 0;
  if (p < 10) return 1;
  if (p < 25) return 2;
  return 3;
}

// Atajo: nivel (0-3) directo a color
export function nivelColor(nivel) {
  return getStatusColor(nivelToStatus(nivel));
}

export function nivelLabel(nivel) {
  return getStatusLabel(nivelToStatus(nivel));
}

export function nivelShortLabel(nivel) {
  return getStatusShortLabel(nivelToStatus(nivel));
}

export function nivelBg(nivel) {
  return getStatusBg(nivelToStatus(nivel));
}
