import ErrorEstado from '../components/ErrorEstado';
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams, Link } from 'react-router-dom';
import { IconoBuscar, IconoCerrar, IconoSinImagen, IconoSubir } from '../components/Iconos';
import { useMediciones } from '../hooks/useMediciones';
import { useMedicionesPunto } from '../hooks/useMedicionesPunto';
import { useBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth } from '../auth/AuthContext';
import { normalizar } from '../lib/textUtils';
import { formatFecha } from '../utils/dateFormat';
import {
  SIN_ASIGNAR, claveEmpresa, clavePunto, carpetasDeEmpresas, carpetasDePuntos, iniciales,
} from '../lib/galeriaCarpetas';
import GaleriaBreadcrumb from '../components/GaleriaBreadcrumb';
import GaleriaCarpetas from '../components/GaleriaCarpetas';
import GaleriaFotos from '../components/GaleriaFotos';
import Skeleton, { SkeletonLinea, SkeletonCaja } from '../components/Skeleton';
import { CARD_TITULO_STYLE, CARD_SUBTITULO_STYLE, CARD_PILDORA_STYLE } from '../components/cardTextStyles';
import { useConteoRecordado } from '../hooks/useConteoRecordado';

// El resumen de carpetas y la búsqueda usan las 1000 mediciones más recientes
// (máximo del backend, sin máscaras ni detecciones). Las fotos de un punto se
// piden aparte a /mediciones/{id_punto} para no quedar truncadas.
const LIMITE_MEDICIONES = 1000;

// Rejilla de tarjetas fantasma con la misma geometria y tipografia que
// CarpetaCard / MedicionCard: cada barra de texto va dentro de un elemento con
// el estilo del texto real, asi el alto de linea es el mismo y nada se estira.
// `conNivel`: las tarjetas de punto llevan fila de nivel (las de zona, no).
function GaleriaSkeleton({ cantidad, fotos = false, conNivel = false }) {
  const filaNivel = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
      fontSize: 13, fontWeight: 600, flexWrap: 'wrap', lineHeight: fotos ? undefined : 1.25,
    }}>
      <Skeleton width={20} height={20} radius="50%" />
      <span><SkeletonLinea width={70} /></span>
    </div>
  );
  return (
    <div
      aria-busy="true"
      style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 'var(--space-4)',
      }}
    >
      {Array.from({ length: cantidad }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div>
            <div style={CARD_TITULO_STYLE}><SkeletonLinea width="65%" /></div>
            <div style={CARD_SUBTITULO_STYLE}><SkeletonLinea width="40%" /></div>
          </div>
          <Skeleton height={fotos ? 164 : 140} radius={10} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 2 }}>
            {fotos ? (
              <div>
                <div style={{
                  fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 18,
                  lineHeight: 1.05, letterSpacing: '-0.02em',
                }}>
                  <SkeletonLinea width={48} />
                </div>
                {filaNivel}
              </div>
            ) : (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
                  <SkeletonLinea width={60} />
                </div>
                {conNivel && filaNivel}
              </div>
            )}
            <SkeletonCaja width={fotos ? 56 : 30} style={CARD_PILDORA_STYLE} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EstadoVacio({ icono: Icono, titulo, texto, children }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 'var(--space-4)', padding: '60px 20px',
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: 14,
        background: 'var(--bg-inset)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icono size={26} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>
          {titulo}
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: children ? 'var(--space-4)' : 0 }}>
          {texto}
        </div>
        {children}
      </div>
    </div>
  );
}

const botonAmbarStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '10px 18px', background: 'var(--accent-amber)',
  border: 'none', borderRadius: 8, cursor: 'pointer', textDecoration: 'none',
  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'white',
};

