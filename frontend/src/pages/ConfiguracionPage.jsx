import React, { useState, useEffect } from 'react';
import { updatePassword } from 'aws-amplify/auth';
import {
  Settings,
  RefreshCw,
  ShieldCheck,
  Brain,
  Check,
  User,
  Lock,
  AlertCircle,
  Camera,
  X,
} from 'lucide-react';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth } from '../auth/AuthContext';
import { useRefreshKey } from '../hooks/RefreshKeyContext';
import { getDateFormat, setDateFormat as guardarFormatoFecha } from '../utils/dateFormat';
import AvatarCropper from '../components/AvatarCropper';

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

const AVATAR_STORAGE_KEY = 'corria-avatar-color';
const FOTO_STORAGE_KEY = 'corria-avatar-foto';

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

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-page)',
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)',
  boxSizing: 'border-box',
};


// ─── Estilos reutilizables ───────────────────────────────────────────────────

const sectionStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'hidden',
  marginBottom: 18,
};

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2-5)',
  padding: '14px 18px',
  borderBottom: '1px solid var(--border)',
};

const labelStyle = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--text-3xs)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-faint)',
  marginBottom: 5,
};

const descriptionStyle = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-2xs)',
  color: 'var(--text-muted)',
  lineHeight: 1.5,
};


// ─── Switch ──────────────────────────────────────────────────────────────────

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      style={{
        width: 38,
        height: 21,
        padding: 2,
        border: 'none',
        borderRadius: 20,
        cursor: 'pointer',
        background: checked
          ? 'var(--accent-blue)'
          : 'var(--border-bright)',
        position: 'relative',
        transition: 'background 0.15s ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 17,
          height: 17,
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          // translateX en vez de animar `left`: el desplazamiento corre en GPU
          // y no dispara layout en cada frame.
          transform: `translateX(${checked ? 17 : 0}px)`,
          transition: 'transform 0.15s ease-out',
        }}
      />
    </button>
  );
}


// ─── Fila de configuración ──────────────────────────────────────────────────

function SettingRow({ title, description, children, last = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
        padding: '14px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 3,
          }}
        >
          {title}
        </div>

        {description && (
          <div style={descriptionStyle}>
            {description}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}


// ─── Encabezado de sección ───────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div style={sectionHeaderStyle}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'rgba(156,54,16,0.08)',
          border: '1px solid rgba(156,54,16,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-blue)',
          flexShrink: 0,
        }}
      >
        <Icon size={16} strokeWidth={1.8} />
      </div>

      <div>
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </div>

        {description && (
          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-3xs)',
              color: 'var(--text-muted)',
              marginTop: 2,
            }}
          >
            {description}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Campo de formulario (label + control) ──────────────────────────────────
// `htmlFor` es obligatorio: sin el, el label queda de hermano suelto del control
// y un lector de pantalla no lo anuncia al enfocarlo.
function Field({ label, htmlFor, children }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <label htmlFor={htmlFor} style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}


// ─── Página de configuración ─────────────────────────────────────────────────
// Antes "Mi perfil" (/perfil) y "Configuración" (/configuracion) eran dos
// pestañas separadas -- se unieron en una sola porque no había razón real
// para partir "mis datos" de "mis preferencias".

