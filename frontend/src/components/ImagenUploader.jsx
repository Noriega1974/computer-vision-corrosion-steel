import React, { useEffect, useRef, useState } from 'react';
import { IconoActualizar, IconoAgregarImagen, IconoEliminar, IconoError } from './Iconos';
import { IMAGEN_TIPOS, validarImagen } from '../lib/imagenesApi';

// Selector de imagen con vista previa, reemplazo y quitar (logo de empresa o
// foto de un punto). Es controlado: no sube nada, solo guarda la elección en
// `valor` = { archivo, quitar } y el formulario la aplica al guardar.
//   url        imagen ya guardada (URL prefirmada) o null
//   forma      'logo' (cuadrada, se ve completa sobre fondo neutro) | 'foto' (apaisada, recortada)
export default function ImagenUploader({ id, etiqueta, ayuda, url, valor, onChange, forma = 'logo', disabled = false }) {
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const [vistaPrevia, setVistaPrevia] = useState(null);

  // Vista previa local del archivo elegido (se libera al cambiarlo o desmontar).
  useEffect(() => {
    if (!valor.archivo) { setVistaPrevia(null); return undefined; }
    const objeto = URL.createObjectURL(valor.archivo);
    setVistaPrevia(objeto);
    return () => URL.revokeObjectURL(objeto);
  }, [valor.archivo]);

  const mostrada = vistaPrevia ?? (valor.quitar ? null : url ?? null);

  const elegir = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';  // permite volver a elegir el mismo archivo
    if (!file) return;
    const problema = validarImagen(file);
    if (problema) { setError(problema); return; }
    setError(null);
    onChange({ archivo: file, quitar: false });
  };

  const quitar = () => {
    setError(null);
    // Sin imagen guardada solo se descarta la elección; con una guardada se marca para borrarla.
    onChange({ archivo: null, quitar: Boolean(url) });
  };

  const esLogo = forma === 'logo';
  const boton = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
    background: 'var(--bg-inset)', border: '1px solid var(--text-muted)', cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <div>
      <label htmlFor={id} style={{
        display: 'block', fontFamily: 'var(--font-data)', fontSize: 'var(--text-3xs)',
        fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--text-faint)', marginBottom: 5,
      }}>
        {etiqueta}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          width: esLogo ? 88 : 140, height: 88, flexShrink: 0, borderRadius: 10,
          background: 'var(--bg-inset)', border: '1px solid var(--border)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {mostrada ? (
            <img src={mostrada} alt={etiqueta} style={{
              width: '100%', height: '100%', display: 'block',
              objectFit: esLogo ? 'contain' : 'cover', padding: esLogo ? 6 : 0, boxSizing: 'border-box',
            }} />
          ) : (
            <IconoAgregarImagen size={26} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <input
            ref={inputRef} id={id} type="file" accept={IMAGEN_TIPOS.join(',')}
            onChange={elegir} disabled={disabled} style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} style={boton}>
              {mostrada ? <IconoActualizar size={13} aria-hidden="true" /> : <IconoAgregarImagen size={13} aria-hidden="true" />}
              {mostrada ? 'Reemplazar' : 'Subir imagen'}
            </button>
            {mostrada && (
              <button type="button" disabled={disabled} onClick={quitar} style={boton}>
                <IconoEliminar size={13} aria-hidden="true" />
                Quitar
              </button>
            )}
          </div>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
            {ayuda ?? 'JPEG, PNG o WebP, máximo 5 MB.'}
          </span>
        </div>
      </div>
      {error && (
        <div role="alert" style={{
          marginTop: 8, padding: '7px 10px', background: 'rgba(220,38,38,0.08)',
          border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626',
          fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <IconoError size={13} aria-hidden="true" /> {error}
        </div>
      )}
    </div>
  );
}
