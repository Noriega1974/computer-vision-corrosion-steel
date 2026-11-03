import React, { useState, useRef, useCallback, useEffect } from 'react';
import { IconoAgregar, IconoEnfocar, IconoImagen, IconoQuitar } from './Iconos';
import { factorRueda } from '../lib/zoomPan';
import {
  CONTENEDOR_VISOR,
  MARCO_RECORTE,
  RADIO_RECORTE,
  SALIDA_AVATAR,
  ZOOM_MIN_AVATAR,
  ZOOM_MAX_AVATAR,
  calcularEscalaBase,
  limitarOffsetRecorte,
  zoomAvatarEnPunto,
  escalaExportacionRecorte,
} from '../lib/avatarCrop';

const PASO_BOTON = 1.35;

const MENSAJE_IMAGEN_NO_VALIDA =
  'No pudimos abrir esa imagen. Usa una foto JPG, PNG o WebP (los archivos HEIC del iPhone no se pueden abrir aquí).';

function AvisoError({ texto }) {
  if (!texto) return null;
  return (
    <div
      role="alert"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 12px',
        background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent-red) 25%, transparent)',
        borderRadius: 7,
        color: 'var(--accent-red)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-xs)',
        textAlign: 'left',
      }}
    >
      {texto}
    </div>
  );
}

const ctrlBtnStyle = {
  width: 30,
  height: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-card-solid)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 7,
  cursor: 'pointer',
  padding: 0,
};

