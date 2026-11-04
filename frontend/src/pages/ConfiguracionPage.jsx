import { AvisoEnLinea } from '../components/Aviso';
import React, { useState, useEffect, useRef } from 'react';
import { updatePassword } from 'aws-amplify/auth';
import {
  IconoActualizar,
  IconoAjustes,
  IconoBuscar,
  IconoCamara,
  IconoCandado,
  IconoCerrar,
  IconoCheck,
  IconoModeloIA,
  IconoSeguridad,
  IconoUsuario,
} from '../components/Iconos';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import { useAuth, parseAuthError } from '../auth/AuthContext';
import { getDateFormat, setDateFormat as guardarFormatoFecha } from '../utils/dateFormat';
import AvatarCropper from '../components/AvatarCropper';
import ZoomPan from '../components/ZoomPan';
import { VISTA_INICIAL } from '../lib/zoomPan';
import { RADIO_AVATAR_PORCENTAJE, radioAvatarPx } from '../lib/avatarCrop';
import Skeleton, { SkeletonLinea, SkeletonCaja } from '../components/Skeleton';
import PasswordChecklist from '../components/PasswordChecklist';
import { isPasswordValid } from '../lib/passwordPolicy';

const AVATAR_COLORS = [
  { value: '#1432A3', label: 'Azul marino' },
  { value: '#2563eb', label: 'Azul' },
  { value: '#16a34a', label: 'Verde' },
  { value: '#dc2626', label: 'Rojo' },
  { value: '#7c3aed', label: 'Violeta' },
  { value: '#0891b2', label: 'Cian' },
  { value: '#db2777', label: 'Rosa' },
  { value: '#64748b', label: 'Gris' },
];

const ROL_LABELS = {
  super_admin: 'Superadministrador',
  admin: 'Administrador',
  tecnico: 'Técnico',
  cliente: 'Cliente',
};

function obtenerEtiquetaRol(groups = [], rolPerfil = '') {
  if (rolPerfil && ROL_LABELS[rolPerfil]) return ROL_LABELS[rolPerfil];
  if (groups.includes('super_admin')) return ROL_LABELS.super_admin;
  if (groups.includes('admin')) return ROL_LABELS.admin;
  if (groups.includes('tecnico')) return ROL_LABELS.tecnico;
  if (groups.includes('cliente')) return ROL_LABELS.cliente;
  return 'Usuario';
}

const AVATAR_STORAGE_KEY = 'corria-avatar-color';
const FOTO_STORAGE_KEY = 'corria-avatar-foto';
const NAME_STORAGE_KEY = 'corria-display-name';

// Mismo fix que Sidebar.jsx: estas claves eran globales, así que dos
// usuarios distintos en el mismo navegador se pisaban la foto/nombre.
// Claves por usuario (incluyen email) para no mezclar sesión local entre cuentas.
function claveDeUsuario(base, email) {
  return email ? `${base}:${email}` : base;
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
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

const infoValorStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
};

const descriptionStyle = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-2xs)',
  color: 'var(--text-muted)',
  lineHeight: 1.5,
};


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
// `htmlFor` es obligatorio: sin él, el label queda de hermano suelto del control
// y un lector de pantalla no lo anuncia al enfocarlo.
function Field({ label, htmlFor, children }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <label htmlFor={htmlFor} style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}


// ─── Visor modal (lightbox) de foto de perfil ────────────────────────────────

