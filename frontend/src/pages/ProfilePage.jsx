import React, { useState, useEffect } from 'react';
import { updatePassword } from 'aws-amplify/auth';
import { User, Lock, Check, AlertCircle } from 'lucide-react';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth } from '../auth/AuthContext';

const AVATAR_COLORS = [
  { value: '#1432A3', label: 'Navy' },
  { value: '#2563eb', label: 'Azul' },
  { value: '#16a34a', label: 'Verde' },
  { value: '#dc2626', label: 'Rojo' },
  { value: '#7c3aed', label: 'Violeta' },
  { value: '#0891b2', label: 'Cian' },
  { value: '#db2777', label: 'Rosa' },
  { value: '#64748b', label: 'Gris' },
];

const STORAGE_KEY = 'corria-avatar-color';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function validatePassword(pw) {
  const errors = [];
  if (pw.length < 8) errors.push('Mínimo 8 caracteres');
  if (!/[A-Z]/.test(pw)) errors.push('Al menos una mayúscula');
  if (!/[0-9]/.test(pw)) errors.push('Al menos un número');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) errors.push('Al menos un símbolo');
  return errors;
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={15} strokeWidth={1.8} style={{ color: 'var(--accent-amber)' }} />
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '20px' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Field ───────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-page)',
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 13,
  boxSizing: 'border-box',
};

export default function ProfilePage() {
  const { user } = useAuth();
  const { perfil, loading, saving, saveError, actualizarPerfil } = useUsuarioPerfil();

  const [avatarColor, setAvatarColor] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '#1432A3');
  const [nombre, setNombre] = useState('');
  const [infoMsg, setInfoMsg] = useState(null);
  const [infoError, setInfoError] = useState(null);

  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwError, setPwError] = useState(null);

  useEffect(() => {
    if (perfil) setNombre(perfil.nombre ?? perfil.name ?? user?.name ?? '');
  }, [perfil, user]);

  const handleAvatarColor = (color) => {
    setAvatarColor(color);
    localStorage.setItem(STORAGE_KEY, color);
    window.dispatchEvent(new CustomEvent('corria-avatar-color', { detail: color }));
  };

  const handleSaveInfo = async () => {
    setInfoMsg(null);
    setInfoError(null);
    try {
      await actualizarPerfil({ nombre });
      localStorage.setItem('corria-display-name', nombre);
      window.dispatchEvent(new CustomEvent('corria-user-name', { detail: nombre }));
      setInfoMsg('Perfil actualizado correctamente.');
    } catch (err) {
      setInfoError(err.message);
    }
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    setPwError(null);
    const errors = validatePassword(pwNew);
    if (errors.length > 0) { setPwError(errors.join(' · ')); return; }
    if (pwNew !== pwConfirm) { setPwError('Las contraseñas nuevas no coinciden.'); return; }
    setPwLoading(true);
    try {
      await updatePassword({ oldPassword: pwOld, newPassword: pwNew });
      setPwMsg('Contraseña actualizada correctamente.');
      setPwOld(''); setPwNew(''); setPwConfirm('');
    } catch (err) {
      setPwError(err.message ?? 'Error al cambiar la contraseña.');
    } finally {
      setPwLoading(false);
    }
  };

  const displayName = nombre || perfil?.nombre || user?.name || user?.email || '';
  const pwErrors = pwNew ? validatePassword(pwNew) : [];

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>

      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ background: 'var(--accent-amber)', width: 3, height: 20, borderRadius: 2, display: 'inline-block' }} />
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
          Mi perfil
        </span>
      </div>

      {/* Avatar preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: avatarColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 20, color: 'white',
          flexShrink: 0,
        }}>
          {getInitials(displayName || user?.email || '')}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
            {displayName || user?.email}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
            {user?.email}
          </div>
        </div>
      </div>

      {/* Información personal */}
      <Section icon={User} title="Información personal">
        {loading ? (
          <div style={{ height: 60, background: 'var(--border)', borderRadius: 6, animation: 'shimmer 1.5s infinite' }} />
        ) : (
          <>
            <Field label="Nombre completo">
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} placeholder="Tu nombre" />
            </Field>
            <Field label="Correo electrónico">
              <input value={user?.email ?? ''} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
            </Field>

            {/* Selector de color de avatar */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 8 }}>
                Color de avatar
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {AVATAR_COLORS.map(c => (
                  <button key={c.value} title={c.label} onClick={() => handleAvatarColor(c.value)} style={{
                    width: 28, height: 28, borderRadius: 7, background: c.value, border: 'none',
                    cursor: 'pointer', position: 'relative',
                    outline: avatarColor === c.value ? `2px solid ${c.value}` : 'none',
                    outlineOffset: 2,
                  }}>
                    {avatarColor === c.value && (
                      <Check size={14} style={{ color: 'white', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {infoMsg && (
              <div style={{ padding: '8px 12px', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 7, color: '#16a34a', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={13} /> {infoMsg}
              </div>
            )}
            {(infoError || saveError) && (
              <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13} /> {infoError || saveError}
              </div>
            )}
            <button onClick={handleSaveInfo} disabled={saving} style={{
              padding: '8px 20px', background: 'var(--accent-amber)', border: 'none',
              borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'white',
              opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </>
        )}
      </Section>

      {/* Cambio de contraseña */}
      <Section icon={Lock} title="Cambiar contraseña">
        <Field label="Contraseña actual">
          <input type="password" value={pwOld} onChange={e => setPwOld(e.target.value)} style={inputStyle} autoComplete="current-password" />
        </Field>
        <Field label="Nueva contraseña">
          <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} style={inputStyle} autoComplete="new-password" />
          {pwNew && pwErrors.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {pwErrors.map(e => (
                <span key={e} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontFamily: 'var(--font-data)' }}>
                  {e}
                </span>
              ))}
            </div>
          )}
        </Field>
        <Field label="Confirmar nueva contraseña">
          <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} style={inputStyle} autoComplete="new-password" />
        </Field>

        {pwMsg && (
          <div style={{ padding: '8px 12px', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 7, color: '#16a34a', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={13} /> {pwMsg}
          </div>
        )}
        {pwError && (
          <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} /> {pwError}
          </div>
        )}
        <button onClick={handleChangePassword} disabled={pwLoading || !pwOld || !pwNew || !pwConfirm} style={{
          padding: '8px 20px', background: 'var(--accent-amber)', border: 'none',
          borderRadius: 8, cursor: pwLoading || !pwOld || !pwNew || !pwConfirm ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'white',
          opacity: pwLoading || !pwOld || !pwNew || !pwConfirm ? 0.5 : 1,
        }}>
          {pwLoading ? 'Actualizando…' : 'Cambiar contraseña'}
        </button>
      </Section>

      <style>{`
        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
