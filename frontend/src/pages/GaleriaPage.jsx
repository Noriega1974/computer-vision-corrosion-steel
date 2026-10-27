import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams, Link } from 'react-router-dom';
import { Upload, AlertCircle, Search, X, ImageOff } from 'lucide-react';
import { useMediciones } from '../hooks/useMediciones';
import { useMedicionesPunto } from '../hooks/useMedicionesPunto';
import { useBloques } from '../hooks/useBloques';
import { useEmpresas } from '../hooks/useEmpresas';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth } from '../auth/AuthContext';
import { normalizar } from '../lib/textUtils';
import { formatFecha } from '../utils/dateFormat';
import {
  SIN_ASIGNAR, claveEmpresa, clavePunto, carpetasDeEmpresas, carpetasDePuntos,
} from '../lib/galeriaCarpetas';
import GaleriaBreadcrumb from '../components/GaleriaBreadcrumb';
import GaleriaCarpetas from '../components/GaleriaCarpetas';
import GaleriaFotos from '../components/GaleriaFotos';

// El resumen de carpetas y la búsqueda usan las 1000 mediciones más recientes
// (máximo del backend, sin máscaras ni detecciones). Las fotos de un punto se
// piden aparte a /mediciones/{id_punto} para no quedar truncadas.
const LIMITE_MEDICIONES = 1000;

