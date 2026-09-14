import React from 'react';
import { Globe, Crosshair } from 'lucide-react';
import { useEmpresas } from '../hooks/useEmpresas';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth } from '../auth/AuthContext';

// Lista de afiliaciones con zonas dibujadas -- una fila por afiliación, no
// por polígono individual (una empresa puede tener varias manchas). Clic
// centra el mapa en el conjunto de todas sus zonas (ver ColombiaMap, prop
// `selectedZona`, que recibe la empresa entera). Solo super_admin ve zonas
// de TODAS las empresas (mismo límite que el mapa: GET /empresas es
// exclusivo de ese rol) -- admin/tecnico/cliente en cambio solo tienen (y
// solo necesitan) la propia, resuelta vía GET /usuarios/me
// (`empresa_zonas`), así que ven un único botón "Centrar en mi zona" en vez
// de la lista completa.
export default function ZonasList({ selectedZona, onSelectZona }) {
  const { user } = useAuth();
  const esSuperAdmin = user?.groups?.includes('super_admin');
  const { empresas, loading } = useEmpresas(esSuperAdmin);
  const { perfil, loading: loadingPerfil } = useUsuarioPerfil();

  if (!esSuperAdmin) {
    const zonasPropias = perfil?.empresa_zonas ?? [];
    if (!loadingPerfil && zonasPropias.length === 0) return null;

    const miZona = { nombre: perfil?.empresa_nombre, zonas: zonasPropias };
    const seleccionada = selectedZona === miZona || selectedZona?.zonas === zonasPropias;

    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, flexShrink: 0, padding: 'var(--space-2)',
      }}>
        <button
          type="button"
          disabled={loadingPerfil}
          onClick={() => onSelectZona(miZona)}
          aria-pressed={seleccionada}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%',
            padding: '8px 10px', font: 'inherit', cursor: loadingPerfil ? 'not-allowed' : 'pointer',
            background: seleccionada ? 'rgba(0,185,255,0.1)' : 'var(--bg-page)',
            border: `1px solid ${seleccionada ? '#00b9ff' : 'var(--border)'}`,
            borderLeft: `3px solid ${seleccionada ? '#00b9ff' : 'var(--border-bright)'}`,
            borderRadius: 6, opacity: loadingPerfil ? 0.6 : 1,
          }}
        >
          <Crosshair size={13} />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {loadingPerfil ? 'Cargando…' : 'Centrar en mi zona'}
          </span>
        </button>
      </div>
    );
  }

  const filas = empresas.filter(e => (e.zonas ?? []).length > 0);

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      maxHeight: 150, overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-sm)', letterSpacing: '0.1em', color: 'var(--text-primary)' }}>
          <Globe size={13} /> ZONAS
        </div>
        <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 2 }}>
          {loading ? 'Cargando…' : `${filas.length} AFILIACIONES`}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-2)' }}>
        {!loading && filas.length === 0 && (
          <div style={{ padding: '10px', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
            Sin zonas dibujadas.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {filas.map(e => {
            const totalManchas = e.zonas.length;
            const totalPuntos = e.zonas.reduce((s, z) => s + z.puntos.length, 0);
            const seleccionada = selectedZona === e;
            return (
              <button
                key={e.id_empresa}
                type="button"
                onClick={() => onSelectZona(e)}
                aria-pressed={seleccionada}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 10px', font: 'inherit', cursor: 'pointer',
                  background: seleccionada ? 'rgba(0,185,255,0.1)' : 'var(--bg-page)',
                  border: `1px solid ${seleccionada ? '#00b9ff' : 'var(--border)'}`,
                  borderLeft: `3px solid ${seleccionada ? '#00b9ff' : 'var(--border-bright)'}`,
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>{e.nombre}</div>
                <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)' }}>
                  {totalManchas > 1 ? `${totalManchas} zonas · ` : ''}{totalPuntos} puntos
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