export default function ConfiguracionPage() {
  const { user } = useAuth();
  const { perfil, loading, saving, saveError, actualizarPerfil } = useUsuarioPerfil();

  const [avatarColor, setAvatarColor] = useState(() => localStorage.getItem(AVATAR_STORAGE_KEY) ?? '#1432A3');
  const [avatarFoto, setAvatarFoto] = useState(() => localStorage.getItem(FOTO_STORAGE_KEY) ?? '');
  const [mostrarCropper, setMostrarCropper] = useState(false);
  const [nombre, setNombre] = useState('');
  const [infoMsg, setInfoMsg] = useState(null);
  const [infoError, setInfoError] = useState(null);

  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwError, setPwError] = useState(null);

  // Modo oscuro: el estado real vive en AppLayout (aplica el atributo al
  // documento). Acá solo se refleja vía localStorage + evento, mismo patrón
  // que el color/foto de avatar.
  const [darkMode, setDarkModeLocal] = useState(
    () => localStorage.getItem('corria-darkmode') === 'true'
  );
  const { autoRefresh, setAutoRefresh } = useRefreshKey();
  const [dateFormat, setDateFormatLocal] = useState(() => getDateFormat());

  useEffect(() => {
    const handler = (e) => setDarkModeLocal(e.detail);
    window.addEventListener('corria-darkmode', handler);
    return () => window.removeEventListener('corria-darkmode', handler);
  }, []);

  const handleDarkModeChange = (value) => {
    setDarkModeLocal(value);
    localStorage.setItem('corria-darkmode', String(value));
    window.dispatchEvent(new CustomEvent('corria-darkmode', { detail: value }));
  };

  const handleDateFormatChange = (value) => {
    setDateFormatLocal(value);
    guardarFormatoFecha(value);
  };

  useEffect(() => {
    if (perfil) setNombre(perfil.nombre ?? perfil.name ?? user?.name ?? '');
    // foto_perfil viene del backend -- localStorage es solo un caché para
    // que el sidebar no parpadee sin foto antes de que cargue el perfil.
    if (perfil && typeof perfil.foto_perfil === 'string') {
      setAvatarFoto(perfil.foto_perfil);
      localStorage.setItem(FOTO_STORAGE_KEY, perfil.foto_perfil);
    }
  }, [perfil, user]);

  const handleAvatarColor = (color) => {
    setAvatarColor(color);
    localStorage.setItem(AVATAR_STORAGE_KEY, color);
    window.dispatchEvent(new CustomEvent('corria-avatar-color', { detail: color }));
  };

  const handleFotoConfirmada = async (dataUrl) => {
    setInfoError(null);
    try {
      await actualizarPerfil({ foto_perfil: dataUrl });
      setAvatarFoto(dataUrl);
      localStorage.setItem(FOTO_STORAGE_KEY, dataUrl);
      window.dispatchEvent(new CustomEvent('corria-avatar-foto', { detail: dataUrl }));
      setMostrarCropper(false);
      setInfoMsg('Foto de perfil actualizada.');
    } catch (err) {
      setInfoError(err.message);
    }
  };

  const handleQuitarFoto = async () => {
    setInfoError(null);
    try {
      await actualizarPerfil({ foto_perfil: '' });
      setAvatarFoto('');
      localStorage.removeItem(FOTO_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('corria-avatar-foto', { detail: '' }));
    } catch (err) {
      setInfoError(err.message);
    }
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
    <>
      <style>{`
        .config-select,
        .config-input {
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .config-select:focus,
        .config-input:focus {
          border-color: var(--accent-blue) !important;
          box-shadow: 0 0 0 2px rgba(156,54,16,0.08);
        }

        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <div style={{ padding: 'var(--space-5)', maxWidth: 1000, margin: '0 auto' }}>

        {/* ── Encabezado ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 22,
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2-5)',
                marginBottom: 5,
              }}
            >
              <span
                style={{
                  background: 'var(--accent-amber)',
                  width: 3,
                  height: 20,
                  borderRadius: 2,
                  display: 'inline-block',
                }}
              />

              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-primary)',
                }}
              >
                Configuración
              </span>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                paddingLeft: 13,
              }}
            >
              Tu perfil, las preferencias y la información del sistema.
            </div>
          </div>
        </div>


        {/* ── Mi perfil: avatar ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={User}
            title="Mi perfil"
            description="Foto, nombre y datos de tu cuenta."
          />

          <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {avatarFoto ? (
              <img src={avatarFoto} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: avatarColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 20, color: 'white',
                flexShrink: 0,
              }}>
                {getInitials(displayName || user?.email || '')}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>
                {displayName || user?.email}
              </div>
              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 2 }}>
                {user?.email}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button" onClick={() => setMostrarCropper(v => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', background: 'var(--bg-inset)', border: '1px solid var(--border)',
                  borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--accent-amber)',
                }}
              >
                <Camera size={14} /> {mostrarCropper ? 'Cerrar' : 'Cambiar foto'}
              </button>
              {avatarFoto && (
                <button
                  type="button" onClick={handleQuitarFoto} title="Quitar foto"
                  style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', color: '#dc2626', display: 'flex' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {mostrarCropper && (
              <div style={{ width: '100%', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)', marginTop: 'var(--space-2)' }}>
                <AvatarCropper onConfirm={handleFotoConfirmada} onCancel={() => setMostrarCropper(false)} />
              </div>
            )}
          </div>
        </div>


        {/* ── Mi perfil: información personal ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={User}
            title="Información personal"
            description="Nombre, correo y color de avatar."
          />

          <div style={{ padding: 18 }}>
            {loading ? (
              <div style={{ height: 60, background: 'var(--border)', borderRadius: 6, animation: 'shimmer 1.5s infinite' }} />
            ) : (
              <>
                <Field label="Nombre completo" htmlFor="perfil-nombre">
                  <input
                    id="perfil-nombre" name="name" autoComplete="name"
                    value={nombre} onChange={e => setNombre(e.target.value)}
                    className="config-input"
                    style={inputStyle} placeholder="Tu nombre"
                  />
                </Field>
                <Field label="Correo electrónico" htmlFor="perfil-email">
                  <input
                    id="perfil-email" name="email" type="email" autoComplete="email"
                    value={user?.email ?? ''} disabled
                    style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
                  />
                </Field>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                  {/* span y no label: encabeza un grupo de botones, no un control unico. */}
                  <span id="avatar-color-titulo" style={{ ...labelStyle, display: 'block', marginBottom: 'var(--space-2)' }}>
                    Color de avatar
                  </span>
                  {/* Los botones solo muestran color: sin aria-label no tienen nombre
                      accesible, y `title` no alcanza como sustituto. */}
                  <div role="group" aria-labelledby="avatar-color-titulo" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {AVATAR_COLORS.map(c => (
                      <button key={c.value} type="button" title={c.label}
                        aria-label={`Color ${c.label}`}
                        aria-pressed={avatarColor === c.value}
                        onClick={() => handleAvatarColor(c.value)} style={{
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
                  <div style={{ padding: '8px 12px', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 7, color: '#16a34a', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={13} /> {infoMsg}
                  </div>
                )}
                {(infoError || saveError) && (
                  <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={13} /> {infoError || saveError}
                  </div>
                )}
                <button onClick={handleSaveInfo} disabled={saving} style={{
                  padding: '8px 20px', background: 'var(--accent-amber)', border: 'none',
                  borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'white',
                  opacity: saving ? 0.6 : 1,
                }}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </>
            )}
          </div>
        </div>


        {/* ── Mi perfil: contraseña ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={Lock}
            title="Cambiar contraseña"
          />

          <div style={{ padding: 18 }}>
            <Field label="Contraseña actual" htmlFor="perfil-pw-actual">
              <input id="perfil-pw-actual" name="current-password" type="password" value={pwOld} onChange={e => setPwOld(e.target.value)} className="config-input" style={inputStyle} autoComplete="current-password" />
            </Field>
            <Field label="Nueva contraseña" htmlFor="perfil-pw-nueva">
              <input id="perfil-pw-nueva" name="new-password" type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} className="config-input" style={inputStyle} autoComplete="new-password" />
              {pwNew && pwErrors.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                  {pwErrors.map(e => (
                    <span key={e} style={{ fontSize: 'var(--text-3xs)', padding: '2px 7px', borderRadius: 4, background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontFamily: 'var(--font-data)' }}>
                      {e}
                    </span>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Confirmar nueva contraseña" htmlFor="perfil-pw-confirmar">
              <input id="perfil-pw-confirmar" name="confirm-password" type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} className="config-input" style={inputStyle} autoComplete="new-password" />
            </Field>

            {pwMsg && (
              <div style={{ padding: '8px 12px', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 7, color: '#16a34a', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={13} /> {pwMsg}
              </div>
            )}
            {pwError && (
              <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 7, color: '#dc2626', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13} /> {pwError}
              </div>
            )}
            <button onClick={handleChangePassword} disabled={pwLoading || !pwOld || !pwNew || !pwConfirm} style={{
              padding: '8px 20px', background: 'var(--accent-amber)', border: 'none',
              borderRadius: 8, cursor: pwLoading || !pwOld || !pwNew || !pwConfirm ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'white',
              opacity: pwLoading || !pwOld || !pwNew || !pwConfirm ? 0.5 : 1,
            }}>
              {pwLoading ? 'Actualizando…' : 'Cambiar contraseña'}
            </button>
          </div>
        </div>


        {/* ── Preferencias del sistema ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={Settings}
            title="Preferencias del sistema"
            description="Configura el comportamiento general de la plataforma."
          />

          <SettingRow
            title="Modo de visualización"
            description="Selecciona cómo deseas visualizar la plataforma."
          >
            <select
              className="config-select"
              value={darkMode ? 'oscuro' : 'claro'}
              onChange={e => handleDarkModeChange(e.target.value === 'oscuro')}
              style={{
                padding: '7px 30px 7px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg-page)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              <option value="claro">Claro</option>
              <option value="oscuro">Oscuro</option>
            </select>
          </SettingRow>

          <SettingRow
            title="Actualización automática"
            description="Actualizar periódicamente la información mostrada en el sistema."
          >
            <Switch
              checked={autoRefresh}
              onChange={setAutoRefresh}
            />
          </SettingRow>

          <SettingRow
            title="Formato de fecha"
            description="Formato utilizado para mostrar las fechas de mediciones y registros."
            last
          >
            <select
              className="config-select"
              value={dateFormat}
              onChange={e => handleDateFormatChange(e.target.value)}
              style={{
                padding: '7px 30px 7px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg-page)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              <option value="DD/MM/AAAA">DD/MM/AAAA</option>
              <option value="MM/DD/AAAA">MM/DD/AAAA</option>
              <option value="AAAA-MM-DD">AAAA-MM-DD</option>
            </select>
          </SettingRow>
        </div>


        {/* ── Información del sistema ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={ShieldCheck}
            title="Información del sistema"
            description="Información general de la plataforma y del modelo de análisis."
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
            }}
          >

            <div
              style={{
                padding: '15px 18px',
                borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={labelStyle}>Estado del sistema</div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--accent-green)',
                    display: 'inline-block',
                  }}
                />
                Operativo
              </div>
            </div>


            <div
              style={{
                padding: '15px 18px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={labelStyle}>Versión</div>

              <div
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)',
                }}
              >
                v1.0.0
              </div>
            </div>


            <div
              style={{
                padding: '15px 18px',
                borderRight: '1px solid var(--border)',
              }}
            >
              <div style={labelStyle}>Modelo de IA</div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)',
                }}
              >
                <Brain
                  size={14}
                  color="var(--accent-blue)"
                />
                Producción_v2
              </div>
            </div>


            <div
              style={{
                padding: '15px 18px',
              }}
            >
              <div style={labelStyle}>Actualización de datos</div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw
                  size={14}
                  color="var(--accent-blue)"
                />
                Automática
              </div>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}