const portadaDe = (m) => m?.url_thumbnail || m?.url_imagen || null;

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
        <Icono size={26} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
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

  const { mediciones, loading, error } = useMediciones(LIMITE_MEDICIONES, { resumen: true });
  // Las fotos sin punto ("_sin") no tienen id que consultar: salen del resumen.
  const idPuntoApi = bloqueId && bloqueId !== SIN_ASIGNAR ? bloqueId : null;
  const { mediciones: medicionesPunto, loading: cargandoPunto, error: errorPunto } =
    useMedicionesPunto(idPuntoApi, { completo: true });
  const { bloques } = useBloques(true);
  const { user } = useAuth();
  const esSuperAdmin = user?.groups?.includes('super_admin');
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
    if (id === SIN_ASIGNAR) return 'Sin afiliación';
    const nombre = esSuperAdmin
      ? empresas.find(e => e.id_empresa === id)?.nombre
      : perfil?.empresa_nombre;
    return nombre ?? 'Afiliación';
  };
  const ciudadDe = (id) => bloques.find(b => b.id_bloque === id)?.ciudad ?? null;
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
    subtitulo = `${carpetasEmpresa.length} afiliaciones`;
  } else if (nivelVista === 'puntos') {
    if (variasEmpresas) titulo = nombreEmpresa(empresaActual);
    subtitulo = `${carpetasPunto.length} ${carpetasPunto.length === 1 ? 'punto' : 'puntos'} · ${deEmpresa.length} fotos`;
  } else {
    titulo = tituloPunto;
    subtitulo = ciudadDe(bloqueId) ?? '';
  }

  // ─── Contenido ────────────────────────────────────────────────────────────
  const itemsEmpresa = carpetasEmpresa.map(c => ({
    key: c.id,
    to: `/galeria/zona/${c.id}`,
    titulo: nombreEmpresa(c.id),
    subtitulo: `${c.puntos} ${c.puntos === 1 ? 'punto' : 'puntos'} · ${c.fotos} fotos`,
    portada: portadaDe(c.ultima),
    detalle: `Última medición ${formatFecha(c.ultima.timestamp)}`,
  }));
  const itemsPunto = carpetasPunto.map(c => ({
    key: c.id,
    to: `/galeria/zona/${empresaActual}/${c.id}`,
    titulo: nombrePunto(c.ultima),
    subtitulo: ciudadDe(c.id) ?? 'Sin ciudad',
    portada: portadaDe(c.ultima),
    detalle: `${c.fotos} ${c.fotos === 1 ? 'foto' : 'fotos'}`,
    nivel: c.ultima.nivel_corrosion ?? 0,
  }));

  // En la página de un punto manda la carga de ese punto, no la del resumen.
  const enPunto = nivelVista === 'fotos' && idPuntoApi;
  const cargando = enPunto ? cargandoPunto && medicionesPunto.length === 0 : loading && mediciones.length === 0;
  const fallo = enPunto ? errorPunto : error;
  const sinDatos = enPunto ? medicionesPunto.length === 0 : mediciones.length === 0;

  let contenido;
  if (cargando) {
    contenido = <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>Cargando…</p>;
  } else if (fallo && sinDatos) {
    contenido = <EstadoVacio icono={AlertCircle} titulo="No se pudo cargar la galería" texto={fallo} />;
  } else if (!enPunto && mediciones.length === 0) {
    contenido = (
      <EstadoVacio icono={ImageOff} titulo="Sin mediciones todavía" texto="Sube tu primera imagen para comenzar el monitoreo de corrosión.">
        <button onClick={() => navigate('/upload')} style={botonAmbarStyle}>
          <Upload size={15} aria-hidden="true" />
          Subir primera medición
        </button>
      </EstadoVacio>
    );
  } else if (nivelVista === 'busqueda') {
    contenido = resultados.length === 0 ? (
      <EstadoVacio icono={Search} titulo="Sin resultados" texto="Ninguna foto coincide con la búsqueda por nombre o notas." />
    ) : (
      <GaleriaFotos
        mediciones={resultados}
        volverA={volverA}
        contexto={m => (variasEmpresas ? `${nombreEmpresa(claveEmpresa(m))} · ` : '') + nombrePunto(m)}
      />
    );
  } else if (nivelVista === 'empresas') {
    contenido = <GaleriaCarpetas items={itemsEmpresa} />;
  } else if (nivelVista === 'puntos') {
    contenido = itemsPunto.length === 0 ? (
      <EstadoVacio icono={ImageOff} titulo="Esta carpeta no tiene fotos" texto="No hay mediciones en esta afiliación.">
        <Link to="/galeria" style={botonAmbarStyle}>Volver a la galería</Link>
      </EstadoVacio>
    ) : <GaleriaCarpetas items={itemsPunto} />;
  } else {
    contenido = fotosDelPunto.length === 0 ? (
      <EstadoVacio icono={ImageOff} titulo="Este punto no tiene fotos" texto="La carpeta no existe o no tiene mediciones cargadas.">
        <Link to={variasEmpresas ? rutaEmpresa : '/galeria'} style={botonAmbarStyle}>Volver</Link>
      </EstadoVacio>
    ) : <GaleriaFotos mediciones={fotosDelPunto} volverA={volverA} puntoActual={idPuntoApi} />;
  }

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <GaleriaBreadcrumb tramos={tramos} />

      {/* ── Título + CTA ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, flexWrap: 'wrap', gap: 'var(--space-3)',
      }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{
            fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-lg)',
            color: 'var(--text-primary)', margin: 0,
          }}>
            {titulo}
          </h2>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '3px 0 0', fontFamily: 'var(--font-ui)' }}>
            {cargando ? 'Cargando…' : subtitulo}
          </p>
        </div>
        <button
          onClick={() => navigate('/upload')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', background: 'var(--accent-amber)',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'white',
            boxShadow: '0 2px 8px rgba(156,54,16,0.3)',
          }}
        >
          <Upload size={15} aria-hidden="true" />
          Subir medición
        </button>
      </div>

      {/* ── Búsqueda (en todos los niveles; busca en todas las fotos visibles) ── */}
      <div style={{ position: 'relative', maxWidth: 360, marginBottom: 20 }}>
        <Search
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
            width: '100%', height: 34, boxSizing: 'border-box',
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
            <X size={12} />
          </button>
        )}
      </div>

      {contenido}
    </div>
  );
}
