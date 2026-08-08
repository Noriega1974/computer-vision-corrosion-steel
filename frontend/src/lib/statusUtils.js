// Mapeo de nivel_corrosion (0-3) del backend a etiquetas internas

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
    OK:       'Sin Corrosión',
    EARLY:    'Corrosión Leve',
    MODERATE: 'Corrosión Moderada',
    CRITICAL: 'Corrosión Severa',
  }[status] ?? status;
}

// Atajo: nivel (0-3) directo a color
export function nivelColor(nivel) {
  return getStatusColor(nivelToStatus(nivel));
}

export function nivelLabel(nivel) {
  return getStatusLabel(nivelToStatus(nivel));
}

export function nivelBg(nivel) {
  return getStatusBg(nivelToStatus(nivel));
}
