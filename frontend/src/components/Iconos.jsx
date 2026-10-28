import React from 'react';

// Custom icon set, "line" style: 24x24 grid, 2.2 stroke, round caps and joins.
// Same contract as NivelIcon: decorative (aria-hidden), the visible text or the
// aria-label of the parent control carries the meaning.
// className and style are forwarded. strokeWidth (lucide API) is dropped on purpose
// so every icon keeps the same stroke weight.
// eslint-disable-next-line no-unused-vars
function Base({ size = 24, color = 'currentColor', strokeWidth, children, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
      style={{ display: 'block', flexShrink: 0, ...rest.style }}
    >
      {children}
    </svg>
  );
}

// Same motif as NivelIcon level 0.
export function IconoExito(props) {
  return (
    <Base {...props}>
      <path d="M3 21h18" />
      <path d="m6.5 11.5 4 4 7-8" />
    </Base>
  );
}

export function IconoError(props) {
  return (
    <Base {...props}>
      <path d="M10.3 4.2a2 2 0 0 1 3.4 0l7.4 12.9A2 2 0 0 1 19.4 20H4.6a2 2 0 0 1-1.7-2.9z" />
      <path d="M12 9v4.5" />
      <path d="M12 16.6v.01" />
    </Base>
  );
}

export function IconoInfo(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.01" />
    </Base>
  );
}

export function IconoCopiar(props) {
  return (
    <Base {...props}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.2" />
      <path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8" />
    </Base>
  );
}

export function IconoCerrar(props) {
  return (
    <Base {...props}>
      <path d="m7 7 10 10" />
      <path d="M17 7 7 17" />
    </Base>
  );
}

