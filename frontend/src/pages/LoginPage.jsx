import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Valida requisitos mínimos de contraseña según política de Cognito
function validarContraseña(pw) {
  if (pw.length < 8) return 'Mínimo 8 caracteres.';
  if (!/[A-Z]/.test(pw)) return 'Debe incluir al menos una mayúscula.';
  if (!/[0-9]/.test(pw)) return 'Debe incluir al menos un número.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Debe incluir al menos un símbolo.';
  return null;
}

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg-inset)',
  border: '1px solid var(--border)',
  borderRadius: 7,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontFamily: 'var(--font-data)',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

export default function LoginPage() {
  const { login, confirmNewPassword, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

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

  // Si ya hay sesión activa, ir directo al dashboard
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const identifier = loginMode === 'username' && !email.includes('@')
        ? `${email.trim().toLowerCase()}@corria.app`
        : email.trim();
      const result = await login(identifier, password);
      if (result?.needsNewPassword) {
        // Cognito requiere cambio de contraseña en el primer ingreso
        setStep('nueva-contrasena');
      } else {
        navigate('/', { replace: true });
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

    const validacion = validarContraseña(nuevaPw);
    if (validacion) { setError(validacion); return; }
    if (nuevaPw !== confirmarPw) { setError('Las contraseñas no coinciden.'); return; }

    setSubmitting(true);
    try {
      await confirmNewPassword(nuevaPw);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Bloque visual compartido ────────────────────────────────────────────────
  const card = (
    <div style={{
      width: '100%',
      maxWidth: 420,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden',
    }}>
      {/* Franja superior con acento */}
      <div style={{
        height: 4,
        background: `linear-gradient(90deg, #1432A3, #00C8F5)`,
      }} />

      <div style={{ padding: '36px 36px 40px' }}>

        {/* Título */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 20,
            color: 'var(--text-primary)',
            marginBottom: 14,
          }}>
            Sistema de Detección de Corrosión
          </div>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 500,
            fontSize: 13,
            color: 'var(--accent-amber)',
            marginTop: 2,
          }}>
            Detección de corrosión mediante inteligencia artificial
          </div>
          <div style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-faint)',
            marginTop: 6,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Universidad del Norte · Ing. Mecánica &amp; Electrónica
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
                    flex: 1, padding: '8px 0', fontSize: 12,
                    fontFamily: 'var(--font-data)', fontWeight: 600, letterSpacing: '0.04em',
                    cursor: 'pointer', border: 'none',
                    background: loginMode === mode ? 'var(--accent-amber)' : 'var(--bg-inset)',
                    color: loginMode === mode ? 'white' : 'var(--text-muted)',
                    transition: 'background 0.15s, color 0.15s',
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
                placeholder={loginMode === 'email' ? 'usuario@ejemplo.com' : 'Nombre de usuario'}
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

            <div style={{ marginBottom: 24 }}>
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
            <div style={{ marginBottom: 24 }}>
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
                fontSize: 13,
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
                  autoFocus
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent-amber)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
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

              {/* Requisitos de contraseña */}
              <div style={{
                padding: '8px 12px',
                background: 'var(--bg-inset)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                marginBottom: 18,
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                color: 'var(--text-faint)',
                lineHeight: 1.7,
              }}>
                Mínimo 8 caracteres · Una mayúscula · Un número · Un símbolo
              </div>

              {error && <ErrorBanner message={error} />}

              <SubmitButton submitting={submitting} label="Establecer contraseña" />
            </form>
          </>
        )}

        {/* Nota de acceso */}
        <p style={{
          marginTop: 20,
          textAlign: 'center',
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color: 'var(--text-faint)',
          letterSpacing: '0.06em',
        }}>
          Acceso restringido · Solo usuarios autorizados
        </p>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-page)',
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
    <div style={{
      padding: '10px 14px',
      background: 'rgba(220,38,38,0.08)',
      border: '1px solid rgba(220,38,38,0.3)',
      borderLeft: '3px solid var(--accent-red)',
      borderRadius: '0 6px 6px 0',
      marginBottom: 18,
      fontFamily: 'var(--font-ui)',
      fontSize: 13,
      color: 'var(--accent-red)',
      lineHeight: 1.5,
    }}>
      {message}
    </div>
  );
}

function SubmitButton({ submitting, label }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      style={{
        width: '100%',
        padding: '12px',
        background: submitting ? 'var(--bg-inset)' : 'var(--accent-amber)',
        border: 'none',
        borderRadius: 8,
        color: submitting ? 'var(--text-muted)' : 'white',
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 14,
        letterSpacing: '0.03em',
        cursor: submitting ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s, opacity 0.15s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
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
