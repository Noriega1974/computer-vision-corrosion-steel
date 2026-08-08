import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Upload, LayoutGrid,
  Factory, Users, Settings, LogOut, ChevronLeft,
  ChevronRight, X, User,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const AVATAR_STORAGE_KEY = 'corria-avatar-color';
const NAME_STORAGE_KEY   = 'corria-display-name';

// ─── Definición de items de navegación ───────────────────────────────────────
const NAV_ITEMS = [
  { path: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/upload',       icon: Upload,          label: 'Subir medición', roles: ['admin', 'tecnico'] },
  { path: '/galeria',      icon: LayoutGrid,      label: 'Galería' },
  { divider: true },
  { path: '/plantas',      icon: Factory,         label: 'Plantas',        roles: ['admin', 'tecnico'] },
  { path: '/usuarios',     icon: Users,           label: 'Usuarios',       roles: ['admin'] },
  { divider: true },
  { path: '/perfil',       icon: User,            label: 'Mi perfil' },
  { path: '/configuracion', icon: Settings,       label: 'Configuración',  roles: ['admin'] },
];

// Iniciales del usuario para el avatar
function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const ROL_LABELS = { admin: 'Administrador', tecnico: 'Técnico', cliente: 'Cliente' };

function getPrimaryRole(groups = []) {
  if (groups.includes('admin')) return 'admin';
  if (groups.includes('tecnico')) return 'tecnico';
  if (groups.includes('cliente')) return 'cliente';
  return null;
}

// ─── Componente NavItem ───────────────────────────────────────────────────────
function NavItem({ item, collapsed }) {
  const location = useLocation();
  // El ítem está activo si la ruta actual empieza con el path del ítem
  // (salvo /galeria que no debe activarse en /galeria/detalle para el check general)
  const isActive = item.path === '/galeria'
    ? location.pathname === '/galeria' || location.pathname.startsWith('/galeria/')
    : location.pathname === item.path;

  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      style={{ textDecoration: 'none' }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 10,
        padding: collapsed ? '10px 0' : '9px 14px',
        marginBottom: 2,
        borderRadius: 8,
        cursor: 'pointer',
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: isActive ? 'var(--nav-active-bg)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent-amber)' : '2px solid transparent',
        transition: 'background 0.13s',
        color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
      }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      >
        <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
        {!collapsed && (
          <span style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: isActive ? 600 : 400,
            fontSize: 13,
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}>
            {item.label}
          </span>
        )}
      </div>
    </NavLink>
  );
}

// ─── Componente principal Sidebar ─────────────────────────────────────────────
export default function Sidebar({ collapsed, isMobile, onToggle, onLogout }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [avatarColor, setAvatarColor] = React.useState(() => localStorage.getItem(AVATAR_STORAGE_KEY) ?? '#1432A3');
  const [displayName, setDisplayName] = React.useState(() => localStorage.getItem(NAME_STORAGE_KEY) || '');
  React.useEffect(() => {
    const handler = (e) => setAvatarColor(e.detail);
    window.addEventListener('corria-avatar-color', handler);
    return () => window.removeEventListener('corria-avatar-color', handler);
  }, []);
  React.useEffect(() => {
    const handler = (e) => setDisplayName(e.detail);
    window.addEventListener('corria-user-name', handler);
    return () => window.removeEventListener('corria-user-name', handler);
  }, []);
  React.useEffect(() => {
    if (!localStorage.getItem(NAME_STORAGE_KEY) && user?.name) setDisplayName(user.name);
  }, [user?.name]);
  const groups = user?.groups ?? [];
  const rol = getPrimaryRole(groups);

  // Filtrar items según el rol del usuario
  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.divider) return true;
    if (!item.roles) return true;
    return item.roles.some(r => groups.includes(r));
  });

  // Eliminar dividers consecutivos o al principio/final
  const filteredItems = visibleItems.filter((item, i, arr) => {
    if (!item.divider) return true;
    const prev = arr[i - 1];
    const next = arr[i + 1];
    if (!prev || !next) return false;
    if (prev.divider) return false;
    if (!next || next.divider) return false;
    return true;
  });

  const sidebarStyle = isMobile
    ? {
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        width: 240,
        zIndex: 200,
        transform: collapsed ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.22s ease',
        boxShadow: 'var(--shadow-lg)',
      }
    : {
        width: collapsed ? 64 : 240,
        flexShrink: 0,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      };

  return (
    <aside style={{
      ...sidebarStyle,
      background: 'var(--bg-card)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* ── Logo + botón colapsar ── */}
      <div style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed && !isMobile ? 'center' : 'space-between',
        padding: collapsed && !isMobile ? '0 10px' : '0 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {/* Título — se oculta en modo colapsado desktop */}
        {(!collapsed || isMobile) && (
          <span style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--text-primary)',
          }}>
            pf-corrosion
          </span>
        )}

        {/* Botón colapsar — en desktop, icono de chevron; en móvil, X */}
        <button
          onClick={onToggle}
          title={isMobile ? 'Cerrar menú' : collapsed ? 'Expandir' : 'Colapsar'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 6, borderRadius: 6,
            flexShrink: 0,
          }}
        >
          {isMobile
            ? <X size={18} />
            : collapsed
              ? <ChevronRight size={16} />
              : <ChevronLeft size={16} />
          }
        </button>
      </div>

      {/* ── Navegación ── */}
      <nav style={{ flex: 1, overflow: 'auto', padding: '10px 8px' }}>
        {filteredItems.map((item, i) =>
          item.divider
            ? <div key={`div-${i}`} style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
            : <NavItem key={item.path} item={item} collapsed={collapsed && !isMobile} />
        )}
      </nav>

      {/* ── Usuario + Logout ── */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 8px', flexShrink: 0 }}>
        {/* Avatar + info (solo expandido) */}
        {(!collapsed || isMobile) && user && (
          <div
            onClick={() => navigate('/perfil')}
            title="Mi perfil"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 6px', marginBottom: 4, overflow: 'hidden',
              cursor: 'pointer', borderRadius: 8,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{
              width: 34, height: 34, borderRadius: 8, background: avatarColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 12,
              color: 'white', flexShrink: 0,
            }}>
              {getInitials(displayName || user.name || user.email)}
            </div>
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12,
                color: 'var(--text-primary)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {displayName || user.name || user.email}
              </div>
              {rol && (
                <div style={{
                  fontFamily: 'var(--font-data)', fontSize: 10,
                  color: 'var(--accent-amber)', letterSpacing: '0.06em',
                }}>
                  {ROL_LABELS[rol]}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Avatar solo (colapsado) */}
        {collapsed && !isMobile && user && (
          <div
            onClick={() => navigate('/perfil')}
            title="Mi perfil"
            style={{
              width: 34, height: 34, borderRadius: 8, background: avatarColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-data)', fontWeight: 700, fontSize: 12,
              color: 'white', margin: '0 auto 4px', cursor: 'pointer',
            }}
          >
            {getInitials(displayName || user.name || user.email)}
          </div>
        )}

        {/* Logout */}
        <button
          onClick={onLogout}
          title={collapsed && !isMobile ? 'Cerrar sesión' : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: collapsed && !isMobile ? 0 : 8,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            padding: collapsed && !isMobile ? '9px 0' : '9px 10px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderRadius: 8, color: 'var(--accent-red)',
            fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 13,
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <LogOut size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          {(!collapsed || isMobile) && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}