// Plain check for inline states such as "Copiado".
export function IconoCheck(props) {
  return (
    <Base {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Base>
  );
}

export function IconoVolver(props) {
  return (
    <Base {...props}>
      <path d="M19.5 12h-15"/>
      <path d="m11 5.5-6.5 6.5 6.5 6.5"/>
    </Base>
  );
}

export function IconoFlechaAtras(props) {
  return (
    <Base {...props}>
      <path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>
    </Base>
  );
}

export function IconoFlechaAdelante(props) {
  return (
    <Base {...props}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>
    </Base>
  );
}

export function IconoFlechaArriba(props) {
  return (
    <Base {...props}>
      <path d="m5.5 14.5 6.5-6.5 6.5 6.5"/>
    </Base>
  );
}

export function IconoFlechaAbajo(props) {
  return (
    <Base {...props}>
      <path d="m5.5 9.5 6.5 6.5 6.5-6.5"/>
    </Base>
  );
}

export function IconoMenu(props) {
  return (
    <Base {...props}>
      <path d="M4 6.5h16"/>
      <path d="M4 12h16"/>
      <path d="M4 17.5h16"/>
    </Base>
  );
}

export function IconoPanel(props) {
  return (
    <Base {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/>
      <path d="M10 3.5v17"/>
      <path d="M10 11h10.5"/>
    </Base>
  );
}

export function IconoCuadricula(props) {
  return (
    <Base {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1.5"/>
      <rect x="14" y="4" width="6" height="6" rx="1.5"/>
      <rect x="4" y="14" width="6" height="6" rx="1.5"/>
      <rect x="14" y="14" width="6" height="6" rx="1.5"/>
    </Base>
  );
}

export function IconoMundo(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9"/>
      <path d="M3 12h18"/>
      <ellipse cx="12" cy="12" rx="4" ry="9"/>
    </Base>
  );
}

export function IconoSalir(props) {
  return (
    <Base {...props}>
      <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10"/>
      <path d="M10 12h10"/>
      <path d="m16.5 8.5 3.5 3.5-3.5 3.5"/>
    </Base>
  );
}

export function IconoAgregar(props) {
  return (
    <Base {...props}>
      <path d="M12 5v14"/>
      <path d="M5 12h14"/>
    </Base>
  );
}

export function IconoEditar(props) {
  return (
    <Base {...props}>
      <path d="M4.8 19.2 5.6 15 16 4.6a2.1 2.1 0 0 1 3 0l.4.4a2.1 2.1 0 0 1 0 3L9 18.4z"/>
      <path d="m13.5 7.2 3.3 3.3"/>
    </Base>
  );
}

export function IconoEliminar(props) {
  return (
    <Base {...props}>
      <path d="M4 7h16"/>
      <path d="M9.5 7V4.5h5V7"/>
      <path d="M6.5 7l.9 12a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12"/>
    </Base>
  );
}

export function IconoDescargar(props) {
  return (
    <Base {...props}>
      <path d="M12 4v10.5"/>
      <path d="m7.5 10 4.5 4.5 4.5-4.5"/>
      <path d="M4.5 20h15"/>
    </Base>
  );
}

export function IconoSubir(props) {
  return (
    <Base {...props}>
      <path d="M12 15V4.5"/>
      <path d="m7.5 9 4.5-4.5L16.5 9"/>
      <path d="M4.5 20h15"/>
    </Base>
  );
}

export function IconoCompartir(props) {
  return (
    <Base {...props}>
      <circle cx="6" cy="12" r="2.6"/>
      <circle cx="18" cy="6" r="2.6"/>
      <circle cx="18" cy="18" r="2.6"/>
      <path d="M8.3 10.8 15.7 7.2"/>
      <path d="M8.3 13.2 15.7 16.8"/>
    </Base>
  );
}

export function IconoBuscar(props) {
  return (
    <Base {...props}>
      <circle cx="10.5" cy="10.5" r="6.5"/>
      <path d="m15.5 15.5 5 5"/>
    </Base>
  );
}

export function IconoSinResultados(props) {
  return (
    <Base {...props}>
      <circle cx="10.5" cy="10.5" r="6.5"/>
      <path d="m15.5 15.5 5 5"/>
      <path d="m8.2 8.2 4.6 4.6"/>
      <path d="m12.8 8.2-4.6 4.6"/>
    </Base>
  );
}

export function IconoActualizar(props) {
  return (
    <Base {...props}>
      <path d="M4.23 12.68A7.8 7.8 0 0 1 14.02 4.47"/>
      <path d="M11.92 0.83L14.02 4.47L10.38 6.57"/>
      <path d="M19.77 11.32A7.8 7.8 0 0 1 9.98 19.53"/>
      <path d="M12.08 23.17L9.98 19.53L13.62 17.43"/>
    </Base>
  );
}

export function IconoDeshacer(props) {
  return (
    <Base {...props}>
      <path d="M7.87 5.39A7.8 7.8 0 1 1 4.67 14.67"/>
      <path d="M11.96 6.33L7.87 5.39L8.81 1.29"/>
    </Base>
  );
}

export function IconoActivar(props) {
  return (
    <Base {...props}>
      <path d="M16.59 6.05A8 8 0 1 1 7.41 6.05"/>
      <path d="M12 3.5v8"/>
    </Base>
  );
}

export function IconoCasilla(props) {
  return (
    <Base {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3.5"/>
    </Base>
  );
}

export function IconoCasillaMarcada(props) {
  return (
    <Base {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3.5"/>
      <path d="m8.4 12.3 2.4 2.4 4.8-5.2"/>
    </Base>
  );
}

export function IconoMoverACarpeta(props) {
  return (
    <Base {...props}>
      <path d="M3.5 6.5a2 2 0 0 1 2-2h3.4l2.1 2.6h7.5a2 2 0 0 1 2 2V17.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>
      <path d="M8.5 13.2h7"/>
      <path d="m13 10.4 2.8 2.8-2.8 2.8"/>
    </Base>
  );
}

export function IconoEnfocar(props) {
  return (
    <Base {...props}>
      <path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9"/>
      <path d="M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9"/>
      <path d="M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15"/>
      <path d="M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15"/>
      <circle cx="12" cy="12" r="2.2"/>
    </Base>
  );
}

export function IconoDespejar(props) {
  return (
    <Base {...props}>
      <g transform="rotate(-40 11 10)"><rect x="3.5" y="5.5" width="15" height="9" rx="2.2"/><path d="M10 5.5v9"/></g>
      <path d="M11 20.5h9.5"/>
    </Base>
  );
}

export function IconoReproducir(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9"/>
      <path d="m10.2 8.6 5.4 3.4-5.4 3.4z"/>
    </Base>
  );
}

export function IconoHerramienta(props) {
  return (
    <Base {...props}>
      <path d="M20.14 7.27A4.2 4.2 0 1 1 16.73 3.86"/>
      <path d="M13 11 5.6 18.4a1.7 1.7 0 0 0 2.4 2.4L15.4 13.4"/>
    </Base>
  );
}

export function IconoCandado(props) {
  return (
    <Base {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/>
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>
      <path d="M12 15.6v.01"/>
    </Base>
  );
}

export function IconoAjustes(props) {
  return (
    <Base {...props}>
      <path d="M4 7.5h8.5"/>
      <path d="M17.5 7.5H20"/>
      <circle cx="15" cy="7.5" r="2.4"/>
      <path d="M4 16.5h2.5"/>
      <path d="M11.5 16.5H20"/>
      <circle cx="9" cy="16.5" r="2.4"/>
    </Base>
  );
}

export function IconoReloj(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 7v5.2l3.3 2"/>
    </Base>
  );
}

export function IconoSeguridad(props) {
  return (
    <Base {...props}>
      <path d="M12 3.2 19.5 6v5.6c0 4.5-3.1 7.6-7.5 9.2-4.4-1.6-7.5-4.7-7.5-9.2V6z"/>
      <path d="m8.8 12 2.3 2.3 4.2-4.5"/>
    </Base>
  );
}

export function IconoModeloIA(props) {
  return (
    <Base {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.2"/>
      <path d="M12 3v3.5"/>
      <path d="M12 17.5V21"/>
      <path d="M3 12h3.5"/>
      <path d="M17.5 12H21"/>
      <path d="M12 12v.01"/>
    </Base>
  );
}

export function IconoGrafico(props) {
  return (
    <Base {...props}>
      <path d="M4 4v16h16"/>
      <path d="M9 16v-4"/>
      <path d="M13 16V8"/>
      <path d="M17 16v-6"/>
    </Base>
  );
}

export function IconoTemperatura(props) {
  return (
    <Base {...props}>
      <path d="M10 13.2V6.5a2 2 0 0 1 4 0v6.7a4 4 0 1 1-4 0z"/>
      <path d="M12 17v-5.5"/>
    </Base>
  );
}

export function IconoHumedad(props) {
  return (
    <Base {...props}>
      <path d="M12 3.5S5.8 10 5.8 14.5a6.2 6.2 0 0 0 12.4 0C18.2 10 12 3.5 12 3.5z"/>
      <path d="M9 15a3 3 0 0 0 2.6 2.9"/>
    </Base>
  );
}

export function IconoLluvia(props) {
  return (
    <Base {...props}>
      <path d="M7.2 14.5a4.3 4.3 0 0 1-.6-8.5 5.7 5.7 0 0 1 10.9 1.4 3.6 3.6 0 0 1-.5 7.1"/>
      <path d="M8.5 18l-1.2 2.6"/>
      <path d="M12.8 17.5l-1.2 3"/>
      <path d="M17 18l-1.2 2.6"/>
    </Base>
  );
}

export function IconoViento(props) {
  return (
    <Base {...props}>
      <path d="M3.5 9h9.3a2.8 2.8 0 1 0-2.8-2.8"/>
      <path d="M3.5 13.5h14.2a2.8 2.8 0 1 1-2.8 2.8"/>
      <path d="M3.5 18h5"/>
    </Base>
  );
}

export function IconoSol(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="4"/>
      <path d="M19.2 12L21.4 12M17.09 17.09L18.65 18.65M12 19.2L12 21.4M6.91 17.09L5.35 18.65M4.8 12L2.6 12M6.91 6.91L5.35 5.35M12 4.8L12 2.6M17.09 6.91L18.65 5.35"/>
    </Base>
  );
}

export function IconoLuna(props) {
  return (
    <Base {...props}>
      <path d="M19.6 14.4A8.4 8.4 0 1 1 9.6 4.4a6.7 6.7 0 0 0 10 10z"/>
    </Base>
  );
}

export function IconoMicroscopio(props) {
  return (
    <Base {...props}>
      <g transform="rotate(-25 11.5 8)"><rect x="8.5" y="3" width="6" height="10" rx="1.5"/></g>
      <path d="M17 9.5a6.5 6.5 0 0 1-5 9.5"/>
      <path d="M6.5 20.5h11"/>
      <path d="M7.5 16.5h4.5"/>
    </Base>
  );
}

export function IconoUbicacion(props) {
  return (
    <Base {...props}>
      <path d="M12 21.2s6.6-5.4 6.6-11A6.6 6.6 0 0 0 5.4 10.2c0 5.6 6.6 11 6.6 11z"/>
      <circle cx="12" cy="10" r="2.3"/>
    </Base>
  );
}

export function IconoPunto(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="6.5"/>
      <path d="M12 2.8v4"/>
      <path d="M12 17.2v4"/>
      <path d="M2.8 12h4"/>
      <path d="M17.2 12h4"/>
    </Base>
  );
}

export function IconoEmpresa(props) {
  return (
    <Base {...props}>
      <path d="M6 20.5V5.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15"/>
      <path d="M3.5 20.5h17"/>
      <path d="M10 8h4"/>
      <path d="M10 12h4"/>
      <path d="M10.5 20.5v-3.5h3v3.5"/>
    </Base>
  );
}

export function IconoPlanta(props) {
  return (
    <Base {...props}>
      <path d="M3.5 20.5h17"/>
      <path d="M3.5 20.5v-9l4.5 3v-3l4.5 3v6"/>
      <path d="M16.5 20.5V5.5h4v15"/>
    </Base>
  );
}

export function IconoImagen(props) {
  return (
    <Base {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/>
      <circle cx="9" cy="10" r="1.3"/>
      <path d="M3.8 17l5-4.5 3.7 3.2 2.5-2.2 5.7 5"/>
    </Base>
  );
}

export function IconoSinImagen(props) {
  return (
    <Base {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/>
      <circle cx="9" cy="10" r="1.3"/>
      <path d="M3 3 21 21"/>
    </Base>
  );
}

export function IconoAgregarImagen(props) {
  return (
    <Base {...props}>
      <path d="M12.5 4.5h-6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6"/>
      <path d="m4.5 17 4.5-4.5 4 4"/>
      <path d="M17.5 3.5v6"/>
      <path d="M14.5 6.5h6"/>
    </Base>
  );
}

export function IconoCamara(props) {
  return (
    <Base {...props}>
      <path d="M3.5 8.8a2 2 0 0 1 2-2h2l1.5-2.6h6l1.5 2.6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>
      <circle cx="12" cy="13.2" r="3.6"/>
    </Base>
  );
}

export function IconoLista(props) {
  return (
    <Base {...props}>
      <path d="M8.5 5H7a2 2 0 0 0-2 2v12.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1.5"/>
      <rect x="8.5" y="3" width="7" height="4" rx="1.5"/>
      <path d="M9 12.5h6"/>
      <path d="M9 16.5h4"/>
    </Base>
  );
}

export function IconoUsuario(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="3.8"/>
      <path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>
    </Base>
  );
}

export function IconoUsuarios(props) {
  return (
    <Base {...props}>
      <circle cx="9.5" cy="8" r="3.3"/>
      <path d="M3.5 20c0-3.6 2.6-6 6-6s6 2.4 6 6"/>
      <path d="M15.5 4.9a3.3 3.3 0 0 1 0 6.2"/>
      <path d="M18 14.4c1.7.9 2.6 2.7 2.6 5.1"/>
    </Base>
  );
}

export function IconoDesactivarUsuario(props) {
  return (
    <Base {...props}>
      <circle cx="9.5" cy="8" r="3.6"/>
      <path d="M3 20.5c0-3.8 2.8-6.3 6.5-6.3 1.4 0 2.6.3 3.6.9"/>
      <path d="m16.5 10 4 4"/>
      <path d="m20.5 10-4 4"/>
    </Base>
  );
}
