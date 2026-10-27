import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SearchX, CheckSquare } from 'lucide-react';
import MedicionCard from './MedicionCard';
import BarraSeleccion from './BarraSeleccion';
import { EliminarLoteDialog, MoverLoteDialog } from './LoteDialogs';
import { useAuth } from '../auth/AuthContext';
import { useAccionesLote } from '../hooks/useAccionesLote';
import { NIVELES, nivelColor, nivelLabel } from '../lib/statusUtils';

const ORDENES = [
  { key: 'recientes', label: 'Más recientes' },
  { key: 'antiguas', label: 'Más antiguas' },
  { key: 'mayor', label: 'Mayor corrosión' },
  { key: 'menor', label: 'Menor corrosión' },
];

const tiempo = (m) => new Date(m.timestamp).getTime() || 0;
const pct = (m) => Number(m.area_corroida_pct ?? 0);
const COMPARADORES = {
  recientes: (a, b) => tiempo(b) - tiempo(a),
  antiguas: (a, b) => tiempo(a) - tiempo(b),
  mayor: (a, b) => pct(b) - pct(a),
  menor: (a, b) => pct(a) - pct(b),
};

// Roles que pueden eliminar y mover fotos (cliente solo mira).
const ROLES_GESTION = ['super_admin', 'admin', 'tecnico'];
// La partition key de la medición; si el ítem no la trae, el bloque al que pertenece.
const idPuntoDe = (m) => m.id_punto || m.bloque_id;

const controlStyle = {
  padding: '5px 10px', background: 'var(--bg-inset)',
  border: '1px solid var(--border)', borderRadius: 7,
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-2xs)',
};

const etiquetaStyle = {
  fontSize: 'var(--text-3xs)', color: 'var(--text-faint)',
  fontFamily: 'var(--font-data)', letterSpacing: '0.1em',
};

