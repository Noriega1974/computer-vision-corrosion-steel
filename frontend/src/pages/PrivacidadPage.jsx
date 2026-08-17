import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Aviso de datos.
 *
 * El contenido sale de leer el codigo, no de una plantilla: cada campo listado
 * se persiste de verdad en `lambda_src/` y cada servicio externo se invoca de
 * verdad. No incluye plazos de conservacion, base legal ni responsable del
 * tratamiento porque eso no se puede deducir del repositorio; esos puntos
 * quedan marcados para que los complete quien corresponda.
 */

const SECCIONES = [
  {
    titulo: 'Datos de la cuenta',
    intro: 'Se guardan al crear un usuario y mientras la cuenta exista.',
    items: [
      ['Correo electrónico', 'identifica la cuenta e inicia sesión'],
      ['Nombre', 'se muestra en la interfaz y junto a cada medición'],
      ['Rol', 'determina qué secciones y acciones están disponibles'],
      ['Usuario temporal', 'solo en cuentas de colaborador, con fecha de vencimiento'],
    ],
  },
  {
    titulo: 'Datos de las mediciones',
    intro: 'Se registran cada vez que se sube una fotografía.',
    items: [
      ['Fotografía', 'se almacena para mostrar la medición y su análisis'],
      ['Fecha y hora', 'ordena el historial y calcula tendencias'],
      ['Nivel de corrosión y área afectada', 'los produce el modelo a partir de la foto'],
      ['Notas', 'texto libre que escribe quien registra la medición'],
      ['Autor de la medición', 'permite saber quién registró cada dato'],
    ],
  },
  {
    titulo: 'Datos de las ubicaciones',
    intro: 'Se registran al dar de alta una planta o punto de inspección.',
    items: [
      ['Sede, ciudad y departamento', 'agrupan y filtran las mediciones'],
      ['Latitud y longitud', 'ubican el punto en el mapa y consultan el clima'],
      ['Autor del registro', 'permite saber quién creó cada punto'],
    ],
  },
];

export default function PrivacidadPage() {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '40px 20px 64px',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
      }}
    >
      <div>
        <h2
          style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 640,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Qué datos guarda esta aplicación
        </h2>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            margin: '10px 0 0',
            lineHeight: 1.65,
          }}
        >
          Este inventario describe exactamente lo que el sistema almacena hoy.
          Cada campo se corresponde con un dato que existe en el código, no con
          una descripción general.
        </p>
      </div>

      {SECCIONES.map(seccion => (
        <section
          key={seccion.titulo}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
        >
          <h3
            style={{
              fontSize: 'var(--text-md)',
              fontWeight: 620,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {seccion.titulo}
          </h3>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-faint)',
              margin: 0,
            }}
          >
            {seccion.intro}
          </p>
          <dl style={{ margin: '6px 0 0', display: 'grid', gap: 'var(--space-2)' }}>
            {seccion.items.map(([campo, para]) => (
              <div key={campo} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <dt
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 560,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {campo}:
                </dt>
                <dd
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-muted)',
                    margin: 0,
                  }}
                >
                  {para}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h3
          style={{
            fontSize: 'var(--text-md)',
            fontWeight: 620,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Servicios de terceros
        </h3>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            margin: 0,
            lineHeight: 1.65,
          }}
        >
          La infraestructura corre sobre Amazon Web Services: las cuentas usan
          Amazon Cognito, las fotografías se almacenan en Amazon S3 y el resto
          de los datos en Amazon DynamoDB. Para mostrar el clima de cada punto
          se consultan sus coordenadas contra{' '}
          <span style={{ fontFamily: 'var(--font-data)' }}>api.open-meteo.com</span>.
          No se envía ningún dato personal a ese servicio, únicamente la
          latitud y la longitud del punto.
        </p>
      </section>

      <section
        style={{
          borderLeft: '2px solid var(--accent-orange)',
          paddingLeft: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <h3
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 620,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Pendiente de definir
        </h3>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            margin: 0,
            lineHeight: 1.65,
          }}
        >
          Este documento describe qué se guarda, no bajo qué condiciones. El
          responsable del tratamiento, el plazo de conservación, la base legal y
          el procedimiento para solicitar acceso o eliminación no se pueden
          deducir del sistema y deben definirse antes de usarlo con datos
          reales de terceros.
        </p>
      </section>

      <Link
        to="/dashboard"
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--accent-blue)',
          textDecoration: 'none',
          fontWeight: 550,
        }}
      >
        Volver al dashboard
      </Link>
    </div>
  );
}
