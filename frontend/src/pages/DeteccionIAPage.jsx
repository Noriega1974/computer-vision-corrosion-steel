import React, { useRef, useState, useCallback } from 'react';
import exifr from 'exifr';
import { useUploadMedicion } from '../hooks/useUploadMedicion';
import SegmentationOverlay from '../components/SegmentationOverlay';
import BoundingBoxOverlay from '../components/BoundingBoxOverlay';

const NIVEL_LABELS = ['Sin corrosión', 'Leve', 'Moderada', 'Severa'];
const NIVEL_COLORS = ['#16a34a', '#d97706', '#ea580c', '#dc2626'];
const NIVEL_EMOJIS = ['✅', '⚠️', '🔶', '🚨'];

const toBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

export default function DeteccionIAPage() {
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef(null);
  const { upload, loading, error, result, reset } = useUploadMedicion();

  const cargarArchivo = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setArchivo(file);
    setPreview(URL.createObjectURL(file));
    reset();
  }, [reset]);

  const onDrop = (e) => {
    e.preventDefault();
    setArrastrando(false);
    cargarArchivo(e.dataTransfer.files[0]);
  };

  const analizar = async () => {
    if (!archivo) return;
    const [imagen_base64, gps] = await Promise.all([
      toBase64(archivo),
      exifr.gps(archivo).catch(() => null),
    ]);
    const lat = gps?.latitude ?? 0;
    const lng = gps?.longitude ?? 0;
    await upload({
      imagen_base64,
      fuente: 'web',
      ubicacion: {
        modo: 'coordenadas_libres',
        latitud: lat,
        longitud: lng,
        descripcion: 'Detección rápida IA',
      },
    });
  };

  const nivel = result?.nivel_corrosion ?? null;
  const color = nivel !== null ? NIVEL_COLORS[nivel] : 'var(--accent-amber)';

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>

      {/* Drop zone / preview */}
      {!result && (
        <div
          onClick={() => !archivo && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${arrastrando ? 'var(--accent-amber)' : 'var(--border)'}`,
            borderRadius: 12,
            background: arrastrando ? 'var(--bg-inset)' : 'var(--bg-card)',
            minHeight: 260,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: archivo ? 'default' : 'pointer',
            transition: 'border-color 0.2s',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {preview ? (
            <img
              src={preview}
              alt="Vista previa"
              style={{ maxHeight: 420, maxWidth: '100%', borderRadius: 10, objectFit: 'contain' }}
            />
          ) : (
            <>
              <span style={{ fontSize: 48, marginBottom: 12 }}>📷</span>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 15 }}>
                Arrastrá una imagen o hacé click para seleccionar
              </p>
              <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 13 }}>
                JPG · PNG · WEBP
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => cargarArchivo(e.target.files[0])}
          />
        </div>
      )}

      {/* Botones */}
      {!result && (
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button
            onClick={analizar}
            disabled={!archivo || loading}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 8,
              border: 'none',
              background: archivo && !loading ? 'var(--accent-amber)' : 'var(--bg-inset)',
              color: archivo && !loading ? '#fff' : 'var(--text-muted)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 15,
              cursor: archivo && !loading ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Analizando…' : '🔍 Analizar'}
          </button>
          {archivo && !loading && (
            <button
              onClick={() => { setArchivo(null); setPreview(null); reset(); }}
              style={{
                padding: '12px 20px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
              }}
            >
              Cambiar
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 16, padding: '12px 16px', borderRadius: 8,
          background: 'var(--bg-inset)', border: '1px solid var(--accent-red)',
          color: 'var(--accent-red)', fontSize: 14,
        }}>
          Error: {error}
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div>
          {/* Banner de nivel */}
          <div style={{
            padding: '16px 20px', borderRadius: 10, marginBottom: 20,
            background: 'var(--bg-card)', borderLeft: `4px solid ${color}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 32 }}>{NIVEL_EMOJIS[nivel]}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color }}>
                {NIVEL_LABELS[nivel]}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
                {result.detecciones?.length ?? 0} región(es) detectada(s)
              </div>
            </div>
          </div>

          {/* Imagen con segmentación */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>
              ZONAS DETECTADAS
            </div>
            <SegmentationOverlay
              imagenUrl={preview}
              mascaras={result.mascaras ?? []}
            />
          </div>

          {/* Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Área corroída', value: `${result.area_corroida_pct?.toFixed(1)}%`, color: 'var(--accent-orange)' },
              { label: 'Confianza promedio', value: `${((result.confianza_promedio ?? 0) * 100).toFixed(0)}%`, color: 'var(--accent-blue)' },
              { label: 'Detecciones', value: result.detecciones?.length ?? 0, color },
            ].map((m) => (
              <div key={m.label} style={{
                background: 'var(--bg-card)', borderRadius: 8, padding: '14px 16px',
                borderTop: `3px solid ${m.color}`,
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontFamily: 'var(--font-data)', fontSize: 22, fontWeight: 700, color: m.color }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setArchivo(null); setPreview(null); reset(); }}
            style={{
              marginTop: 20, width: '100%', padding: '12px 0',
              borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-secondary)',
              fontFamily: 'var(--font-ui)', cursor: 'pointer', fontSize: 14,
            }}
          >
            Analizar otra imagen
          </button>
        </div>
      )}
    </div>
  );
}