// Recortador de foto de perfil con guía cuadrada redondeada (radio según
// RATIO_RADIO_AVATAR, igual que el avatar en Configuración y barra lateral) y zoom con rueda,
// pellizco de dos dedos o botones + / − / Restablecer.
export default function AvatarCropper({ onConfirm, onCancel }) {
  const inputRef = useRef(null);
  const visorRef = useRef(null);
  const [img, setImg] = useState(null); // HTMLImageElement cargado
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const [errorImagen, setErrorImagen] = useState('');

  const punterosRef = useRef(new Map());
  const pellizcoRef = useRef(null);
  const estadoRef = useRef({ zoom: 1, offset: { x: 0, y: 0 }, baseScale: 1, img: null });
  estadoRef.current = { zoom, offset, baseScale, img };

  const escala = baseScale * zoom;

  const aplicarZoom = useCallback((factor, cxDesdeCentro = 0, cyDesdeCentro = 0) => {
    const actual = estadoRef.current;
    if (!actual.img) return;
    const res = zoomAvatarEnPunto(
      { zoom: actual.zoom, offset: actual.offset },
      factor,
      cxDesdeCentro,
      cyDesdeCentro,
      actual.baseScale,
      actual.img.naturalWidth,
      actual.img.naturalHeight,
      MARCO_RECORTE,
    );
    setZoom(res.zoom);
    setOffset(res.offset);
  }, []);

  // Rueda del mouse sobre el visor: acerca/aleja directamente sin requerir Ctrl
  useEffect(() => {
    const el = visorRef.current;
    if (!el || !img) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      aplicarZoom(factorRueda(e.deltaY, e.deltaMode), cx, cy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [img, aplicarZoom]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorImagen('');
    // Si el navegador no puede decodificar el archivo (p. ej. HEIC de iPhone),
    // `image.onerror` es la única señal: sin este aviso el usuario ve que no pasa nada.
    const fallo = () => setErrorImagen(MENSAJE_IMAGEN_NO_VALIDA);
    const reader = new FileReader();
    reader.onerror = fallo;
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const base = calcularEscalaBase(image.naturalWidth, image.naturalHeight, MARCO_RECORTE);
        setImg(image);
        setBaseScale(base);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      };
      image.onerror = fallo;
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    punterosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (punterosRef.current.size === 2) {
      const [a, b] = [...punterosRef.current.values()];
      pellizcoRef.current = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }
    setArrastrando(true);
  };

  const onPointerMove = (e) => {
    const previo = punterosRef.current.get(e.pointerId);
    if (!previo || !img) return;
    const actual = { x: e.clientX, y: e.clientY };
    punterosRef.current.set(e.pointerId, actual);

    if (punterosRef.current.size >= 2) {
      const [a, b] = [...punterosRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const factor = pellizcoRef.current ? dist / pellizcoRef.current : 1;
      pellizcoRef.current = dist;
      const rect = visorRef.current.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - (rect.left + rect.width / 2);
      const cy = (a.y + b.y) / 2 - (rect.top + rect.height / 2);
      aplicarZoom(factor, cx, cy);
    } else {
      const dx = actual.x - previo.x;
      const dy = actual.y - previo.y;
      setOffset((o) =>
        limitarOffsetRecorte(
          { x: o.x + dx, y: o.y + dy },
          baseScale * zoom,
          img.naturalWidth,
          img.naturalHeight,
          MARCO_RECORTE,
        ),
      );
    }
  };

  const onPointerUp = (e) => {
    punterosRef.current.delete(e.pointerId);
    const quedan = [...punterosRef.current.values()];
    pellizcoRef.current =
      quedan.length >= 2
        ? Math.hypot(quedan[0].x - quedan[1].x, quedan[0].y - quedan[1].y) || 1
        : null;
    if (punterosRef.current.size === 0) setArrastrando(false);
  };

  const restablecerVista = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleConfirmar = () => {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = SALIDA_AVATAR;
    canvas.height = SALIDA_AVATAR;
    const ctx = canvas.getContext('2d');
    // JPEG no tiene transparencia: sin fondo blanco un PNG transparente saldría negro.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SALIDA_AVATAR, SALIDA_AVATAR);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Exporta exactamente el área dentro del marco guía (MARCO_RECORTE -> SALIDA_AVATAR)
    const outputScale = escalaExportacionRecorte(MARCO_RECORTE, SALIDA_AVATAR);
    ctx.save();
    ctx.translate(SALIDA_AVATAR / 2, SALIDA_AVATAR / 2);
    ctx.scale(outputScale, outputScale);
    ctx.translate(offset.x, offset.y);
    ctx.scale(escala, escala);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
    onConfirm(canvas.toDataURL('image/jpeg', 0.88));
  };

  if (!img) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-4) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
        <AvisoError texto={errorImagen} />
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '32px 24px',
            background: 'var(--bg-inset)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 10,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            width: '100%',
          }}
        >
          <IconoImagen size={28} />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            Elegir foto de la galería
          </span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
            Podrás acercar y encuadrar la imagen antes de guardarla
          </span>
        </button>
      </div>
    );
  }

  const puedeAcercar = zoom < ZOOM_MAX_AVATAR - 1e-4;
  const puedeAlejar = zoom > ZOOM_MIN_AVATAR + 1e-4;
  const puedeRestablecer = puedeAlejar || Math.abs(offset.x) > 0.5 || Math.abs(offset.y) > 0.5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
      <AvisoError texto={errorImagen} />
      <div
        ref={visorRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          width: CONTENEDOR_VISOR,
          height: CONTENEDOR_VISOR,
          borderRadius: 14,
          overflow: 'hidden',
          position: 'relative',
          background: '#0f172a',
          cursor: arrastrando ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          border: '1px solid var(--border)',
        }}
      >
        <img
          src={img.src}
          alt="Vista previa de recorte"
          draggable={false}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: img.naturalWidth * escala,
            height: img.naturalHeight * escala,
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
        {/* Guía con la forma exacta del avatar (cuadrado con esquinas redondeadas, RADIO_RECORTE) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: MARCO_RECORTE,
              height: MARCO_RECORTE,
              borderRadius: RADIO_RECORTE,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.58)',
              border: '2px solid rgba(255, 255, 255, 0.88)',
            }}
          />
        </div>
      </div>

      {/* Controles de zoom (+ / − / Restablecer) y cambio de archivo */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            aria-label="Alejar"
            title="Alejar"
            disabled={!puedeAlejar}
            onClick={() => aplicarZoom(1 / PASO_BOTON)}
            style={{
              ...ctrlBtnStyle,
              opacity: puedeAlejar ? 1 : 0.45,
              cursor: puedeAlejar ? 'pointer' : 'not-allowed',
            }}
          >
            <IconoQuitar size={15} />
          </button>
          <span
            style={{
              minWidth: 46,
              textAlign: 'center',
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--text-xs)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--text-secondary)',
            }}
          >
            {Math.round(zoom * 100)} %
          </span>
          <button
            type="button"
            aria-label="Acercar"
            title="Acercar"
            disabled={!puedeAcercar}
            onClick={() => aplicarZoom(PASO_BOTON)}
            style={{
              ...ctrlBtnStyle,
              opacity: puedeAcercar ? 1 : 0.45,
              cursor: puedeAcercar ? 'pointer' : 'not-allowed',
            }}
          >
            <IconoAgregar size={15} />
          </button>
          <button
            type="button"
            aria-label="Restablecer encuadre"
            title="Restablecer encuadre"
            disabled={!puedeRestablecer}
            onClick={restablecerVista}
            style={{
              ...ctrlBtnStyle,
              opacity: puedeRestablecer ? 1 : 0.45,
              cursor: puedeRestablecer ? 'pointer' : 'not-allowed',
            }}
          >
            <IconoEnfocar size={15} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            padding: '5px 10px',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-2xs)',
            fontWeight: 500,
          }}
        >
          Elegir otra imagen
        </button>
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>

      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textAlign: 'center' }}>
        Usa la rueda del mouse, pellizca o arrastra para ajustar el encuadre.
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', width: '100%', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '7px 16px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleConfirmar}
          style={{
            padding: '7px 16px',
            background: 'var(--accent-amber)',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
            fontSize: 'var(--text-sm)',
            color: 'white',
          }}
        >
          Usar esta foto
        </button>
      </div>
    </div>
  );
}
