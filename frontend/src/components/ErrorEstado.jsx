import { IconoError } from './Iconos';

// Shared load-failure block for a page or section. `onRetry` must refetch only
// the failed data (never reload the page). Colors come from theme tokens:
// --text-primary / --text-muted keep >= 4.5:1 on surface backgrounds in both themes.
export const botonReintentarStyle = {
  padding: '6px 12px', minHeight: 32, borderRadius: 6,
  border: '1px solid var(--border-strong)', background: 'transparent',
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
};

export default function ErrorEstado({ titulo, detalle, onRetry, compacto = false, style }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        gap: 'var(--space-2)', padding: compacto ? 'var(--space-4)' : 'var(--space-6) var(--space-4)',
        fontFamily: 'var(--font-ui)', ...style,
      }}
    >
      <IconoError size={compacto ? 20 : 28} color="var(--accent-red)" />
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{titulo}</div>
      {detalle && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', maxWidth: '48ch' }}>{detalle}</div>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ ...botonReintentarStyle, marginTop: 'var(--space-1)' }}>
          Reintentar
        </button>
      )}
    </div>
  );
}
