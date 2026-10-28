import React from 'react';

// Icono de nivel de corrosión tipo "barras de señal": nivel 0 = check sobre
// una línea base; niveles 1-3 = tres barras crecientes, rellenas tantas como
// el nivel y el resto solo con contorno. Decorativo: el texto del nivel va al lado.
const BARRAS = [
  { x: 5.5, h: 7 },
  { x: 12, h: 12 },
  { x: 18.5, h: 17 },
];

export function NivelIcon({ nivel, size = 24, color = 'currentColor' }) {
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
      style={{ display: 'block', flexShrink: 0 }}
    >
      {nivel === 0 ? (
        <>
          <path d="M3 21h18" />
          <path d="m6.5 11.5 4 4 7-8" />
        </>
      ) : (
        BARRAS.map(({ x, h }, i) => (
          <rect
            key={x}
            x={x - 1.9}
            y={21 - h}
            width="3.8"
            height={h}
            rx="1"
            fill={i < nivel ? color : 'none'}
          />
        ))
      )}
    </svg>
  );
}

export default NivelIcon;
