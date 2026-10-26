import React from 'react';
import { Search, ClipboardList, MapPin, Camera, BarChart3, LayoutGrid, Sun, Focus, Eraser, PlayCircle } from 'lucide-react';
import NivelIcon from '../components/NivelIcon';
import { nivelColor, nivelBg } from '../lib/statusUtils';

// URL del video del proyecto. Mientras esté vacía se muestra el marcador de
// posición; al pegar aquí un enlace de inserción (por ejemplo
// https://www.youtube.com/embed/ID) la página renderiza el video sola.
const VIDEO_URL = '';

const PASOS = [
  { icon: MapPin, titulo: 'Elegir el punto', texto: 'Se escoge el punto de monitoreo donde está la lámina.' },
  { icon: Camera, titulo: 'Subir la foto', texto: 'Se toma o se selecciona la foto de la lámina y se envía.' },
  { icon: BarChart3, titulo: 'Ver el resultado', texto: 'La aplicación muestra el nivel de corrosión y el área corroída.' },
  { icon: LayoutGrid, titulo: 'Revisarla en la galería', texto: 'Todas las fotos quedan guardadas y se pueden consultar cuando haga falta.' },
];

const NIVELES_EXPLICACION = [
  { nivel: 0, nombre: 'Sin corrosión', texto: 'La lámina se ve sana, sin óxido apreciable.' },
  { nivel: 1, nombre: 'Leve', texto: 'Hay óxido en una parte pequeña de la superficie.' },
  { nivel: 2, nombre: 'Moderada', texto: 'El óxido cubre una parte importante de la superficie.' },
  { nivel: 3, nombre: 'Severa', texto: 'El óxido cubre una parte grande de la superficie y conviene actuar pronto.' },
];

const CONSEJOS = [
  { icon: Focus, texto: 'Lámina completa y de frente, sin ángulos inclinados.' },
  { icon: Sun, texto: 'Buena luz, sin reflejos ni sombras fuertes.' },
  { icon: Search, texto: 'Foto nítida, sin movimiento ni desenfoque.' },
  { icon: Eraser, texto: 'Sin objetos encima de la lámina.' },
];

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-sm)',
  padding: 18,
};

function Seccion({ titulo, subtitulo, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 style={{
          margin: 0, fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 20,
          color: 'var(--text-primary)', letterSpacing: '-0.01em',
        }}>
          {titulo}
        </h3>
        {subtitulo && (
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {subtitulo}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function IconoCaja({ icon: Icon }) {
  return (
    <span style={{
      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-inset)', border: '1px solid var(--border)',
      color: 'var(--text-primary)',
    }}>
      <Icon size={20} />
    </span>
  );
}

export default function QuePixelRustPage() {
  return (
    <div style={{
      maxWidth: 760, margin: '0 auto', padding: '24px 16px 64px',
      display: 'flex', flexDirection: 'column', gap: 28,
    }}>
      {/* 1. Qué es */}
      <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h2 style={{
            margin: 0, fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 26,
            color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.15,
          }}>
            ¿Qué es PixelRust?
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
            Medir la corrosión a partir de una foto
          </p>
        </div>
        <div style={{
          background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '16px', display: 'flex', gap: 14, alignItems: 'flex-start',
        }}>
          <IconoCaja icon={Search} />
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: 'var(--text-primary)' }}>
            PixelRust es una herramienta que mide la corrosión en láminas de acero galvanizado a partir
            de una foto. Un modelo de inteligencia artificial marca las zonas con óxido y calcula qué
            porcentaje de la superficie está afectada.
          </p>
        </div>
      </section>

      {/* 2. Para qué sirve */}
      <Seccion titulo="Para qué sirve">
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            { icon: ClipboardList, titulo: 'Seguimiento de láminas', texto: 'Permite vigilar láminas en ensayos o en campo.' },
            { icon: BarChart3, titulo: 'Comparar en el tiempo', texto: 'Se ve cómo avanza la corrosión de una misma lámina de una medición a otra.' },
            { icon: MapPin, titulo: 'Registro ordenado', texto: 'Cada foto queda guardada por empresa y por punto.' },
          ].map(({ icon, titulo, texto }) => (
            <div key={titulo} style={{ ...cardStyle, display: 'flex', gap: 14, alignItems: 'center' }}>
              <IconoCaja icon={icon} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{titulo}</div>
                <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>{texto}</div>
              </div>
            </div>
          ))}
        </div>
      </Seccion>

      {/* 3. Cómo se usa */}
      <Seccion titulo="Cómo se usa" subtitulo="Cuatro pasos, de la foto al resultado.">
        <div style={{ display: 'grid', gap: 12 }}>
          {PASOS.map(({ icon: Icon, titulo, texto }, i) => (
            <div key={titulo} style={{ ...cardStyle, display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--text-primary)', color: 'var(--bg-card-solid)',
                fontFamily: 'var(--font-data)', fontWeight: 800, fontSize: 18,
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{titulo}</div>
                <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>{texto}</div>
              </div>
              <Icon size={22} style={{ color: 'var(--text-faint)', flexShrink: 0 }} aria-hidden="true" />
            </div>
          ))}
        </div>
      </Seccion>

      {/* 4. Niveles */}
      <Seccion titulo="Niveles de corrosión" subtitulo="Se asignan según el porcentaje de superficie afectada.">
        <div style={{ display: 'grid', gap: 12 }}>
          {NIVELES_EXPLICACION.map(({ nivel, nombre, texto }) => {
            const color = nivelColor(nivel);
            return (
              <div key={nivel} style={{
                ...cardStyle, display: 'flex', gap: 14, alignItems: 'center',
                background: nivelBg(nivel), border: `1px solid ${color}45`,
              }}>
                <span style={{ color, display: 'inline-flex' }}><NivelIcon nivel={nivel} size={32} /></span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, color }}>{nombre}</div>
                  <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.5, marginTop: 2 }}>{texto}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Seccion>

      {/* 5. Consejos */}
      <Seccion titulo="Consejos para una buena foto" subtitulo="Una foto clara da un resultado más confiable.">
        <div style={{ ...cardStyle, display: 'grid', gap: 14 }}>
          {CONSEJOS.map(({ icon, texto }) => (
            <div key={texto} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <IconoCaja icon={icon} />
              <span style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--text-primary)' }}>{texto}</span>
            </div>
          ))}
        </div>
      </Seccion>

      {/* 6. Video del proyecto */}
      <Seccion titulo="Video del proyecto">
        <div style={{
          position: 'relative', width: '100%', aspectRatio: '16 / 9',
          borderRadius: 14, overflow: 'hidden',
          background: 'var(--bg-inset)', border: '1px solid var(--border)',
        }}>
          {VIDEO_URL ? (
            <iframe
              src={VIDEO_URL}
              title="Video del proyecto PixelRust"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          ) : (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', padding: 16,
            }}>
              <PlayCircle size={56} strokeWidth={1.5} style={{ color: 'var(--text-faint)' }} />
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-muted)' }}>
                Próximamente: video del proyecto
              </span>
            </div>
          )}
        </div>
      </Seccion>
    </div>
  );
}
