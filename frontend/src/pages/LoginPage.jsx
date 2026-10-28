import { AvisoEnLinea } from '../components/Aviso';
import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth, obtenerRutaInicial } from '../auth/AuthContext';
import PasswordChecklist from '../components/PasswordChecklist';
import { isPasswordValid } from '../lib/passwordPolicy';
import pixelrustLogo from '../assets/pixelrust-logo.png';

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg-inset)',
  border: '1px solid var(--border)',
  borderRadius: 7,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  transition: 'border-color var(--dur-fast) var(--ease-out)',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--text-2xs)',
  fontWeight: 600,
  color: 'var(--text-muted)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

export default function LoginPage() {
  const { login, confirmNewPassword, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destinoGuardado = location.state?.from;

  // Paso 1: login inicial
  const [loginMode, setLoginMode] = useState('email'); // 'email' | 'username'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Paso 2: nueva contraseña (challenge NEW_PASSWORD_REQUIRED)
  const [step, setStep] = useState('login'); // 'login' | 'nueva-contrasena'
  const [nuevaPw, setNuevaPw] = useState('');
  const [confirmarPw, setConfirmarPw] = useState('');

  // Si ya hay sesión activa, volver a la ruta solicitada o a la raíz inicial
  if (!isLoading && isAuthenticated && !submitting) {
    const destino = (destinoGuardado && destinoGuardado !== '/') ? destinoGuardado : '/';
    return <Navigate to={destino} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const identifier = loginMode === 'username' && !email.includes('@')
        ? `${email.trim().toLowerCase()}@corria.app`
        : email.trim();
      const result = await login(identifier, password, loginMode);
      if (result?.needsNewPassword) {
        // Cognito requiere cambio de contraseña en el primer ingreso
        setStep('nueva-contrasena');
      } else {
        const rutaPorDefecto = obtenerRutaInicial(result);
        const destino = (destinoGuardado && destinoGuardado !== '/') ? destinoGuardado : rutaPorDefecto;
        navigate(destino, { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNuevaContraseña(e) {
    e.preventDefault();
    setError('');

    if (!isPasswordValid(nuevaPw)) { setError('La contraseña no cumple todos los requisitos.'); return; }
    if (nuevaPw !== confirmarPw) { setError('Las contraseñas no coinciden.'); return; }

    setSubmitting(true);
    try {
      const userData = await confirmNewPassword(nuevaPw);
      navigate(obtenerRutaInicial(userData, true), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Bloque visual compartido ────────────────────────────────────────────────
  const card = (
    <div className="glass-panel" style={{
      width: '100%',
      maxWidth: 420,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Franja superior con acento */}
      <div style={{
        height: 4,
        background: 'var(--gradient-brand)',
      }} />

      <div style={{ padding: '36px 36px 40px' }}>

        {/* Título */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <img
            src={pixelrustLogo}
            alt=""
            style={{
              width: 44,
              height: 44,
              objectFit: 'contain',
              marginBottom: 'var(--space-2)',
            }}
          />
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 26,
            letterSpacing: '0.01em',
            color: 'var(--accent-amber)',
            marginBottom: 'var(--space-3-5)',
          }}>
            PIXELRUST
          </div>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 500,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            marginTop: 2,
          }}>
            Detección de corrosión mediante inteligencia artificial
          </div>
          <div style={{
            fontFamily: 'var(--font-data)',
            fontSize: 'var(--text-3xs)',
            color: 'var(--text-faint)',
            marginTop: 6,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Universidad del Norte · Ing. Electrónica
          </div>
        </div>

        {/* Separador */}
        <div style={{ height: 1, background: 'var(--border)', marginBottom: 28 }} />

        {/* ── Paso 1: formulario de login ── */}
        {step === 'login' && (
          <form onSubmit={handleSubmit}>
            {/* Toggle email / usuario */}
            <div style={{ display: 'flex', marginBottom: 18, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {[['email', 'Correo electrónico'], ['username', 'Usuario']].map(([mode, lbl]) => (
                <button
                  key={mode} type="button"
                  onClick={() => { setLoginMode(mode); setEmail(''); setError(''); }}
                  style={{
                    flex: 1, padding: '8px 0', fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-data)', fontWeight: 600, letterSpacing: '0.04em',
                    cursor: 'pointer', border: 'none',
                    background: loginMode === mode ? 'var(--accent-amber)' : 'var(--bg-inset)',
                    color: loginMode === mode ? 'white' : 'var(--text-muted)',
                    transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 18 }}>
              <label htmlFor="login-identificador" style={labelStyle}>
                {loginMode === 'email' ? 'Correo electrónico' : 'Usuario'}
              </label>
              <input
                id="login-identificador"
                name={loginMode === 'email' ? 'email' : 'username'}
                type={loginMode === 'email' ? 'email' : 'text'}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={loginMode === 'email' ? 'nombre@example.com' : 'ej: colaborador01'}
                required
                disabled={submitting}
                autoComplete="username"
                spellCheck={false}
                autoCapitalize="none"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--accent-amber)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            <div style={{ marginBottom: 'var(--space-5)' }}>
              <label htmlFor="login-password" style={labelStyle}>Contraseña</label>
              <input
                id="login-password"
                name="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={submitting}
                autoComplete="current-password"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--accent-amber)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {error && <ErrorBanner message={error} />}

            <SubmitButton submitting={submitting} label="Ingresar" />
          </form>
        )}

        {/* ── Paso 2: establecer nueva contraseña ── */}
        {step === 'nueva-contrasena' && (
          <>
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <div style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                fontSize: 16,
                color: 'var(--text-primary)',
                marginBottom: 6,
              }}>
                Crea tu contraseña
              </div>
              <div style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}>
                Es tu primer ingreso. Debes establecer una contraseña nueva.
              </div>
            </div>

            <form onSubmit={handleNuevaContraseña}>
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="nueva-password" style={labelStyle}>Nueva contraseña</label>
                <input
                  id="nueva-password"
                  name="new-password"
                  type="password"
                  value={nuevaPw}
                  onChange={e => setNuevaPw(e.target.value)}
                  required
                  disabled={submitting}
                  autoComplete="new-password"
                  aria-describedby="nueva-password-requisitos"
                  autoFocus
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent-amber)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                <PasswordChecklist id="nueva-password-requisitos" password={nuevaPw} />
              </div>

              <div style={{ marginBottom: 'var(--space-5)' }}>
                <label htmlFor="confirmar-password" style={labelStyle}>Confirmar nueva contraseña</label>
                <input
                  id="confirmar-password"
                  name="confirm-password"
                  type="password"
                  value={confirmarPw}
                  onChange={e => setConfirmarPw(e.target.value)}
                  required
                  disabled={submitting}
                  autoComplete="new-password"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent-amber)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              {error && <ErrorBanner message={error} />}

              <SubmitButton submitting={submitting} disabled={!isPasswordValid(nuevaPw)} label="Establecer contraseña" />
            </form>
          </>
        )}

        {/* Nota de acceso */}
        <p style={{
          marginTop: 20,
          textAlign: 'center',
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--text-3xs)',
          color: 'var(--text-faint)',
          letterSpacing: '0.06em',
        }}>
          Acceso restringido · Solo usuarios autorizados
        </p>
      </div>
    </div>
  );

  return (
    <div className="dashboard-shell" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      {card}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Sub-componentes locales ──────────────────────────────────────────────────

function ErrorBanner({ message }) {
  return (
    <AvisoEnLinea tone="error" style={{ marginBottom: 18 }}>
      {message}
    </AvisoEnLinea>
  );
}

function SubmitButton({ submitting, label, disabled = false }) {
  const bloqueado = submitting || disabled;
  return (
    <button
      type="submit"
      disabled={bloqueado}
      style={{
        width: '100%',
        padding: 'var(--space-3)',
        background: submitting ? 'var(--bg-inset)' : 'var(--accent-amber)',
        opacity: disabled && !submitting ? 0.5 : 1,
        border: 'none',
        borderRadius: 8,
        color: submitting ? 'var(--text-muted)' : 'white',
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 14,
        letterSpacing: '0.03em',
        cursor: bloqueado ? 'not-allowed' : 'pointer',
        transition: 'background var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
      }}
    >
      {submitting ? (
        <>
          <div style={{
            width: 16,
            height: 16,
            border: '2px solid var(--border)',
            borderTopColor: 'var(--accent-amber)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          Verificando…
        </>
      ) : label}
    </button>
  );
}
