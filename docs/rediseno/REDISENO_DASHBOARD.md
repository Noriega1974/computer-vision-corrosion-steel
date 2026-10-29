# Rediseño del dashboard web — PixelRust

Especificación visual para actualizar la página web. El objetivo es cambiar **solo la apariencia y la distribución**: la lógica, los datos, las llamadas a la API, la autenticación y los roles se mantienen igual.

El archivo `mockup_dashboard_referencia.html` es el mockup aprobado por el equipo. Úsalo como referencia visual (colores, tamaños, espaciados); no es código para copiar tal cual, porque está hecho en un formato de prototipo.

## 1. Tokens de diseño

| Token | Valor | Uso |
|---|---|---|
| Fondo de página | `#FBF7F1` | Fondo general |
| Superficie / tarjeta | `#FFFDF9` | Tarjetas y barra superior |
| Borde | `#EADFCF` | Bordes de 1 px de tarjetas y separadores |
| Texto principal | `#401711` | Títulos y valores |
| Texto secundario | `#6E4B3A` | Descripciones, etiquetas |
| Acento (botón principal) | `#B4561F` | Botón "Nueva medición", texto blanco |
| Acento vivo | `#EB651C` | Subrayado de la pestaña activa, detalles |
| Etiquetas de sección | `#8F4520` | Títulos en mayúsculas de cada tarjeta |
| Fondo resaltado | `#FBEADB` | Punto seleccionado, cabecera del detalle |
| Pista de barras | `#F4ECDF` | Fondo de barras de progreso / columnas |

**Escala de niveles de corrosión** (reemplaza verde/rojo puros):

| Nivel | Color | Fondo de etiqueta | Texto de etiqueta |
|---|---|---|---|
| Sin corrosión | `#6F7F55` | `#E5E7D6` | `#3D452D` |
| Leve | `#E3A24F` | `#F8E3C4` | `#7A4A12` |
| Moderada | `#D06E2A` | `#F6D5BC` | `#7A3510` |
| Severa | `#9C3A1A` | `#F0D2C7` | `#7A2A12` |
| Crítica | `#5A1A0D` | `#E6CFCA` | `#5A1A0D` |

**Tipografía** (Google Fonts):
- `Montserrat` (400, 500, 600, 700, 800) para toda la interfaz.
- `Fraunces` 700 solo para el logotipo "PIXELRUST".
- Etiquetas de sección: Montserrat 700, 11 px, mayúsculas, `letter-spacing: 0.16em`, color `#8F4520`.
- Título de página: Montserrat 800, 30 px.
- Valores de indicadores: Montserrat 800, 34 px, `font-variant-numeric: tabular-nums`.

**Forma**: tarjetas con `border-radius: 16px`, borde de 1 px `#EADFCF`, sin sombras fuertes. Botones con `border-radius: 12px` y alto mínimo de 44 px. Etiquetas de nivel en forma de píldora (`border-radius: 999px`) con un punto de color.

## 2. Estructura de la página

1. **Barra superior** (reemplaza la barra lateral): logo a la izquierda, navegación en pestañas de texto (Dashboard, Subir medición, Galería, Puntos, Usuarios, Configuración) con subrayado naranja de 3 px en la activa; a la derecha, botón de modo oscuro y avatar.
2. **Encabezado**: etiqueta "UNIVERSIDAD DEL NORTE · BARRANQUILLA" (la afiliación del usuario), título "Monitoreo de corrosión" y, a la derecha, el botón principal naranja **"+ Nueva medición"** (lleva a Subir medición).
3. **Fila superior en dos columnas** (reemplaza las 4 tarjetas de indicadores globales):
   - Izquierda, tarjeta **Indicadores**: Mediciones, Puntos activos, Última área corroída, Severas o críticas, en línea y separados por divisores verticales.
   - Derecha, tarjeta **Mediciones por nivel**: gráfica de columnas con los 5 niveles y sus colores de la escala. Reemplaza el gráfico de anillo.
4. **Fila central en tres columnas** (misma posición y contenido que hoy):
   - **Zonas y puntos**: botón "Centrar en mi zona" y lista de puntos; el seleccionado con fondo `#FBEADB` y borde `#D9A27A`.
   - **Mapa de ubicaciones**: el mapa Leaflet actual, con la leyenda de niveles como píldoras y los controles de zoom en blanco. Los marcadores usan los colores de la escala.
   - **Detalle de ubicación**: cabecera con fondo `#FBEADB` (nombre, ciudad, etiqueta de nivel), bloque de clima (temperatura, humedad, precipitación, viento), número de mediciones y última área corroída, e historial de mediciones. **Eliminar la gráfica "Tendencia — área corroída (%)".**
5. **Sección plegable "Análisis y métricas avanzadas (en desarrollo)"**: se mantiene, con el nuevo estilo. La gráfica de "Mediciones por ciudad" se elimina o queda dentro de esta sección.

## 3. Comportamiento

- En pantallas angostas, la fila superior pasa a una columna y la fila central se apila: zonas, mapa, detalle.
- Mantener el modo oscuro existente (adaptar los tokens si ya hay variables de tema).
- Mantener accesibilidad: botones reales, `aria-label` en los botones de solo ícono, contraste mínimo 4.5:1.
