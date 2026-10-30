import React from 'react';
import NivelIcon from '../components/NivelIcon';
import { IconoReproducir } from '../components/Iconos';
import { NIVELES, nivelColor } from '../lib/statusUtils';

// Guía de la aplicación: qué es PixelRust, por qué existe, cómo se usa, cómo
// se lee el resultado, qué permite cada nivel de cuenta y qué tan preciso es
// el modelo. Página de lectura: una columna tranquila, títulos h2/h3 (el h1 lo
// pone PageHeader) y tablas semánticas. Los rangos de nivel salen de NIVELES
// (statusUtils), no se copian a mano.

// URL del video del proyecto. Mientras esté vacía se muestra el marcador de
// posición; al pegar aquí un enlace de inserción (por ejemplo
// https://www.youtube.com/embed/ID) la página renderiza el video sola.
const VIDEO_URL = '';

const SECCIONES = [
  { id: 'por-que', titulo: 'Por qué existe' },
  { id: 'como-funciona', titulo: 'Cómo funciona' },
  { id: 'guia', titulo: 'Guía rápida de uso' },
  { id: 'resultado', titulo: 'Cómo leer el resultado' },
  { id: 'cuentas', titulo: 'Niveles de cuenta' },
  { id: 'precision', titulo: 'Precisión del modelo' },
  { id: 'video', titulo: 'Video del proyecto' },
];

const DESCRIPCION_NIVEL = [
  'La lámina se ve sana; no hay corrosión apreciable.',
  'La corrosión ocupa una parte pequeña de la superficie.',
  'La corrosión cubre una parte importante de la superficie.',
  'La corrosión cubre una parte grande de la superficie; conviene programar una intervención.',
];

const ROLES = [
  {
    rol: 'Superadministrador',
    puede: [
      'Ver y administrar todas las afiliaciones, zonas, puntos y mediciones.',
      'Crear y editar zonas dibujándolas en el mapa (página Zonas).',
      'Crear cuentas de cualquier nivel, incluido otro superadministrador.',
      'Crear, editar, desactivar y eliminar puntos de cualquier zona.',
      'Registrar, mover, renombrar y eliminar mediciones.',
    ],
    noPuede: [
      'No tiene restricciones de alcance dentro de la aplicación.',
    ],
  },
  {
    rol: 'Administrador',
    puede: [
      'Ver los datos de su afiliación.',
      'Crear cuentas de técnico y de cliente, y colaboradores temporales.',
      'Ver la lista de usuarios de su afiliación, editarlos, desactivarlos o eliminarlos.',
      'Crear, editar, desactivar y eliminar puntos de su afiliación.',
      'Registrar, mover, renombrar y eliminar mediciones.',
    ],
    noPuede: [
      'Crear administradores ni superadministradores.',
      'Crear o editar zonas.',
      'Ver datos de otras afiliaciones.',
    ],
  },
  {
    rol: 'Técnico',
    puede: [
      'Ver los datos de su afiliación.',
      'Registrar mediciones con Nueva medición.',
      'Crear puntos en su afiliación.',
      'Mover y eliminar mediciones.',
      'Crear cuentas de cliente.',
    ],
    noPuede: [
      'Editar, desactivar o eliminar puntos.',
      'Renombrar fotos.',
      'Ver la lista de usuarios ni crear técnicos o administradores.',
      'Crear o editar zonas.',
    ],
  },
  {
    rol: 'Cliente',
    puede: [
      'Consultar el dashboard, la galería y la ficha de cada medición de su afiliación.',
      'Descargar las imágenes y ver cada punto en el mapa.',
      'Editar su propio perfil en Configuración.',
    ],
    noPuede: [
      'Registrar, mover ni eliminar mediciones.',
      'Entrar a Puntos o Usuarios, ni crear cuentas.',
    ],
  },
];

