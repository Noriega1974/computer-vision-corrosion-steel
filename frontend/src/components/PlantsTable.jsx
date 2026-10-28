import ErrorEstado from './ErrorEstado';
import React, { useState } from 'react';
import { IconoFlechaAbajo, IconoFlechaArriba, IconoMundo, IconoPlanta, IconoUbicacion } from './Iconos';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import Skeleton, { SkeletonLinea } from './Skeleton';
import { useConteoRecordado } from '../hooks/useConteoRecordado';

// ─── Lista jerárquica de Zonas y Puntos en el Dashboard ───────────────────────
export default function PlantsTable({
  puntos = [],
  loading = false,
  error = null,
  onRetry,
  selectedPunto,
  onSelectPunto,
  empresas = [],
  selectedZona,
  onSelectZona,
}) {
  // Manejo de zonas desplegadas
  const [openZonas, setOpenZonas] = useState({});

  const toggleZona = (id) => {
    setOpenZonas(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const tieneEmpresas = empresas && empresas.length > 0;
  const filasSkeleton = useConteoRecordado('dashboard:zonas', tieneEmpresas ? empresas : puntos, loading);

  // admin/tecnico/cliente no reciben `empresas` (GET /empresas es exclusivo de
  // super_admin). Su zona propia llega por GET /usuarios/me (`empresa_zonas`)
  // y se ofrece como un único botón "Centrar en mi zona".
  const { perfil, loading: loadingPerfil } = useUsuarioPerfil();
  const zonasPropias = perfil?.empresa_zonas ?? [];
  const mostrarMiZona = !tieneEmpresas && (loadingPerfil || zonasPropias.length > 0);
  const miZonaSeleccionada = zonasPropias.length > 0 && selectedZona?.zonas === zonasPropias;
  const centrarEnMiZona = () => {
    if (!onSelectZona || zonasPropias.length === 0) return;
    onSelectZona({ id_empresa: 'propia', nombre: perfil?.empresa_nombre, zonas: zonasPropias });
  };

  // Agrupamos puntos por empresa_id
  const puntosPorEmpresa = {};
  const puntosSinZona = [];

  if (tieneEmpresas) {
    empresas.forEach(e => {
      puntosPorEmpresa[e.id_empresa] = [];
    });
    puntos.forEach(p => {
      if (p.empresa_id && puntosPorEmpresa[p.empresa_id]) {
        puntosPorEmpresa[p.empresa_id].push(p);
      } else {
        puntosSinZona.push(p);
      }
    });
  }

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-sm)',
          letterSpacing: '0.04em', color: 'var(--text-primary)',
        }}>
          ZONAS Y PUNTOS
        </div>
        <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', marginTop: 2 }}>
          {loading ? <SkeletonLinea width={90} /> : `${tieneEmpresas ? `${empresas.length} ZONAS · ` : ''}${puntos.length} PUNTOS`}
        </div>
      </div>

      {/* Lista con scroll interno */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {loading && (
          <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: filasSkeleton }, (_, i) => (
              <div
                key={i}
                style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}
              >
                {/* Misma cabecera que el boton de zona: padding, icono 13, texto xs y pildora */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', background: 'var(--bg-inset)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                    <Skeleton width={13} height={13} radius="50%" />
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, flex: 1 }}>
                      <SkeletonLinea width={`${50 + (i % 3) * 12}%`} />
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', padding: '2px 6px', border: '1px solid transparent', fontWeight: 600 }}>
                    <SkeletonLinea width={12} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && error && (
          <ErrorEstado compacto titulo="No se pudieron cargar los puntos." detalle={error} onRetry={onRetry} />
        )}
        {!loading && !error && puntos.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 'var(--space-2)', padding: 20,
          }}>
            <IconoPlanta size={22} opacity={0.4} />
            <div style={{ fontSize: 'var(--text-2xs)', textAlign: 'center' }}>
              Sin puntos registrados.
            </div>
          </div>
        )}

        {/* Zonas como desplegable jerárquico */}
        {!loading && tieneEmpresas ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {empresas.map(empresa => {
              const pts = puntosPorEmpresa[empresa.id_empresa] ?? [];
              const isOpen = !!openZonas[empresa.id_empresa];
              const isZonaSelected = selectedZona?.id_empresa === empresa.id_empresa;

              return (
                <div
                  key={empresa.id_empresa}
                  style={{
                    border: `1px solid ${isZonaSelected ? 'var(--accent-blue)' : 'var(--border)'}`,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: 'var(--bg-page)',
                  }}
                >
                  {/* Cabecera de la Zona */}
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '8px 10px',
                      background: isZonaSelected ? 'rgba(0,185,255,0.08)' : 'var(--bg-inset)',
                      border: 'none',
                      font: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    onClick={() => {
                      toggleZona(empresa.id_empresa);
                      if (onSelectZona) onSelectZona(empresa);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <IconoMundo size={13} color={isZonaSelected ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {empresa.nombre}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: '12px',
                        padding: '2px 6px',
                        background: 'var(--bg-card)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}>
                        {pts.length}
                      </span>
                      {isOpen ? <IconoFlechaArriba size={14} color="var(--text-muted)" /> : <IconoFlechaAbajo size={14} color="var(--text-muted)" />}
                    </div>
                  </button>

                  {/* Puntos dentro de la Zona */}
                  {isOpen && (
                    <div style={{ padding: '4px', display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--bg-card)' }}>
                      {pts.length === 0 ? (
                        <div style={{ padding: '8px 10px', fontSize: 'var(--text-3xs)', color: 'var(--text-faint)', fontStyle: 'italic' }}>
                          Sin puntos en esta zona
                        </div>
                      ) : (
                        pts.map((p, idx) => (
                          <PlantRow
                            key={p.id_bloque}
                            punto={p}
                            index={idx}
                            selected={selectedPunto?.id_bloque === p.id_bloque}
                            onClick={() => onSelectPunto(p)}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Puntos sin zona asignada */}
            {puntosSinZona.length > 0 && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: 'var(--bg-page)',
                }}
              >
                <button
                  type="button"
                  aria-expanded={!!openZonas['sin_zona']}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 10px',
                    background: 'var(--bg-inset)',
                    border: 'none',
                    font: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleZona('sin_zona')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IconoUbicacion size={13} color="var(--text-muted)" />
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Puntos generales
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '12px', padding: '2px 6px', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {puntosSinZona.length}
                    </span>
                    {openZonas['sin_zona'] ? <IconoFlechaArriba size={14} color="var(--text-muted)" /> : <IconoFlechaAbajo size={14} color="var(--text-muted)" />}
                  </div>
                </button>

                {openZonas['sin_zona'] && (
                  <div style={{ padding: '4px', display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--bg-card)' }}>
                    {puntosSinZona.map((p, idx) => (
                      <PlantRow
                        key={p.id_bloque}
                        punto={p}
                        index={idx}
                        selected={selectedPunto?.id_bloque === p.id_bloque}
                        onClick={() => onSelectPunto(p)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Modo directo para afiliación única */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {!loading && mostrarMiZona && (
              <button
                type="button"
                disabled={loadingPerfil}
                onClick={centrarEnMiZona}
                aria-pressed={miZonaSeleccionada}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%',
                  padding: '8px 10px', font: 'inherit', textAlign: 'left',
                  cursor: loadingPerfil ? 'not-allowed' : 'pointer',
                  background: miZonaSeleccionada ? SELECCION_FONDO : 'var(--bg-page)',
                  border: `1px solid ${miZonaSeleccionada ? SELECCION_BORDE : 'var(--border)'}`,
                  borderRadius: 4, opacity: loadingPerfil ? 0.6 : 1,
                }}
              >
                <IconoUbicacion size={13} color="var(--text-muted)" />
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {loadingPerfil ? 'Cargando…' : 'Centrar en mi zona'}
                </span>
              </button>
            )}
            {puntos.map((p, i) => (
              <PlantRow
                key={p.id_bloque}
                punto={p}
                index={i}
                selected={selectedPunto?.id_bloque === p.id_bloque}
                onClick={() => onSelectPunto(p)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Selected state without a side-tab: soft tint plus a full 1px border.
const SELECCION_FONDO = 'color-mix(in srgb, var(--accent-blue) 10%, var(--bg-page))';
const SELECCION_BORDE = 'color-mix(in srgb, var(--accent-blue) 85%, transparent)';

function PlantRow({ punto, index, selected, onClick }) {
  const nombre = punto.nombre ?? 'Punto sin nombre';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      // Background goes through a CSS variable so the hover rule in index.css
      // (.planta-row) can override it; inline `background` would always win.
      className={selected ? 'planta-row is-selected' : 'planta-row'}
      style={{
        '--fila-fondo': selected ? SELECCION_FONDO : 'var(--bg-page)',
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 10px',
        border: `1px solid ${selected ? SELECCION_BORDE : 'var(--border)'}`,
        borderRadius: 4,
        cursor: 'pointer',
        font: 'inherit',
      }}
    >
      <div
        title={nombre}
        style={{
          fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {nombre}
      </div>
      <div
        title={`${punto.ciudad ?? '—'}${punto.departamento ? ` · ${punto.departamento}` : ''}`}
        style={{
          fontSize: 'var(--text-3xs)', color: 'var(--text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {punto.ciudad ?? '—'}{punto.departamento ? ` · ${punto.departamento}` : ''}
      </div>
    </button>
  );
}
