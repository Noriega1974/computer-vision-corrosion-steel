import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { apiGet } from '../lib/apiClient';

// Pantalla centrada a página completa, compartida por el spinner de
// verificación y por el bloqueo de cuenta sin registro.
function PantallaCentrada({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-page)',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      padding: 'var(--space-6)',
    }}>
      {children}
    </div>
  );
}

// Redirige a /login si no hay sesión activa. Muestra spinner durante la
// verificación inicial. Una vez autenticado en Cognito, confirma contra el
// backend (GET /usuarios/me) que la cuenta exista en la tabla de usuarios y
// que su afiliación esté activa: el backend ya no auto-crea cuentas
// fantasma, así que un JWT válido sin fila en la tabla recibe 403 con el
// mensaje (y los correos de los super_admin a quienes pedir el alta). Ese
// mensaje se muestra acá, antes de renderizar el layout, porque ninguna
// página interna lo mostraría por su cuenta.
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  // null = verificando, { ok: true } = pasa, { ok: false, mensaje } = bloqueado
  const [registro, setRegistro] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setRegistro(null);
      return;
    }
    let cancelled = false;
    setRegistro(null);
    apiGet('/usuarios/me')
      .then(() => { if (!cancelled) setRegistro({ ok: true }); })
      .catch((err) => {
        if (cancelled) return;
        // Solo un 403 significa "no registrado / afiliación inactiva". Un
        // 500 o un fallo de red no deben dejar a todo el mundo afuera: se
        // deja pasar y cada página muestra su propio error como hasta ahora.
        if (err?.status === 403) {
          setRegistro({ ok: false, mensaje: err.message });
        } else {
          setRegistro({ ok: true });
        }
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.email]);

  if (isLoading || (isAuthenticated && registro === null)) {
    return (
      <PantallaCentrada>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent-amber)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
        }}>
          Verificando sesión…
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </PantallaCentrada>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!registro.ok) {
    return (
      <PantallaCentrada>
        <div style={{
          maxWidth: 440,
          width: '100%',
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
            fontSize: 'var(--text-md)',
            color: 'var(--text-primary)',
          }}>
            Sin acceso
          </div>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            wordBreak: 'break-word',
          }}>
            {registro.mensaje}
          </div>
          <div style={{
            fontFamily: 'var(--font-data)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-faint)',
          }}>
            Sesión iniciada como {user?.email}
          </div>
          <button
            onClick={logout}
            style={{
              alignSelf: 'flex-end',
              padding: '7px 16px',
              background: 'var(--accent-amber)',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              color: 'white',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </PantallaCentrada>
    );
  }

  return children;
}