// Cifras del conjunto de prueba final (1.245 fotos), confirmadas por el
// equipo el 2026-10-26.
const METRICAS = [
  { nombre: 'IoU', yolo: '0,612', unet: '0,797' },
  { nombre: 'F1', yolo: '0,759', unet: '0,887' },
  { nombre: 'Nivel ISO asignado correctamente', yolo: '91,9 %', unet: '95,9 %' },
  { nombre: 'Fotos con corrosión en las que la detecta', yolo: '99,7 %', unet: '99,7 %' },
];

// ── Estilos ──────────────────────────────────────────────────────────────────

const MEDIDA = '68ch';

const parrafo = {
  margin: 0, maxWidth: MEDIDA, fontSize: 16, lineHeight: 1.65,
  color: 'var(--text-primary)', textWrap: 'pretty',
};

const parrafoSecundario = { ...parrafo, fontSize: 15, color: 'var(--text-secondary)' };

const lista = {
  margin: 0, paddingLeft: 22, maxWidth: MEDIDA, display: 'flex', flexDirection: 'column', gap: 8,
  fontSize: 16, lineHeight: 1.6, color: 'var(--text-primary)',
};

const h2Style = {
  margin: 0, fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 22,
  color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2, textWrap: 'balance',
};

const h3Style = {
  margin: '12px 0 0', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 17,
  color: 'var(--text-primary)', lineHeight: 1.3,
};

const marcoTabla = {
  overflowX: 'auto', background: 'var(--bg-card-solid)', border: '1px solid var(--border)',
  borderRadius: 12, boxShadow: 'var(--shadow-sm)',
};

const tabla = {
  width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-ui)', fontSize: 15,
  color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
};

const caption = {
  captionSide: 'top', textAlign: 'left', padding: '12px 14px 4px',
  fontSize: 13, color: 'var(--text-muted)', fontWeight: 600,
};

const th = {
  textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 13,
  color: 'var(--text-secondary)', background: 'var(--bg-inset)',
  borderBottom: '1px solid var(--border-strong)', verticalAlign: 'bottom',
};

const td = {
  padding: '12px 14px', borderTop: '1px solid var(--border)', verticalAlign: 'top', lineHeight: 1.5,
};

const listaCelda = {
  margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4,
};

// ── Piezas ───────────────────────────────────────────────────────────────────

function Seccion({ id, titulo, children }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, scrollMarginTop: 80 }}
    >
      <h2 id={`${id}-titulo`} style={h2Style}>{titulo}</h2>
      {children}
    </section>
  );
}

// Nombre de un control tal como aparece en pantalla.
function Ui({ children }) {
  return <strong style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{children}</strong>;
}

