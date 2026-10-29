import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  IconoAjustes, IconoCuadricula, IconoInfo, IconoLuna, IconoMundo,
  IconoPanel, IconoSalir, IconoSol, IconoSubir, IconoUbicacion, IconoUsuarios,
} from './Iconos';

import { useAuth } from '../auth/AuthContext';
import { useUsuarioPerfil } from '../hooks/useUsuario';
import pixelrustLogo from '../assets/pixelrust-logo.png';

const AVATAR_STORAGE_KEY = 'corria-avatar-color';
const NAME_STORAGE_KEY = 'corria-display-name';
const FOTO_STORAGE_KEY = 'corria-avatar-foto';

// Mismo esquema de claves por usuario que el Sidebar que reemplaza -- ver
// ese componente (ya no existe) para el porqué: localStorage global
// mezclaba foto/nombre/color entre usuarios de la misma máquina.
function claveDeUsuario(base, email) {
  return email ? `${base}:${email}` : base;
}

// ─────────────────────────────────────────────────────────────
// ITEMS DE NAVEGACIÓN (idénticos a los del Sidebar anterior: mismas
// rutas, mismo filtro por rol -- solo cambia cómo se renderizan)
// ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { path: '/que-es-pixelrust', icon: IconoInfo, label: '¿Qué es PixelRust?' },
  { path: '/dashboard', icon: IconoPanel, label: 'Dashboard' },
  { path: '/upload', icon: IconoSubir, label: 'Nueva medición', roles: ['super_admin', 'admin', 'tecnico'] },
  { path: '/galeria', icon: IconoCuadricula, label: 'Galería' },
  { path: '/zonas', icon: IconoMundo, label: 'Zonas', roles: ['super_admin'] },
  { path: '/puntos', icon: IconoUbicacion, label: 'Puntos', roles: ['super_admin', 'admin', 'tecnico'] },
  { path: '/usuarios', icon: IconoUsuarios, label: 'Usuarios', roles: ['super_admin', 'admin', 'tecnico'] },
  { path: '/configuracion', icon: IconoAjustes, label: 'Configuración' },
];

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const ROL_LABELS = {
  super_admin: 'Superadministrador',
  admin: 'Administrador',
  tecnico: 'Técnico',
  cliente: 'Cliente',
};

function getPrimaryRole(groups = []) {
  if (groups.includes('super_admin')) return 'super_admin';
  if (groups.includes('admin')) return 'admin';
  if (groups.includes('tecnico')) return 'tecnico';
  if (groups.includes('cliente')) return 'cliente';
  return null;
}

// ─────────────────────────────────────────────────────────────
// PESTAÑA DE NAVEGACIÓN
// ─────────────────────────────────────────────────────────────

function NavTab({ item }) {
  const location = useLocation();
  const isActive = item.path === '/galeria'
    ? location.pathname === '/galeria' || location.pathname.startsWith('/galeria/')
    : location.pathname === item.path;

  return (
    <NavLink
      to={item.path}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        minHeight: 44,
        padding: '0 14px',
        textDecoration: 'none',
        fontFamily: 'var(--font-ui)',
        fontSize: 14,
        fontWeight: isActive ? 700 : 500,
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderBottom: isActive ? '3px solid var(--accent-vivid)' : '3px solid transparent',
        whiteSpace: 'nowrap',
        transition: 'color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
      }}
    >
      {item.label}
    </NavLink>
  );
}

// ─────────────────────────────────────────────────────────────
// TOPNAV
// ─────────────────────────────────────────────────────────────