function VisorFotoPerfilModal({ fotoUrl, displayName, onClose, onCambiarFoto }) {
  const dialogRef = useRef(null);
  const [vista, setVista] = useState(VISTA_INICIAL);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return undefined;
    if (!dlg.open) dlg.showModal();
    // Con el visor abierto la rueda hace zoom: la página de fondo no debe desplazarse.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflowPrevio;
      if (dlg.open) dlg.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="lote-dialog"
      aria-label="Foto de perfil en tamaño completo"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div
        className="lote-dialog-panel"
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--border-strong)',
          borderRadius: 16,
          padding: 18,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>
              Foto de perfil
            </div>
            {displayName && (
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {displayName}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor de foto"
            className="btn-accion"
            style={{ borderRadius: 8, padding: '6px 8px' }}
          >
            <IconoCerrar size={16} />
          </button>
        </div>

        <ZoomPan
          vista={vista}
          onVista={setVista}
          ruedaSinCtrl
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1 / 1',
            // The container only clips the zoomed image (square); the rounding lives on
            // the <img>, so the zoom controls and the hint are never cut by a rounded mask.
            overflow: 'hidden',
          }}
        >
          <img
            src={fotoUrl}
            alt={`Foto de perfil de ${displayName || 'usuario'}`}
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              borderRadius: RADIO_AVATAR_PORCENTAJE,
              background: 'var(--bg-inset)',
              border: '1px solid var(--border)',
              boxSizing: 'border-box',
            }}
          />
        </ZoomPan>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              onClose(false); // the cropper takes the focus
              onCambiarFoto();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              background: 'var(--bg-inset)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 'var(--text-xs)',
              color: 'var(--accent-amber)',
            }}
          >
            <IconoCamara size={14} /> Cambiar foto
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 16px',
              background: 'var(--accent-amber)',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 'var(--text-xs)',
              color: 'white',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}