function TablaConMarco({ etiqueta, children }) {
  return (
    // Región enfocable: en pantallas angostas la tabla se desplaza en
    // horizontal y debe poder recorrerse con el teclado.
    <div role="region" aria-label={etiqueta} tabIndex={0} style={marcoTabla}>
      {children}
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function QuePixelRustPage() {
  return (
    <div style={{
      maxWidth: 820, margin: '0 auto', padding: '24px 16px 72px',
      display: 'flex', flexDirection: 'column', gap: 44,
    }}>
      {/* Presentación */}
      <section
        aria-label="Presentación"
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
          boxShadow: 'var(--shadow-sm)', padding: '22px 22px 20px',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        <p style={{ ...parrafo, fontSize: 18, lineHeight: 1.6 }}>
          PixelRust mide la corrosión de láminas de acero galvanizado, es decir, acero protegido con
          un recubrimiento de zinc, a partir de una fotografía. Un modelo de inteligencia artificial
          identifica, píxel por píxel, las zonas con corrosión, calcula qué porcentaje de la imagen
          ocupan y traduce ese porcentaje a un nivel de la norma ISO 10289. Cada medición queda
          guardada en su punto, con su fecha y el clima del lugar, para seguir la evolución de una
          misma lámina en el tiempo.
        </p>
        <p style={parrafoSecundario}>
          La aplicación se desarrolló como proyecto final del programa de Ingeniería Electrónica.
          Esta guía explica para qué sirve, cómo se usa y cómo interpretar sus resultados.
        </p>

        <nav aria-label="Contenido de la guía" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <h2 style={{ ...h2Style, fontSize: 15, color: 'var(--text-secondary)', marginBottom: 8 }}>
            En esta guía
          </h2>
          <ul style={{
            margin: 0, padding: 0, listStyle: 'none',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px 20px',
          }}>
            {SECCIONES.map(({ id, titulo }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  style={{
                    color: 'var(--accent-amber)', fontWeight: 600, fontSize: 15,
                    textUnderlineOffset: 3, textDecorationThickness: 1,
                  }}
                >
                  {titulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      {/* Por qué existe */}
      <Seccion id="por-que" titulo="Por qué existe">
        <p style={parrafo}>
          La corrosión del acero galvanizado avanza sin aviso y, sin un monitoreo constante,
          termina en reparaciones costosas o en fallas estructurales; se estima que sus pérdidas
          equivalen a cerca del 3 % del PIB mundial cada año. Hoy se detecta, casi siempre, por
          inspección visual: una persona recorre la estructura y juzga a ojo cuánto se ha
          deteriorado. Ese método es subjetivo, porque depende del criterio de cada inspector; es
          lento y exige desplazarse hasta el sitio. Los sensores electrónicos de monitoreo son
          precisos, pero su costo, su instalación, su alimentación y su mantenimiento los limitan
          a unos pocos puntos críticos.
        </p>
        <p style={parrafo}>
          PixelRust propone una alternativa con un dispositivo de uso cotidiano. Una foto tomada con
          el celular se convierte en una cifra objetiva, el porcentaje de área corroída, y en un
          nivel estandarizado. Como el mismo modelo califica todas las fotos con el mismo criterio,
          las mediciones de distintas fechas y de distintos puntos se pueden comparar entre sí.
        </p>
      </Seccion>

      {/* Cómo funciona */}
      <Seccion id="como-funciona" titulo="Cómo funciona">
        <p style={parrafoSecundario}>De la foto al registro, en cinco pasos.</p>
        <ol style={{ ...lista, gap: 14 }}>
          <li>
            <strong>Tomas o eliges la foto.</strong> Formato JPG o PNG, de hasta 50 MB.
          </li>
          <li>
            <strong>Eliges el punto.</strong> Cada medición se guarda en un punto que ya existe: una
            ubicación exacta, como una lámina o un sector de una estructura, que pertenece a una zona.
          </li>
          <li>
            <strong>La inteligencia artificial la analiza.</strong> La foto se sube a Amazon S3 y un
            servicio en la nube de AWS ejecuta el modelo, que marca los píxeles con corrosión. El
            proceso tarda unos segundos; la pantalla muestra el avance de la subida y un contador
            mientras se analiza.
          </li>
          <li>
            <strong>Recibes el resultado.</strong> El porcentaje de área corroída y el nivel
            correspondiente de la norma ISO 10289.
          </li>
          <li>
            <strong>Queda registrada.</strong> La medición aparece en la galería, dentro de su punto,
            y alimenta los indicadores, el mapa y las gráficas del dashboard. Junto con ella se guarda
            el clima del lugar en la fecha de la captura: temperatura, humedad, precipitación y viento.
          </li>
        </ol>
        <p style={parrafoSecundario}>
          La aplicación web se publica en Vercel; las fotos, los resultados y el análisis viven en AWS.
        </p>
      </Seccion>

      {/* Guía rápida */}
      <Seccion id="guia" titulo="Guía rápida de uso">
        <h3 style={h3Style}>Registrar una medición</h3>
        <ol style={lista}>
          <li>
            Pulsa <Ui>Nueva medición</Ui> en el menú lateral. El mismo botón está en el dashboard y,
            como botón flotante, en la galería.
          </li>
          <li>
            En <Ui>1. Imagen</Ui>, arrastra la foto al recuadro o haz clic en él para elegirla.
            Puedes darle un nombre, que es opcional. También puedes elegir varias imágenes a la vez
            (hasta 20 por tanda); ver más abajo.
          </li>
          <li>
            En <Ui>2. Punto de medición</Ui>, escribe en <Ui>Buscar punto</Ui> y elige el punto.
          </li>
          <li>
            En <Ui>3. Fecha de la medición</Ui>, responde <Ui>¿Es una medición tomada en el pasado?</Ui>.
            Si eliges <Ui>Sí</Ui>, indica la fecha real de la captura.
          </li>
          <li>
            En <Ui>4. Detalles (opcional)</Ui> puedes agregar notas.
          </li>
          <li>
            Pulsa <Ui>Analizar imagen</Ui>.
          </li>
        </ol>

        <h3 style={h3Style}>Subir varias imágenes a la vez</h3>
        <p style={parrafo}>
          Si eliges dos o más imágenes, el recuadro se reemplaza por una lista donde puedes
          renombrar cada foto o quitarla, y <Ui>Agregar más imágenes</Ui> hasta completar 20. El punto,
          la fecha y las notas son comunes a toda la tanda. El botón pasa a decir{' '}
          <Ui>Analizar N imágenes</Ui> (N es el número de imágenes en la lista). Las fotos se analizan
          una tras otra; si alguna falla, las demás continúan y puedes usar <Ui>Reintentar</Ui> en la
          fila afectada. Al terminar, el resumen ofrece <Ui>Subir más imágenes</Ui> o{' '}
          <Ui>Ver en la galería</Ui>.
        </p>

        <h3 style={h3Style}>Ver el resultado</h3>
        <p style={parrafo}>
          Al terminar aparece una tarjeta con el <Ui>Tipo de corrosión</Ui>, el porcentaje grande
          rotulado <Ui>Área corroída</Ui> y la foto analizada. Desde ahí puedes pulsar{' '}
          <Ui>Subir otra imagen</Ui> o <Ui>Ver en galería</Ui>, que abre directamente la carpeta del
          punto. Junto al nivel hay un botón <Ui>i</Ui>: al pulsarlo se despliega la tabla de niveles
          de la norma ISO 10289 con el nivel de esa foto resaltado. El mismo botón acompaña al nivel en
          toda la aplicación.
        </p>

        <h3 style={h3Style}>La galería: zona, punto y fotos</h3>
        <p style={parrafo}>
          La <Ui>Galería</Ui> se organiza como carpetas en tres niveles: zona, punto y fotos. Una zona
          es un área geográfica dibujada en el mapa que agrupa varios puntos. Si tu cuenta tiene acceso
          a una sola zona, la galería abre directamente en sus puntos; el superadministrador ve primero
          las zonas. Cada punto es una carpeta que se abre con <Ui>Abrir</Ui>.
        </p>
        <p style={parrafo}>
          Dentro de un punto puedes buscar fotos por nombre o notas, ordenarlas con <Ui>Orden</Ui>{' '}
          (más recientes, más antiguas, mayor o menor corrosión), filtrarlas por <Ui>Nivel</Ui> y
          acotarlas por fechas con <Ui>Desde</Ui> y <Ui>Hasta</Ui>. Al pulsar una foto se abre su
          ficha, con las pestañas <Ui>Original</Ui> y <Ui>Segmentación</Ui>, el botón{' '}
          <Ui>Descargar</Ui> y el botón <Ui>Ver en mapa</Ui>, que lleva al dashboard con ese punto
          seleccionado.
        </p>

        <h3 style={h3Style}>Mover o eliminar fotos</h3>
        <ol style={lista}>
          <li>Dentro de un punto, pulsa <Ui>Seleccionar</Ui> y marca las fotos, o pulsa <Ui>Seleccionar las N visibles</Ui> (N es el número de fotos que se ven con los filtros actuales) para marcarlas todas de una vez.</li>
          <li>
            Para cambiarlas de punto, pulsa <Ui>Mover a…</Ui>, elige el <Ui>Punto destino</Ui> y
            confirma con <Ui>Mover</Ui>. El superadministrador elige además la zona.
          </li>
          <li>
            Para borrarlas, pulsa <Ui>Eliminar</Ui> y confirma. Se eliminan la foto y su análisis.
          </li>
          <li>Con <Ui>Cancelar</Ui> sales del modo de selección sin cambios.</li>
        </ol>
        <p style={parrafoSecundario}>
          Cada operación admite hasta 100 fotos. Una medición suelta también se elimina desde su ficha,
          con <Ui>Eliminar medición</Ui>. Mover y eliminar están disponibles para superadministrador,
          administrador y técnico.
        </p>

        <h3 style={h3Style}>El dashboard</h3>
        <p style={parrafo}>
          El <Ui>Dashboard</Ui> resume el estado de tus puntos. Arriba muestra cuatro indicadores:{' '}
          <Ui>Puntos medidos</Ui>, <Ui>Mediciones</Ui>, <Ui>En estado severo</Ui> y{' '}
          <Ui>Sin corrosión</Ui>. Debajo están la lista desplegable de zonas y puntos, el mapa de
          Colombia, con cada punto coloreado según el nivel de su última medición, y el detalle del punto
          elegido, con el clima de su última captura. Al final, dos gráficas: la distribución de
          mediciones por nivel de corrosión y la cantidad de mediciones por ciudad.
        </p>
      </Seccion>

      {/* Cómo leer el resultado */}
      <Seccion id="resultado" titulo="Cómo leer el resultado">
        <p style={parrafo}>
          El <strong>área corroída</strong> es el porcentaje de la superficie de la placa que el modelo
          marcó como corrosión. La aplicación reconoce la placa metálica de forma automática y
          calcula el porcentaje sobre ella; si no logra reconocerla, lo calcula sobre la foto
          completa y lo indica en el resultado. Con ese porcentaje se asigna el nivel, según la norma ISO 10289, que
          califica piezas con recubrimientos metálicos, como el zinc del galvanizado, por la fracción
          de superficie afectada.
        </p>

        <TablaConMarco etiqueta="Niveles de corrosión según ISO 10289">
          <table style={tabla}>
            <caption style={caption}>Niveles de corrosión según ISO 10289</caption>
            <thead>
              <tr>
                <th scope="col" style={th}>Nivel</th>
                <th scope="col" style={th}>Área corroída</th>
                <th scope="col" style={th}>Qué indica</th>
              </tr>
            </thead>
            <tbody>
              {NIVELES.map((n, i) => (
                <tr key={n.status}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <NivelIcon nivel={i} size={22} color={nivelColor(i)} />
                      {n.label}
                    </span>
                  </th>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{n.range}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{DESCRIPCION_NIVEL[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaConMarco>

        <h3 style={h3Style}>Alcance del resultado</h3>
        <ul style={lista}>
          <li>
            El porcentaje se calcula sobre la placa cuando la aplicación la reconoce. Si no la reconoce,
            se calcula sobre la foto completa y entonces depende del encuadre y de la distancia de
            captura. En ambos casos es una estimación relativa, no una medida del área física.
          </li>
          <li>
            El modelo se entrenó solo con acero galvanizado; en otros materiales su resultado no está
            validado.
          </li>
          <li>
            La sal depositada, las sombras y los reflejos del galvanizado pueden parecerse a la
            corrosión, sobre todo cuando las manchas de óxido todavía son pequeñas y pálidas.
          </li>
          <li>
            El resultado apoya la decisión de mantenimiento, pero no reemplaza el criterio de un
            especialista.
          </li>
        </ul>

        <h3 style={h3Style}>Consejos para una buena foto</h3>
        <ul style={lista}>
          <li>Lámina completa, de frente y ocupando la mayor parte de la imagen.</li>
          <li>Buena luz, sin reflejos ni sombras fuertes.</li>
          <li>Foto nítida, sin movimiento ni desenfoque.</li>
          <li>Sin objetos encima de la lámina.</li>
        </ul>
      </Seccion>

      {/* Niveles de cuenta */}
      <Seccion id="cuentas" titulo="Niveles de cuenta">
        <p style={parrafo}>
          Cada cuenta pertenece a una afiliación, la organización a la que pertenece el usuario. Salvo
          el superadministrador, cada persona solo ve las zonas, los puntos y las mediciones de su
          afiliación. Todas las cuentas pueden editar su perfil en <Ui>Configuración</Ui>.
        </p>

        <TablaConMarco etiqueta="Permisos por nivel de cuenta">
          <table style={tabla}>
            <caption style={caption}>Qué permite cada nivel de cuenta</caption>
            <thead>
              <tr>
                <th scope="col" style={{ ...th, width: '22%' }}>Nivel</th>
                <th scope="col" style={th}>Puede</th>
                <th scope="col" style={th}>No puede</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map(({ rol, puede, noPuede }) => (
                <tr key={rol}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{rol}</th>
                  <td style={td}>
                    <ul style={listaCelda}>
                      {puede.map(t => <li key={t}>{t}</li>)}
                    </ul>
                  </td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>
                    <ul style={listaCelda}>
                      {noPuede.map(t => <li key={t}>{t}</li>)}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaConMarco>
        <p style={parrafoSecundario}>
          Un punto solo se puede eliminar cuando no tiene mediciones; si las tiene, primero hay que
          moverlas o eliminarlas.
        </p>
      </Seccion>

      {/* Precisión */}
      <Seccion id="precision" titulo="Precisión del modelo">
        <p style={parrafo}>
          El modelo que analiza las fotos hoy es una red <strong>U-Net</strong>, diseñada
          específicamente para segmentar imágenes. Marca como corrosión cada píxel cuya salida del
          modelo supera el umbral de 0,5. Se comparó con <strong>YOLOv8n-seg</strong>, una red de
          segmentación más liviana, y la U-Net obtuvo mejores resultados.
        </p>
        <p style={parrafo}>
          Ambos modelos se calificaron con el mismo examen: 1.245 fotos que no vieron durante el
          entrenamiento, comparando píxel por píxel la máscara del modelo con la máscara marcada por
          una persona.
        </p>

        <TablaConMarco etiqueta="Resultados de los modelos en el conjunto de prueba">
          <table style={tabla}>
            <caption style={caption}>Resultados en el conjunto de prueba (1.245 fotos)</caption>
            <thead>
              <tr>
                <th scope="col" style={th}>Métrica</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>YOLOv8n-seg (alternativa comparada)</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>U-Net (en uso)</th>
              </tr>
            </thead>
            <tbody>
              {METRICAS.map(({ nombre, yolo, unet }) => (
                <tr key={nombre}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{nombre}</th>
                  <td style={{ ...td, textAlign: 'right' }}>{yolo}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{unet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaConMarco>

        <ul style={lista}>
          <li>
            <strong>IoU</strong> (intersección sobre unión): divide la zona en la que coinciden la
            máscara del modelo y la real entre toda la zona que abarcan las dos juntas; vale 1 si
            coinciden por completo y 0 si no se tocan.
          </li>
          <li>
            <strong>F1</strong>: combina la precisión, qué parte de lo marcado es corrosión de verdad,
            y la sensibilidad, qué parte de la corrosión real se encontró.
          </li>
          <li>
            <strong>Nivel asignado correctamente</strong>: proporción de fotos en las que el nivel
            ISO 10289 calculado coincide con el de la máscara de referencia.
          </li>
        </ul>
        <p style={parrafoSecundario}>
          En la práctica, los dos modelos casi nunca pasan por alto una lámina corroída; la diferencia
          está en qué tan bien delimitan la mancha, y eso se refleja en el porcentaje de área.
        </p>
      </Seccion>

      {/* Video */}
      <Seccion id="video" titulo="Video del proyecto">
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
              <IconoReproducir size={48} style={{ color: 'var(--text-faint)' }} />
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
