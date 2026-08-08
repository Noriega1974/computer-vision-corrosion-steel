import React from 'react';

/**
 * Renderiza bounding boxes SVG sobre una imagen de medición.
 *
 * Props esperadas (cuando el backend las implemente):
 *   @param {string}  imagenUrl   - URL de la imagen base
 *   @param {Array}   detecciones - Array de objetos con coordenadas normalizadas:
 *                                  [{ x, y, w, h, confianza, clase }]
 *                                  donde x/y/w/h están en rango [0, 1] relativo a la imagen
 *
 * TODO: el backend actualmente no devuelve detecciones individuales en el response.
 *       Solo expone nivel_corrosion, area_corroida_pct y confianza_promedio.
 *       Cuando el backend devuelva el array de detecciones, conectar aquí sin cambiar la interfaz.
 */
export default function BoundingBoxOverlay({ imagenUrl, detecciones = [] }) {
  if (!imagenUrl) return null;

  return (
    <div style={{ position: 'relative', width: '100%', display: 'inline-block' }}>
      <img
        src={imagenUrl}
        alt="Detección"
        style={{ width: '100%', display: 'block', borderRadius: 8 }}
      />

      {/* SVG superpuesto para los bounding boxes */}
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none',
        }}
      >
        {detecciones.map((det, i) => (
          <g key={i}>
            <rect
              x={det.x - det.w / 2}
              y={det.y - det.h / 2}
              width={det.w}
              height={det.h}
              fill="none"
              stroke="#dc2626"
              strokeWidth="0.003"
              strokeDasharray={det.confianza < 0.5 ? '0.01' : undefined}
            />
            {/* Etiqueta de confianza */}
            <text
              x={det.x - det.w / 2 + 0.005}
              y={det.y - det.h / 2 - 0.01}
              fontSize="0.025"
              fill="#dc2626"
              fontFamily="monospace"
            >
              {det.clase ?? 'corrosion'} {det.confianza ? `${(det.confianza * 100).toFixed(0)}%` : ''}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
