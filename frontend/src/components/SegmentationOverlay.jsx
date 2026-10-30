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
 *   @param {number} zoom     - (opcional) zoom CSS que el padre aplica a toda la caja (ZoomPan);
 *                               el lienzo se dibuja a mayor resolución y con trazos de grosor
 *                               constante en pantalla, sin perder la alineación con la foto
 *
 * TODO: el backend actualmente no devuelve datos de segmentación por píxel/polígono.
 *       Solo expone nivel_corrosion, area_corroida_pct y confianza_promedio.
 *       Cuando el backend devuelva los polígonos, conectar aquí sin cambiar la interfaz.
 */
export default function SegmentationOverlay({ imagenUrl, mascaras = [], contorno = null, boxStyle, imgStyle, zoom = 1 }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const zoomRef = useRef(zoom);
  const dibujarRef = useRef(null);
  zoomRef.current = zoom;

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

      // Resolución del lienzo: sube con el zoom (escalones de 1x, 2x, 4x, 8x
      // para no redimensionarlo en cada giro de rueda), con tope de 4096 px.
      const z = zoomRef.current;
      const escalon = z <= 1 ? 1 : z <= 2 ? 2 : z <= 4 ? 4 : 8;
      const k = Math.max(1, Math.min(escalon * (window.devicePixelRatio || 1), 4096 / Math.max(boxW, boxH)));
      const anchoPx = Math.round(boxW * k), altoPx = Math.round(boxH * k);
      if (canvas.width !== anchoPx || canvas.height !== altoPx) {
        canvas.width = anchoPx;
        canvas.height = altoPx;
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, boxW, boxH);
      mascaras.forEach(({ puntos = [], color = '#dc2626', opacidad = 0.45 }) => {
        if (puntos.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(offX + puntos[0].x * w, offY + puntos[0].y * h);
        puntos.slice(1).forEach(p => ctx.lineTo(offX + p.x * w, offY + p.y * h));
        ctx.closePath();
        ctx.fillStyle = color + Math.round(opacidad * 255).toString(16).padStart(2, '0');
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 / z;
        ctx.stroke();
      });
      if (puntosPlaca.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(offX + puntosPlaca[0].x * w, offY + puntosPlaca[0].y * h);
        puntosPlaca.slice(1).forEach(p => ctx.lineTo(offX + p.x * w, offY + p.y * h));
        ctx.closePath();
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 2.5 / z;
        ctx.stroke();
      }
    };

    dibujarRef.current = draw;
    if (img.complete && img.naturalWidth > 0) draw();
    img.addEventListener('load', draw);
    // La caja es responsive: se redibuja cuando cambia su tamaño.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    ro?.observe(img);
    return () => {
      dibujarRef.current = null;
      img.removeEventListener('load', draw);
      ro?.disconnect();
    };
  }, [mascaras, contorno]);

  // Redibuja al cambiar el zoom (resolución y grosor de los trazos).
  useEffect(() => { dibujarRef.current?.(); }, [zoom]);

  if (!imagenUrl) return null;

  return (
    <div style={boxStyle ?? { position: 'relative', width: '100%' }}>
      <img
        ref={imgRef}
        src={imagenUrl}
        alt="Segmentación"
        draggable={false}
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