export default function TopNav({ darkMode, onToggleDark, onLogout }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { perfil } = useUsuarioPerfil();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  const colorKey = claveDeUsuario(AVATAR_STORAGE_KEY, user?.email);
  const fotoKey = claveDeUsuario(FOTO_STORAGE_KEY, user?.email);
  const nameKey = claveDeUsuario(NAME_STORAGE_KEY, user?.email);

  const [avatarColor, setAvatarColor] = React.useState(
    () => localStorage.getItem(colorKey) ?? '#B4561F'
  );
  const [avatarFoto, setAvatarFoto] = React.useState(
    () => localStorage.getItem(fotoKey) ?? ''
  );
  const [displayName, setDisplayName] = React.useState(
    () => localStorage.getItem(nameKey) || ''
  );

  // Fuente de verdad real: el perfil del backend (por usuario).
  React.useEffect(() => {
    if (!perfil) return;
    if (typeof perfil.foto_perfil === 'string') {
      setAvatarFoto(perfil.foto_perfil);
      localStorage.setItem(fotoKey, perfil.foto_perfil);
    }
    const nombre = perfil.nombre ?? perfil.name ?? user?.name;
    if (nombre) {
      setDisplayName(nombre);
      localStorage.setItem(nameKey, nombre);
    }
  }, [perfil, user?.name, fotoKey, nameKey]);

  React.useEffect(() => {
    const handler = e => setAvatarColor(e.detail);
    window.addEventListener('corria-avatar-color', handler);
    return () => window.removeEventListener('corria-avatar-color', handler);
  }, []);

  React.useEffect(() => {
    const handler = e => setAvatarFoto(e.detail);
    window.addEventListener('corria-avatar-foto', handler);
    return () => window.removeEventListener('corria-avatar-foto', handler);
  }, []);

  React.useEffect(() => {
    const handler = e => setDisplayName(e.detail);
    window.addEventListener('corria-user-name', handler);
    return () => window.removeEventListener('corria-user-name', handler);
  }, []);

  React.useEffect(() => {
    if (!localStorage.getItem(nameKey) && user?.name) {
      setDisplayName(user.name);
    }
  }, [user?.name, nameKey]);

  // Cerrar el menú de usuario al hacer click afuera o presionar Escape.
  React.useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const groups = user?.groups ?? [];
  const rol = getPrimaryRole(groups);

  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.roles) return true;
    return item.roles.some(r => groups.includes(r));
  });

  const nombreMostrado = displayName || user?.name || user?.email || '';

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '0 24px',
        minHeight: 64,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
        rowGap: 8,
        flexShrink: 0,
        position: 'relative',
        zIndex: 50,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <img
          src={pixelrustLogo}
          alt=""
          style={{ width: 26, height: 23, objectFit: 'contain', flexShrink: 0 }}
        />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 17,
            letterSpacing: '0.03em',
            color: 'var(--accent-amber)',
          }}
        >
          PIXELRUST
        </span>
      </div>

      {/* Navegación */}
      <nav aria-label="Principal" style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
        {visibleItems.map(item => (
          <NavTab key={item.path} item={item} />
        ))}
      </nav>

      {/* Toggle de tema */}
      <button
        type="button"
        onClick={onToggleDark}
        aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        style={{
          width: 44,
          height: 44,
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'transparent',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background var(--dur-fast) var(--ease-out)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-inset)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        {darkMode ? <IconoSol size={18} /> : <IconoLuna size={18} />}
      </button>

      {/* Avatar + menú de usuario */}
      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Menú de ${nombreMostrado || 'usuario'}`}
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            overflow: 'hidden',
            background: avatarFoto ? 'transparent' : '#FFE1CD',
            color: 'var(--accent-amber)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {avatarFoto ? (
            <img src={avatarFoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            getInitials(nombreMostrado)
          )}
        </button>

        {menuOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              minWidth: 200,
              background: 'var(--bg-card-solid)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 8px 24px rgba(64,23,17,0.14)',
              overflow: 'hidden',
              zIndex: 60,
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13,
                color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {nombreMostrado}
              </div>
              {rol && (
                <div style={{
                  fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)',
                  letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 2,
                }}>
                  {ROL_LABELS[rol]}
                </div>
              )}
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); navigate('/configuracion'); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-inset)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <IconoAjustes size={16} /> Mi perfil
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); onLogout(); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--accent-red)', textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-inset)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <IconoSalir size={16} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
