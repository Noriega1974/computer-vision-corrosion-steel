import React from 'react';

// Icono de nivel de corrosión tipo "barras de señal": nivel 0 = check sobre
// una línea base; niveles 1-3 = tres barras crecientes, rellenas tantas como
// el nivel y el resto solo con contorno. Decorativo: el texto del nivel va al lado.
const BARRAS = [
  { x: 6, h: 5 },
  { x: 12, h: 9 },
  { x: 18, h: 13 },
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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {nivel === 0 ? (
        <>
          <path d="M4 20h16" />
          <path d="m8 11 3 3 5-6" />
        </>
      ) : (
        BARRAS.map(({ x, h }, i) => (
          <rect
            key={x}
            x={x - 1.6}
            y={20 - h}
            width="3.2"
            height={h}
            rx="0.8"
            fill={i < nivel ? color : 'none'}
          />
        ))
      )}
    </svg>
  );
}

export default NivelIcon;