// ─── Página Galería ───────────────────────────────────────────────────────────
// Tres niveles con ruta propia (el botón Atrás del navegador funciona):
//   /galeria                              empresas (super_admin con varias) o puntos
//   /galeria/zona/:empresaId              puntos de una empresa
//   /galeria/zona/:empresaId/:bloqueId    fotos de un punto
// Con una búsqueda activa (?q=) se muestran, en cualquier nivel, todas las
// fotos que coinciden. (/galeria/:idMedicion sigue siendo la ficha de una medición.)
export default function GaleriaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { empresaId, bloqueId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const { mediciones, loading, error, refetch } = useMediciones(LIMITE_MEDICIONES, { resumen: true });
  // Las fotos sin punto ("_sin") no tienen id que consultar: salen del resumen.
  const idPuntoApi = bloqueId && bloqueId !== SIN_ASIGNAR ? bloqueId : null;
  const { mediciones: medicionesPunto, loading: cargandoPunto, error: errorPunto, refetch: refetchPunto } =
    useMedicionesPunto(idPuntoApi, { completo: true });
  const { bloques } = useBloques(true);
  const { user } = useAuth();
  const esSuperAdmin = user?.groups?.includes('super_admin');
  // /upload es solo para super_admin, admin y tecnico (RoleRoute): el cliente no ve el acceso.
  const puedeSubir = ['super_admin', 'admin', 'tecnico'].some(r => user?.groups?.includes(r));
  const { empresas } = useEmpresas(esSuperAdmin);
  const { perfil } = useUsuarioPerfil();

  // ─── Búsqueda ─────────────────────────────────────────────────────────────
  // Vive en la URL (?q=) para que Atrás desde una ficha conserve los resultados.
  const q = searchParams.get('q') ?? '';
  const [texto, setTexto] = useState(q);
  useEffect(() => { setTexto(q); }, [q]);
  useEffect(() => {
    if (texto === q) return undefined;
    const t = setTimeout(() => setSearchParams(texto ? { q: texto } : {}, { replace: true }), 350);
    return () => clearTimeout(t);
  }, [texto, q, setSearchParams]);
  const consulta = normalizar(q);

  // ─── Nombres ──────────────────────────────────────────────────────────────
  // La medición solo trae empresa_id: super_admin resuelve contra la lista de
  // empresas; el resto solo ve su propia empresa (la del perfil).
  const nombreEmpresa = (id) => {
    if (id === SIN_ASIGNAR) return 'Sin zona';
    const nombre = esSuperAdmin
      ? empresas.find(e => e.id_empresa === id)?.nombre
      : perfil?.empresa_nombre;
    return nombre ?? 'Zona';
  };
  // Logo de la empresa (URL prefirmada de corta vigencia): super_admin lo toma de
  // la lista de empresas; el resto, de su propia afiliación en el perfil.
  const logoEmpresa = (id) => {
    if (id === SIN_ASIGNAR) return null;
    return (esSuperAdmin
      ? empresas.find(e => e.id_empresa === id)?.logo_url
      : (perfil?.empresa_id === id ? perfil?.empresa_logo_url : null)) ?? null;
  };
  const ciudadDe = (id) => bloques.find(b => b.id_bloque === id)?.ciudad ?? null;
  const portadaPunto = (id) => bloques.find(b => b.id_bloque === id)?.portada_url ?? null;
  const nombrePunto = (m) => m.bloque_nombre ?? 'Sin punto asignado';

  // ─── Carpetas ─────────────────────────────────────────────────────────────
  const carpetasEmpresa = carpetasDeEmpresas(mediciones);
  // Solo un super_admin con datos de varias empresas necesita ese nivel.
  const variasEmpresas = esSuperAdmin && carpetasEmpresa.length > 1;
  const empresaActual = empresaId ?? carpetasEmpresa[0]?.id;
  const deEmpresa = mediciones.filter(m => claveEmpresa(m) === empresaActual);
  const carpetasPunto = carpetasDePuntos(deEmpresa);
  const fotosDelPunto = idPuntoApi ? medicionesPunto
    : bloqueId ? deEmpresa.filter(m => clavePunto(m) === bloqueId) : [];

  const nivelVista = consulta ? 'busqueda'
    : bloqueId ? 'fotos'
    : (empresaId || !variasEmpresas) ? 'puntos'
    : 'empresas';

  const volverA = `${location.pathname}${location.search}`;
  const rutaEmpresa = `/galeria/zona/${empresaActual}`;
  const tituloPunto = fotosDelPunto[0] ? nombrePunto(fotosDelPunto[0]) : 'Punto';

  // Migas: la empresa solo aparece si existe ese nivel para este usuario.
  const tramos = [{ label: 'Galería', to: '/galeria' }];
  if (nivelVista === 'busqueda') {
    tramos.push({ label: 'Resultados de la búsqueda' });
  } else {
    if (variasEmpresas && nivelVista !== 'empresas') tramos.push({ label: nombreEmpresa(empresaActual), to: rutaEmpresa });
    if (nivelVista === 'fotos') tramos.push({ label: tituloPunto });
  }

  const resultados = nivelVista === 'busqueda'
    ? mediciones.filter(m => normalizar(`${m.nombre ?? ''} ${m.notas ?? ''}`).includes(consulta))
    : [];

  let titulo = 'Galería de mediciones';
  let subtitulo = '';
  if (nivelVista === 'busqueda') {
    titulo = 'Resultados de la búsqueda';
    subtitulo = `${resultados.length} ${resultados.length === 1 ? 'foto' : 'fotos'}`;
  } else if (nivelVista === 'empresas') {
    subtitulo = `${carpetasEmpresa.length} ${carpetasEmpresa.length === 1 ? 'zona' : 'zonas'}`;
  } else if (nivelVista === 'puntos') {
    if (variasEmpresas) titulo = nombreEmpresa(empresaActual);
    subtitulo = `${carpetasPunto.length} ${carpetasPunto.length === 1 ? 'punto' : 'puntos'} · ${deEmpresa.length} ${deEmpresa.length === 1 ? 'foto' : 'fotos'}`;
  } else {
    titulo = tituloPunto;
    subtitulo = ciudadDe(bloqueId) ?? '';
  }

  const [toolbarRight, setToolbarRight] = useState(null);
  const [seleccionando, setSeleccionando] = useState(false);

  // ─── Contenido ────────────────────────────────────────────────────────────
  const itemsEmpresa = carpetasEmpresa.map(c => ({
    key: c.id,
    to: `/galeria/zona/${c.id}`,
    titulo: nombreEmpresa(c.id),
    subtitulo: `${c.puntos} ${c.puntos === 1 ? 'punto' : 'puntos'} · ${c.fotos} fotos`,
    logo: logoEmpresa(c.id),
    iniciales: iniciales(nombreEmpresa(c.id)),
    detalle: `Última medición ${formatFecha(c.ultima.timestamp)}`,
  }));
  const itemsPunto = carpetasPunto.map(c => {
    const tituloCarpeta = nombrePunto(c.ultima);
    return {
      key: c.id,
      to: `/galeria/zona/${empresaActual}/${c.id}`,
      titulo: tituloCarpeta,
      subtitulo: ciudadDe(c.id) ?? 'Sin ciudad',
      portada: portadaPunto(c.id),
      iniciales: iniciales(tituloCarpeta),
      detalle: `${c.fotos} ${c.fotos === 1 ? 'foto' : 'fotos'}`,
      nivel: c.ultima.nivel_corrosion ?? 0,
    };
  });

  // En la página de un punto manda la carga de ese punto, no la del resumen.
  const enPunto = nivelVista === 'fotos' && idPuntoApi;
  const cargando = enPunto ? cargandoPunto && medicionesPunto.length === 0 : loading && mediciones.length === 0;
  const fallo = enPunto ? errorPunto : error;
  const sinDatos = enPunto ? medicionesPunto.length === 0 : mediciones.length === 0;

  // Cuantas tarjetas fantasma: lo que tenia esta misma vista la ultima vez.
  const itemsConteo = nivelVista === 'busqueda' ? resultados
    : nivelVista === 'fotos' ? fotosDelPunto
    : nivelVista === 'empresas' ? itemsEmpresa : itemsPunto;
  const claveConteo = consulta ? 'galeria:busqueda'
    : bloqueId ? `galeria:fotos:${bloqueId}`
    : `galeria:${empresaId ?? 'raiz'}`;
  const cantidadSkeleton = useConteoRecordado(claveConteo, itemsConteo, cargando);

  let contenido;
  if (cargando) {
    contenido = <GaleriaSkeleton
      cantidad={cantidadSkeleton}
      fotos={!!bloqueId && !consulta}
      conNivel={!!empresaId || !esSuperAdmin}
    />;
  } else if (fallo && sinDatos) {
    contenido = <ErrorEstado titulo="No se pudieron cargar las mediciones." detalle={fallo} onRetry={enPunto ? refetchPunto : refetch} />;
  } else if (!enPunto && mediciones.length === 0) {
    contenido = (
      <EstadoVacio
        icono={IconoSinImagen} titulo="Sin mediciones todavía"
        texto={puedeSubir ? 'Sube tu primera imagen para comenzar el monitoreo de corrosión.' : 'Aún no hay mediciones registradas en tu afiliación.'}
      >
        {puedeSubir && (
          <button onClick={() => navigate('/upload')} style={botonAmbarStyle}>
            <IconoSubir size={15} aria-hidden="true" />
            Subir primera medición
          </button>
        )}
      </EstadoVacio>
    );
  } else if (nivelVista === 'busqueda') {
    contenido = resultados.length === 0 ? (
      <EstadoVacio icono={IconoBuscar} titulo="Sin resultados" texto="Ninguna foto coincide con la búsqueda por nombre o notas." />
    ) : (
      <GaleriaFotos
        mediciones={resultados}
        volverA={volverA}
        contexto={m => (variasEmpresas ? `${nombreEmpresa(claveEmpresa(m))} · ` : '') + nombrePunto(m)}
        toolbarTarget={toolbarRight}
        onSeleccionChange={setSeleccionando}
      />
    );
  } else if (nivelVista === 'empresas') {
    contenido = <GaleriaCarpetas items={itemsEmpresa} />;
  } else if (nivelVista === 'puntos') {
    contenido = itemsPunto.length === 0 ? (
      <EstadoVacio icono={IconoSinImagen} titulo="Esta carpeta no tiene fotos" texto="No hay mediciones en esta zona.">
        <Link to="/galeria" style={botonAmbarStyle}>Volver a la galería</Link>
      </EstadoVacio>
    ) : <GaleriaCarpetas items={itemsPunto} />;
  } else {
    contenido = fotosDelPunto.length === 0 ? (
      <EstadoVacio icono={IconoSinImagen} titulo="Este punto no tiene fotos" texto="La carpeta no existe o no tiene mediciones cargadas.">
        <Link to={variasEmpresas ? rutaEmpresa : '/galeria'} style={botonAmbarStyle}>Volver</Link>
      </EstadoVacio>
    ) : (
      <GaleriaFotos
        mediciones={fotosDelPunto}
        volverA={volverA}
        puntoActual={idPuntoApi}
        toolbarTarget={toolbarRight}
        onSeleccionChange={setSeleccionando}
      />
    );
  }

  return (
    <div style={{ padding: '12px 20px 80px' }}>
      <GaleriaBreadcrumb tramos={tramos} />

      {/* ── Título + subtítulo compacto en una sola línea ── */}
      <div style={{
        display: 'flex', alignItems: 'baseline', flexWrap: 'wrap',
        columnGap: 10, rowGap: 2, marginBottom: 8,
      }}>
        <h2 style={{
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-lg)',
          color: 'var(--text-primary)', margin: 0, lineHeight: 1.2,
        }}>
          {titulo}
        </h2>
        {!cargando && subtitulo && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', lineHeight: 1.2 }}>
            {subtitulo}
          </span>
        )}
      </div>

      {/* ── Barra única: buscador a la izquierda + conteo/orden/seleccionar a la derecha ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8, marginBottom: 10,
      }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <IconoBuscar
            size={13}
            aria-hidden="true"
            style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-faint)', pointerEvents: 'none',
            }}
          />
          <input
            id="filtro-notas"
            name="buscar-nombre-notas"
            type="search"
            spellCheck={false}
            aria-label="Buscar fotos por nombre o notas"
            placeholder="Buscar por nombre o notas…"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            style={{
              width: '100%', height: 32, boxSizing: 'border-box',
              padding: '0 28px 0 30px', background: 'var(--bg-card-solid)',
              border: '1px solid var(--border-strong)', borderRadius: 7,
              fontSize: 'var(--text-xs)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)', outline: 'none',
            }}
          />
          {texto && (
            <button
              type="button"
              onClick={() => setTexto('')}
              title="Borrar búsqueda"
              aria-label="Borrar búsqueda"
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                display: 'flex', color: 'var(--text-faint)',
              }}
            >
              <IconoCerrar size={12} />
            </button>
          )}
        </div>
        <div ref={setToolbarRight} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginLeft: 'auto' }} />
      </div>

      {contenido}

      {puedeSubir && !seleccionando && (
        <button
          type="button"
          onClick={() => navigate('/upload')}
          className="galeria-fab"
          aria-label="Nueva medición"
          title="Nueva medición"
        >
          <IconoSubir size={16} aria-hidden="true" />
          <span className="galeria-fab-label">Nueva medición</span>
        </button>
      )}
    </div>
  );
}
