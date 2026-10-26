import React, { useState, useEffect, useRef } from 'react';
import { Factory, Globe, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Lista jerárquica de Zonas y Puntos en el Dashboard ───────────────────────
export default function PlantsTable({
  puntos = [],
  loading = false,
  error = null,
  selectedPunto,
  onSelectPunto,
  empresas = [],
  selectedZona,
  onSelectZona,
}) {
  // Manejo de zonas desplegadas
  const [openZonas, setOpenZonas] = useState({});

  // Las empresas llegan de forma asíncrona: al cargar por primera vez se abre
  // la primera zona. Solo ocurre una vez, para no reabrirla si el usuario la
  // cierra después.
  const abrioPrimeraZona = useRef(false);
  useEffect(() => {
    if (abrioPrimeraZona.current || !empresas || empresas.length === 0) return;
    abrioPrimeraZona.current = true;
    setOpenZonas(prev => ({ ...prev, [empresas[0].id_empresa]: true }));
  }, [empresas]);

  const toggleZona = (id) => {
    setOpenZonas(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const tieneEmpresas = empresas && empresas.length > 0;

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
          {loading ? 'Cargando…' : `${tieneEmpresas ? `${empresas.length} ZONAS · ` : ''}${puntos.length} PUNTOS`}
        </div>
      </div>

      {/* Lista con scroll interno */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 }}>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>Cargando…</span>
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 'var(--space-3)', fontSize: 'var(--text-2xs)', color: 'var(--accent-red)' }}>Error: {error}</div>
        )}
        {!loading && !error && puntos.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 'var(--space-2)', padding: 20,
          }}>
            <Factory size={22} opacity={0.4} />
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
                      <Globe size={13} color={isZonaSelected ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {empresa.nombre}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: '9px',
                        padding: '2px 6px',
                        background: 'var(--bg-card)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}>
                        {pts.length}
                      </span>
                      {isOpen ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
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
                    <MapPin size={13} color="var(--text-muted)" />
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Puntos generales
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '9px', padding: '2px 6px', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {puntosSinZona.length}
                    </span>
                    {openZonas['sin_zona'] ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
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

function PlantRow({ punto, index, selected, onClick }) {
  const nombre = punto.nombre ?? 'Punto sin nombre';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 10px',
        background: selected ? 'rgba(156,54,16,0.12)' : 'var(--bg-page)',
        border: `1px solid ${selected ? 'var(--accent-blue)' : 'var(--border)'}`,
        borderLeft: `3px solid ${selected ? 'var(--accent-blue)' : 'var(--border-bright)'}`,
        borderRadius: 4,
        cursor: 'pointer',
        font: 'inherit',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-page)'; }}
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