// Rejilla de fotos con filtros de nivel y fechas y orden. Se usa tanto en la
// página de un punto como en los resultados de búsqueda.
//  - mediciones: las fotos a mostrar (ya acotadas por punto o por búsqueda).
//  - contexto: función opcional (medicion) => "Empresa · Punto" para el subtítulo.
//  - volverA: ruta (con query) a la que regresa la ficha de una medición.
//  - puntoActual: id del punto que se está viendo (se excluye como destino de "Mover").
// Roles con permiso (super_admin/admin/tecnico) pueden entrar en modo selección
// para eliminar o mover varias fotos a la vez.
export default function GaleriaFotos({ mediciones, contexto, volverA, puntoActual }) {
  const location = useLocation();
  const { user } = useAuth();
  const puedeGestionar = ROLES_GESTION.some(r => user?.groups?.includes(r));
  const { eliminar, mover, procesando } = useAccionesLote();
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [dialogo, setDialogo] = useState(null); // 'mover' | 'eliminar'
  const [resumen, setResumen] = useState(null); // { texto, errores: [...] }
  // Al volver desde la ficha de una medición, los filtros llegan por el state
  // de navegación (ver handleBack en MedicionDetailPage). Se leen una sola vez.
  const [restored] = useState(() => location.state ?? {});
  const [nivelFilter, setNivelFilter] = useState(restored.nivelFilter ?? 'all');
  const [fechaInicio, setFechaInicio] = useState(restored.fechaInicio ?? '');
  const [fechaFin, setFechaFin] = useState(restored.fechaFin ?? '');
  const [orden, setOrden] = useState(restored.orden ?? 'recientes');

  const hayFiltros = nivelFilter !== 'all' || fechaInicio || fechaFin;
  const visibles = mediciones
    .filter(m => {
      if (nivelFilter !== 'all' && (m.nivel_corrosion ?? 0) !== Number(nivelFilter)) return false;
      if (fechaInicio && new Date(m.timestamp) < new Date(fechaInicio)) return false;
      if (fechaFin && new Date(m.timestamp) > new Date(fechaFin + 'T23:59:59')) return false;
      return true;
    })
    .sort(COMPARADORES[orden]);

  // Solo cuentan las marcadas que siguen visibles tras los filtros.
  const elegibles = visibles.filter(m => idPuntoDe(m));
  const elegidas = elegibles.filter(m => marcadas.has(m.id_medicion));

  const salirDeSeleccion = () => { setSeleccionando(false); setMarcadas(new Set()); setDialogo(null); };
  const alternar = (id) => setMarcadas(prev => {
    const sig = new Set(prev);
    if (sig.has(id)) sig.delete(id); else sig.add(id);
    return sig;
  });
  const alternarTodas = () => setMarcadas(
    elegidas.length === elegibles.length ? new Set() : new Set(elegibles.map(m => m.id_medicion)),
  );

  // Escape cierra el diálogo abierto o, si no hay, sale del modo selección.
  useEffect(() => {
    if (!seleccionando) return undefined;
    const alTecla = (e) => {
      if (e.key !== 'Escape' || procesando) return;
      if (dialogo) setDialogo(null); else salirDeSeleccion();
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [seleccionando, dialogo, procesando]);

  async function ejecutar(accion, verbo) {
    const nombres = new Map(elegidas.map(m => [m.id_medicion, m.nombre || m.bloque_nombre || m.id_medicion]));
    const { ok, error } = await accion(elegidas.map(m => ({ id_punto: idPuntoDe(m), id_medicion: m.id_medicion })));
    const partes = [`${ok.length} ${ok.length === 1 ? verbo.sing : verbo.plur}`];
    if (error.length) partes.push(`${error.length} con error`);
    setResumen({
      texto: partes.join(', '),
      errores: error.map(e => `${nombres.get(e.id_medicion) ?? e.id_medicion}: ${e.motivo}`),
      conError: error.length > 0,
    });
    salirDeSeleccion();
  }

  return (
    <>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 16px', marginBottom: 20,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={etiquetaStyle}>NIVEL:</span>
          {[
            { key: 'all', label: 'Todos', color: 'var(--text-muted)' },
            ...NIVELES.map((_, n) => ({ key: String(n), label: nivelLabel(n), color: nivelColor(n) })),
          ].map(({ key, label, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => setNivelFilter(key)}
              style={{
                padding: '3px 9px', borderRadius: 20,
                border: `1px solid ${nivelFilter === key ? color : 'var(--border)'}`,
                background: nivelFilter === key ? `${color}18` : 'transparent',
                color: nivelFilter === key ? color : 'var(--text-muted)',
                fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', cursor: 'pointer',
                fontWeight: nivelFilter === key ? 600 : 400,
                transition: 'color 0.12s, background-color 0.12s, border-color 0.12s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          paddingTop: 10, borderTop: '1px solid var(--border)',
        }}>
          <label htmlFor="galeria-desde" style={etiquetaStyle}>DESDE:</label>
          <input id="galeria-desde" type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={controlStyle} />
          <label htmlFor="galeria-hasta" style={etiquetaStyle}>HASTA:</label>
          <input id="galeria-hasta" type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={controlStyle} />
          <label htmlFor="galeria-orden" style={{ ...etiquetaStyle, marginLeft: 'auto' }}>ORDEN:</label>
          <select id="galeria-orden" value={orden} onChange={e => setOrden(e.target.value)} style={controlStyle}>
            {ORDENES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => { setNivelFilter('all'); setFechaInicio(''); setFechaFin(''); }}
              style={{
                padding: '4px 9px', background: 'transparent',
                border: '1px dashed var(--border-strong)', borderRadius: 6,
                cursor: 'pointer', color: 'var(--text-muted)',
                fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)',
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {resumen && (
        <div role="status" style={{
          display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 12,
          padding: '10px 14px', borderRadius: 10, background: 'var(--bg-card)',
          border: `1px solid ${resumen.conError ? 'var(--accent-red)' : 'var(--border)'}`,
          fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{resumen.texto}</strong>
            {resumen.errores.map(t => (
              <div key={t} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>{t}</div>
            ))}
          </div>
          <button
            type="button" onClick={() => setResumen(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}
          >
            Cerrar
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', margin: '0 0 12px' }}>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-ui)' }}>
          {visibles.length} {visibles.length === 1 ? 'foto' : 'fotos'}
          {visibles.length !== mediciones.length ? ` de ${mediciones.length}` : ''}
        </p>
        {puedeGestionar && !seleccionando && visibles.length > 0 && (
          <button
            type="button" onClick={() => { setSeleccionando(true); setResumen(null); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 8,
              cursor: 'pointer', color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)',
            }}
          >
            <CheckSquare size={15} aria-hidden="true" />
            Seleccionar
          </button>
        )}
      </div>

      {visibles.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
          textAlign: 'center', padding: '40px 20px',
          color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
        }}>
          <SearchX size={26} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
          No hay fotos que coincidan con los filtros seleccionados.
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
        }}>
          {visibles.map(m => (
            <MedicionCard
              key={m.id_medicion}
              medicion={m}
              contexto={contexto?.(m)}
              to={`/galeria/${m.id_medicion}`}
              state={{ filters: { nivelFilter, fechaInicio, fechaFin, orden }, volver: volverA }}
              seleccion={seleccionando && idPuntoDe(m) ? {
                marcada: marcadas.has(m.id_medicion),
                onToggle: () => alternar(m.id_medicion),
              } : undefined}
            />
          ))}
        </div>
      )}

      {seleccionando && (
        <BarraSeleccion
          cantidad={elegidas.length}
          total={elegibles.length}
          deshabilitado={procesando}
          onSeleccionarTodo={alternarTodas}
          onMover={() => setDialogo('mover')}
          onEliminar={() => setDialogo('eliminar')}
          onCancelar={salirDeSeleccion}
        />
      )}
      {dialogo === 'eliminar' && (
        <EliminarLoteDialog
          cantidad={elegidas.length}
          procesando={procesando}
          onCancelar={() => setDialogo(null)}
          onConfirmar={() => ejecutar(eliminar, { sing: 'eliminada', plur: 'eliminadas' })}
        />
      )}
      {dialogo === 'mover' && (
        <MoverLoteDialog
          cantidad={elegidas.length}
          puntoActual={puntoActual}
          procesando={procesando}
          onCancelar={() => setDialogo(null)}
          onConfirmar={(destino) => ejecutar(items => mover(items, destino), { sing: 'movida', plur: 'movidas' })}
        />
      )}
    </>
  );
}
