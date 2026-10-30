import React, { useEffect, useRef } from 'react';

/**
 * Renderiza una máscara de segmentación canvas sobre la imagen de medición.
 *
 * Props esperadas (cuando el backend las implemente):
 *   @param {string} imagenUrl - URL de la imagen base
 *   @param {Array}  mascaras  - Array de objetos con polígonos de las áreas detectadas:
 *                               [{ puntos: [{x, y}], color?: string, opacidad?: number }]
 *                               donde x/y están en rango [0, 1] relativo a la imagen
 *   @param {Object} contorno  - (opcional) contorno de la placa: { puntos: [{x, y}] } en [0, 1];
 *                               se dibuja en verde, solo línea, sobre los polígonos
 *
 * TODO: el backend actualmente no devuelve datos de segmentación por píxel/polígono.
 *       Solo expone nivel_corrosion, area_corroida_pct y confianza_promedio.
 *       Cuando el backend devuelva los polígonos, conectar aquí sin cambiar la interfaz.
 */
export default function SegmentationOverlay({ imagenUrl, mascaras = [], contorno = null, boxStyle, imgStyle }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const puntosPlaca = contorno?.puntos ?? [];
    if (mascaras.length === 0 && puntosPlaca.length < 3) return;

    const draw = () => {
      if (!img.naturalWidth) return;
      // Con object-fit: contain la imagen visible no ocupa toda la caja: se
      // calcula el rectángulo real (con franjas a los lados o arriba/abajo)
      // para que los polígonos [0, 1] caigan sobre la imagen y no sobre la caja.
      const boxW = img.clientWidth;
      const boxH = img.clientHeight;
      const escala = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
      const w = img.naturalWidth * escala;
      const h = img.naturalHeight * escala;
      const offX = (boxW - w) / 2;
      const offY = (boxH - h) / 2;

      canvas.width = boxW;
      canvas.height = boxH;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      mascaras.forEach(({ puntos = [], color = '#dc2626', opacidad = 0.45 }) => {
        if (puntos.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(offX + puntos[0].x * w, offY + puntos[0].y * h);
        puntos.slice(1).forEach(p => ctx.lineTo(offX + p.x * w, offY + p.y * h));
        ctx.closePath();
        ctx.fillStyle = color + Math.round(opacidad * 255).toString(16).padStart(2, '0');
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      if (puntosPlaca.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(offX + puntosPlaca[0].x * w, offY + puntosPlaca[0].y * h);
        puntosPlaca.slice(1).forEach(p => ctx.lineTo(offX + p.x * w, offY + p.y * h));
        ctx.closePath();
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    };

    if (img.complete && img.naturalWidth > 0) draw();
    img.addEventListener('load', draw);
    // La caja es responsive: se redibuja cuando cambia su tamaño.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    ro?.observe(img);
    return () => {
      img.removeEventListener('load', draw);
      ro?.disconnect();
    };
  }, [mascaras, contorno]);

  if (!imagenUrl) return null;

  return (
    <div style={boxStyle ?? { position: 'relative', width: '100%' }}>
      <img
        ref={imgRef}
        src={imagenUrl}
        alt="Segmentación"
        style={imgStyle ?? { width: '100%', display: 'block', borderRadius: 8 }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none', borderRadius: 8,
        }}
      />
    </div>
  );
}
