import React, { useState, useRef, useCallback } from 'react';
import { Image as ImageIcon, RotateCcw } from 'lucide-react';

const CONTENEDOR = 240; // px, tamaño del visor cuadrado
const SALIDA = 320;     // px, tamaño de la imagen final guardada
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

// Recorte circular estilo WhatsApp: se elige una foto de la galería, se
// arrastra y hace zoom para ubicar la parte deseada dentro del círculo guía.
// La imagen guardada es cuadrada (el círculo es solo la guía visual) -- las
// tarjetas de avatar de la app ya son cuadradas con esquinas redondeadas,
// no círculos perfectos, así que no hace falta recortar a círculo real.
export default function AvatarCropper({ onConfirm, onCancel }) {
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const [img, setImg] = useState(null); // HTMLImageElement cargado
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null); // { startX, startY, offsetX, offsetY }

  const escala = baseScale * zoom;

  const clamp = useCallback((val, max) => Math.max(-max, Math.min(max, val)), []);

  const clampOffset = useCallback((o, s, imagen) => {
    if (!imagen) return o;
    const w = imagen.naturalWidth * s;
    const h = imagen.naturalHeight * s;
    const maxX = Math.max(0, (w - CONTENEDOR) / 2);
    const maxY = Math.max(0, (h - CONTENEDOR) / 2);
    return { x: clamp(o.x, maxX), y: clamp(o.y, maxY) };
  }, [clamp]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const base = Math.max(CONTENEDOR / image.naturalWidth, CONTENEDOR / image.naturalHeight);
        setImg(image);
        setBaseScale(base);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleZoom = (e) => {
    const nuevoZoom = Number(e.target.value);
    setZoom(nuevoZoom);
    setOffset(o => clampOffset(o, baseScale * nuevoZoom, img));
  };

  const startDrag = (clientX, clientY) => {
    dragRef.current = { startX: clientX, startY: clientY, offsetX: offset.x, offsetY: offset.y };
  };
  const moveDrag = (clientX, clientY) => {
    if (!dragRef.current) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    setOffset(clampOffset(
      { x: dragRef.current.offsetX + dx, y: dragRef.current.offsetY + dy },
      escala, img
    ));
  };
  const endDrag = () => { dragRef.current = null; };

  const handleConfirmar = () => {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = SALIDA;
    canvas.height = SALIDA;
    const ctx = canvas.getContext('2d');
    const outputScale = SALIDA / CONTENEDOR;
    ctx.save();
    ctx.translate(SALIDA / 2, SALIDA / 2);
    ctx.scale(outputScale, outputScale);
    ctx.translate(offset.x, offset.y);
    ctx.scale(escala, escala);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
    onConfirm(canvas.toDataURL('image/jpeg', 0.85));
  };

  if (!img) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        <button
          type="button" onClick={() => inputRef.current?.click()}
          style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
            padding: '32px 24px', background: 'var(--bg-inset)', border: '1px dashed var(--border)',
            borderRadius: 10, cursor: 'pointer', color: 'var(--text-muted)', width: '100%',
          }}
        >
          <ImageIcon size={28} strokeWidth={1.5} />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)' }}>Elegir foto de la galería</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div
        style={{
          width: CONTENEDOR, height: CONTENEDOR, borderRadius: 8, overflow: 'hidden',
          position: 'relative', background: '#000', cursor: 'grab', touchAction: 'none',
        }}
        onMouseDown={e => startDrag(e.clientX, e.clientY)}
        onMouseMove={e => e.buttons === 1 && moveDrag(e.clientX, e.clientY)}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={e => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={endDrag}
      >
        <img
          ref={imgRef}
          src={img.src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: img.naturalWidth * escala, height: img.naturalHeight * escala,
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            userSelect: 'none', pointerEvents: 'none',
          }}
        />
        {/* Guía circular -- el "agujero" transparente en el centro de un
            overlay oscuro, truco de box-shadow gigante en vez de un SVG. */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: CONTENEDOR - 20, height: CONTENEDOR - 20, borderRadius: '50%',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            border: '2px solid rgba(255,255,255,0.8)',
          }} />
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-faint)' }}>Zoom</span>
        <input
          type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.01} value={zoom}
          onChange={handleZoom}
          style={{ flex: 1, accentColor: 'var(--accent-amber)' }}
        />
        <button
          type="button" onClick={() => inputRef.current?.click()}
          title="Elegir otra foto"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
        >
          <RotateCcw size={15} />
        </button>
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', width: '100%', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{
          padding: '7px 16px', background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
        }}>
          Cancelar
        </button>
        <button type="button" onClick={handleConfirmar} style={{
          padding: '7px 16px', background: 'var(--accent-amber)', border: 'none',
          borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'white',
        }}>
          Usar esta foto
        </button>
      </div>
    </div>
  );
}