// ─── Página de configuración ─────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const { user } = useAuth();
  const { perfil, loading, saving, saveError, actualizarPerfil } = useUsuarioPerfil();

  const colorKey = claveDeUsuario(AVATAR_STORAGE_KEY, user?.email);
  const fotoKey = claveDeUsuario(FOTO_STORAGE_KEY, user?.email);
  const nameKey = claveDeUsuario(NAME_STORAGE_KEY, user?.email);

  const [avatarColor, setAvatarColor] = useState(() => localStorage.getItem(colorKey) ?? '#1432A3');
  const [avatarFoto, setAvatarFoto] = useState(() => localStorage.getItem(fotoKey) ?? '');
  const [mostrarCropper, setMostrarCropper] = useState(false);
  const [visorFotoAbierto, setVisorFotoAbierto] = useState(false);
  const avatarBtnRef = useRef(null);
  // Closing the viewer returns focus to the avatar button that opened it.
  const cerrarVisorFoto = (devolverFoco = true) => {
    setVisorFotoAbierto(false);
    if (devolverFoco !== false) requestAnimationFrame(() => avatarBtnRef.current?.focus());
  };
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

  // foto_perfil viene del backend; localStorage es solo un caché para que el
  // sidebar no parpadee sin foto antes de que cargue el perfil.
  useEffect(() => {
    if (perfil) setNombre(perfil.nombre ?? perfil.name ?? user?.name ?? '');
    if (perfil && typeof perfil.foto_perfil === 'string') {
      setAvatarFoto(perfil.foto_perfil);
      localStorage.setItem(fotoKey, perfil.foto_perfil);
    }
  }, [perfil, user, fotoKey]);

  const handleAvatarColor = (color) => {
    setAvatarColor(color);
    localStorage.setItem(colorKey, color);
    window.dispatchEvent(new CustomEvent('corria-avatar-color', { detail: color }));
  };

  const handleFotoConfirmada = async (dataUrl) => {
    setInfoError(null);
    try {
      await actualizarPerfil({ foto_perfil: dataUrl });
      setAvatarFoto(dataUrl);
      localStorage.setItem(fotoKey, dataUrl);
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
      localStorage.removeItem(fotoKey);
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
      localStorage.setItem(nameKey, nombre);
      window.dispatchEvent(new CustomEvent('corria-user-name', { detail: nombre }));
      setInfoMsg('Perfil actualizado correctamente.');
    } catch (err) {
      setInfoError(err.message);
    }
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    setPwError(null);
    if (!isPasswordValid(pwNew)) { setPwError('La nueva contraseña no cumple todos los requisitos.'); return; }
    if (pwNew !== pwConfirm) { setPwError('Las contraseñas nuevas no coinciden.'); return; }
    setPwLoading(true);
    try {
      await updatePassword({ oldPassword: pwOld, newPassword: pwNew });
      setPwMsg('Contraseña actualizada correctamente.');
      setPwOld(''); setPwNew(''); setPwConfirm('');
    } catch (err) {
      setPwError(parseAuthError(err, { contexto: 'cambio' }));
    } finally {
      setPwLoading(false);
    }
  };

  const displayName = nombre || perfil?.nombre || user?.name || user?.email || '';
  const pwBloqueado = pwLoading || !pwOld || !isPasswordValid(pwNew) || !pwConfirm;
  const etiquetaRol = obtenerEtiquetaRol(user?.groups ?? [], perfil?.rol);
  // Los grupos de Cognito mandan; el rol del perfil solo cubre cuando aún no hay grupos.
  const grupos = user?.groups ?? [];
  const esSoloCliente =
    !['super_admin', 'admin', 'tecnico'].some(r => grupos.includes(r)) &&
    (grupos.includes('cliente') || perfil?.rol === 'cliente');
  const nombreZona = perfil?.empresa_nombre || (user?.groups?.includes('super_admin') ? 'Acceso global' : '');

  return (
    <>
      <style>{`
        .config-select,
        .config-input {
          transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
        }

        .config-select:focus,
        .config-input:focus {
          border-color: var(--accent-blue) !important;
          box-shadow: 0 0 0 2px rgba(156,54,16,0.08);
        }

        /* Grilla de información del sistema: 1 columna en móvil y 2 en escritorio.
           Cada celda dibuja derecha+abajo y el contenedor sobresale 1px para que
           el overflow:hidden de la sección recorte los bordes sobrantes. */
        .config-info-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          margin: 0 -1px -1px 0;
        }
        .config-info-cell {
          padding: 15px 18px;
          border-right: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }
        @media (min-width: 800px) {
          .config-info-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        .avatar-preview-btn {
          position: relative;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: ${radioAvatarPx(56)}px;
          flex-shrink: 0;
          overflow: hidden;
        }
        .avatar-preview-btn__overlay {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity var(--dur-fast) var(--ease-out);
        }
        .avatar-preview-btn:hover .avatar-preview-btn__overlay,
        .avatar-preview-btn:focus-visible .avatar-preview-btn__overlay {
          opacity: 1;
        }
      `}</style>

      <div style={{ padding: 'var(--space-5)', maxWidth: 1360, width: '100%', margin: '0 auto' }}>

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
              Tu perfil, las preferencias de visualización, la seguridad de tu cuenta y la información del sistema.
            </div>
          </div>
        </div>


        {/* ── 1. Mi perfil e información personal ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={IconoUsuario}
            title="Mi perfil e información personal"
            description="Foto de perfil, nombre para mostrar, correo electrónico y color de avatar."
          />

          {/* Bloque superior: Foto + resumen + botón Cambiar foto */}
          <div style={{ padding: 18, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {avatarFoto ? (
              <button
                type="button"
                ref={avatarBtnRef}
                className="avatar-preview-btn"
                onClick={() => setVisorFotoAbierto(true)}
                aria-label="Ver foto de perfil en tamaño completo"
                title="Haz clic para ver la foto en grande"
              >
                <img
                  src={avatarFoto}
                  alt="Foto de perfil"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: radioAvatarPx(56),
                    objectFit: 'cover',
                    display: 'block',
                    border: `2px solid ${avatarColor}`,
                    boxSizing: 'border-box',
                  }}
                />
                <span className="avatar-preview-btn__overlay" aria-hidden="true">
                  <IconoBuscar size={18} />
                </span>
              </button>
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: radioAvatarPx(56),
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
              {avatarFoto && (
                <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', marginTop: 3 }}>
                  Haz clic en la foto para verla en tamaño completo.
                </div>
              )}
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
                <IconoCamara size={14} /> {mostrarCropper ? 'Cerrar recorte' : 'Cambiar foto'}
              </button>
              {avatarFoto && (
                <button
                  type="button" onClick={handleQuitarFoto} title="Quitar foto" aria-label="Quitar foto"
                  className="btn-accion"
                  style={{ borderRadius: 8, padding: '7px 9px' }}
                >
                  <IconoCerrar size={14} />
                </button>
              )}
            </div>
            {mostrarCropper && (
              <div style={{ width: '100%', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)', marginTop: 'var(--space-2)' }}>
                <AvatarCropper onConfirm={handleFotoConfirmada} onCancel={() => setMostrarCropper(false)} />
              </div>
            )}
          </div>

          {/* Bloque inferior: Campos de información personal */}
          <div style={{ padding: 18 }}>
            {loading ? (
              // Mismo esqueleto que el formulario: cada texto dentro de un elemento con
              // la tipografía real (labelStyle / inputStyle), así el alto no cambia.
              <div aria-busy="true">
                {[0, 1].map(i => (
                  <div key={i} style={{ marginBottom: 'var(--space-4)' }}>
                    <span style={labelStyle}><SkeletonLinea width={110} /></span>
                    <div style={{ ...inputStyle, display: 'inline-block' }}><SkeletonLinea width="35%" /></div>
                  </div>
                ))}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <span style={{ ...labelStyle, display: 'block', marginBottom: 'var(--space-2)' }}>
                    <SkeletonLinea width={90} />
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {Array.from({ length: AVATAR_COLORS.length }, (_, i) => (
                      <Skeleton key={i} width={28} height={28} radius={7} />
                    ))}
                  </div>
                </div>
                <SkeletonCaja
                  width={100}
                  style={{
                    padding: '8px 20px', borderRadius: 8,
                    fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)',
                  }}
                />
              </div>
            ) : (
              <>
                <Field label="Nombre completo" htmlFor="perfil-nombre">
                  <input
                    id="perfil-nombre" name="name" autoComplete="name"
                    value={nombre} onChange={e => setNombre(e.target.value)}
                    className="config-input"
                    style={inputStyle} placeholder="Ej.: Ana Ejemplo"
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
                  <span id="avatar-color-titulo" style={{ ...labelStyle, display: 'block', marginBottom: 4 }}>
                    Color de tu avatar
                  </span>
                  <div style={{ ...descriptionStyle, marginBottom: 'var(--space-2)' }}>
                    Se usa de fondo para tus iniciales y como borde de tu foto.
                  </div>
                  {/* Los botones solo muestran color: sin aria-label no tendrían nombre accesible. */}
                  <div
                    role="group"
                    aria-labelledby="avatar-color-titulo"
                    style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
                  >
                    {AVATAR_COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.label}
                        aria-label={`Color ${c.label}`}
                        aria-pressed={avatarColor === c.value}
                        onClick={() => handleAvatarColor(c.value)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: c.value,
                          border: 'none',
                          cursor: 'pointer',
                          position: 'relative',
                          outline: avatarColor === c.value ? `2px solid ${c.value}` : 'none',
                          outlineOffset: 2,
                        }}
                      >
                        {avatarColor === c.value && (
                          <IconoCheck size={14} style={{ color: 'white', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {infoMsg && (
                  <AvisoEnLinea tone="exito" style={{ marginBottom: 'var(--space-3)' }}>{infoMsg}</AvisoEnLinea>
                )}
                {(infoError || saveError) && (
                  <AvisoEnLinea tone="error" style={{ marginBottom: 'var(--space-3)' }}>{infoError || saveError}</AvisoEnLinea>
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


        {/* ── 2. Preferencias de visualización ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={IconoAjustes}
            title="Preferencias de visualización"
            description="Ajusta el tema visual y el formato de fechas en toda la plataforma."
          />

          <SettingRow
            title="Modo de visualización"
            description="Selecciona cómo deseas visualizar la plataforma."
          >
            <select
              aria-label="Modo de visualización"
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
            title="Formato de fecha"
            description="Formato utilizado para mostrar las fechas de mediciones y registros."
            last
          >
            <select
              aria-label="Formato de fecha"
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


        {/* ── 3. Seguridad ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={IconoCandado}
            title="Cambiar contraseña"
            description="Actualiza la contraseña de acceso de tu cuenta."
          />

          <div style={{ padding: 18 }}>
            <Field label="Contraseña actual" htmlFor="perfil-pw-actual">
              <input id="perfil-pw-actual" name="current-password" type="password" value={pwOld} onChange={e => setPwOld(e.target.value)} className="config-input" style={inputStyle} autoComplete="current-password" />
            </Field>
            <Field label="Nueva contraseña" htmlFor="perfil-pw-nueva">
              <input id="perfil-pw-nueva" name="new-password" aria-describedby="perfil-pw-requisitos" type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} className="config-input" style={inputStyle} autoComplete="new-password" />
              <PasswordChecklist id="perfil-pw-requisitos" password={pwNew} />
            </Field>
            <Field label="Confirmar nueva contraseña" htmlFor="perfil-pw-confirmar">
              <input id="perfil-pw-confirmar" name="confirm-password" type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} className="config-input" style={inputStyle} autoComplete="new-password" />
            </Field>

            {pwMsg && (
              <AvisoEnLinea tone="exito" style={{ marginBottom: 'var(--space-3)' }}>{pwMsg}</AvisoEnLinea>
            )}
            {pwError && (
              <AvisoEnLinea tone="error" style={{ marginBottom: 'var(--space-3)' }}>{pwError}</AvisoEnLinea>
            )}
            <button onClick={handleChangePassword} disabled={pwBloqueado} style={{
              padding: '8px 20px', background: 'var(--accent-amber)', border: 'none',
              borderRadius: 8, cursor: pwBloqueado ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'white',
              opacity: pwBloqueado ? 0.5 : 1,
            }}>
              {pwLoading ? 'Actualizando…' : 'Cambiar contraseña'}
            </button>
          </div>
        </div>


        {/* ── 4. Información del sistema (grilla de 2 columnas en escritorio, 1 en móvil) ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={IconoSeguridad}
            title="Información del sistema"
            description={
              esSoloCliente
                ? 'Versión de la plataforma y permisos de tu sesión.'
                : 'Detalles de versión, modelo de análisis y permisos de tu sesión.'
            }
          />

          <div className="config-info-grid">
            <div className="config-info-cell">
              <div style={labelStyle}>Versión</div>
              <div style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                v1.0.0
              </div>
            </div>

            {/* Modelo y refresco de datos son detalle operativo: quien solo consulta
                (cliente) no sube, edita ni elimina, así que no se le muestran. */}
            {!esSoloCliente && (
              <div className="config-info-cell">
                <div style={labelStyle}>Modelo de IA</div>
                <div style={infoValorStyle}>
                  <IconoModeloIA size={14} color="var(--accent-blue)" />
                  U-Net + separador de placa (ONNX)
                </div>
              </div>
            )}

            {!esSoloCliente && (
              <div className="config-info-cell">
                <div style={labelStyle}>Actualización de datos</div>
                <div style={infoValorStyle}>
                  <IconoActualizar size={14} color="var(--accent-blue)" />
                  Al subir, editar o eliminar
                </div>
              </div>
            )}

            <div className="config-info-cell">
              <div style={labelStyle}>Tu rol y acceso</div>
              <div style={infoValorStyle}>
                <IconoUsuario size={14} color="var(--accent-blue)" />
                <span>
                  {etiquetaRol}
                  {nombreZona ? ` · ${nombreZona}` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {visorFotoAbierto && avatarFoto && (
        <VisorFotoPerfilModal
          fotoUrl={avatarFoto}
          displayName={displayName || user?.email}
          onClose={cerrarVisorFoto}
          onCambiarFoto={() => setMostrarCropper(true)}
        />
      )}
    </>
  );
}
