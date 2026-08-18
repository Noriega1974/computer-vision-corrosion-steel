import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LayoutGrid,
  MapPin,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
  User,
  Upload,
} from 'lucide-react';

import { useAuth } from '../auth/AuthContext';

const AVATAR_STORAGE_KEY = 'corria-avatar-color';
const NAME_STORAGE_KEY = 'corria-display-name';

// ─────────────────────────────────────────────────────────────
// ITEMS DE NAVEGACIÓN
// ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    path: '/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
  },

  {
    path: '/upload',
    icon: Upload,
    label: 'Subir medición',
    roles: ['admin', 'tecnico'],
  },

  {
    path: '/galeria',
    icon: LayoutGrid,
    label: 'Galería',
  },

  { divider: true },

  {
    path: '/plantas',
    icon: MapPin,
    label: 'Ubicaciones',
    roles: ['admin', 'tecnico'],
  },

  {
    path: '/usuarios',
    icon: Users,
    label: 'Usuarios',
    roles: ['admin'],
  },

  { divider: true },

  {
    path: '/perfil',
    icon: User,
    label: 'Mi perfil',
  },

  {
    path: '/configuracion',
    icon: Settings,
    label: 'Configuración',
    roles: ['admin'],
  },
];

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return (
      parts[0][0] +
      parts[1][0]
    ).toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

const ROL_LABELS = {
  admin: 'Administrador',
  tecnico: 'Técnico',
  cliente: 'Cliente',
};

function getPrimaryRole(groups = []) {
  if (groups.includes('admin')) return 'admin';
  if (groups.includes('tecnico')) return 'tecnico';
  if (groups.includes('cliente')) return 'cliente';

  return null;
}

// ─────────────────────────────────────────────────────────────
// ITEM DE NAVEGACIÓN
// ─────────────────────────────────────────────────────────────

function NavItem({ item, collapsed }) {
  const location = useLocation();

  const isActive =
    item.path === '/galeria'
      ? location.pathname === '/galeria' ||
        location.pathname.startsWith('/galeria/')
      : location.pathname === item.path;

  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      style={{
        textDecoration: 'none',
        display: 'block',
      }}
    >
      <div
        className={
          isActive
            ? 'sidebar-nav-item is-active'
            : 'sidebar-nav-item'
        }
        style={{
          position: 'relative',

          display: 'flex',
          alignItems: 'center',

          gap: collapsed ? 0 : 11,

          padding: collapsed
            ? '11px 0'
            : '10px 13px',

          marginBottom: 'var(--space-1)',

          minHeight: 40,

          borderRadius: 11,

          cursor: 'pointer',

          justifyContent: collapsed
            ? 'center'
            : 'flex-start',

          // background, border, box-shadow y color viven en index.css
          // (.sidebar-nav-item / .is-active). Si se declaran aca tambien,
          // el estilo inline le gana por especificidad a la regla :hover
          // y el hover deja de verse.
        }}
      >
        {/* Indicador lateral del elemento activo */}
        {isActive && (
          <span
            style={{
              position: 'absolute',

              left: -1,
              top: '50%',
              transform: 'translateY(-50%)',

              width: 3,
              height: 20,

              borderRadius: '0 4px 4px 0',

              background: 'var(--gradient-brand)',

              boxShadow:
                '0 0 10px rgba(217,45,32,0.45)',
            }}
          />
        )}

        <Icon
          size={18}
          strokeWidth={isActive ? 2.2 : 1.8}
          style={{
            flexShrink: 0,

            filter: isActive
              ? 'drop-shadow(0 0 5px rgba(0,160,255,0.22))'
              : 'none',
          }}
        />

        {!collapsed && (
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: isActive ? 600 : 450,
              fontSize: 'var(--text-sm)',

              letterSpacing: '0.01em',

              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.label}
          </span>
        )}
      </div>
    </NavLink>
  );
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────

export default function Sidebar({
  collapsed,
  isMobile,
  onToggle,
  onLogout,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ───────────────────────────────────────────────────────────
  // AVATAR
  // ───────────────────────────────────────────────────────────

  const [avatarColor, setAvatarColor] =
    React.useState(
      () =>
        localStorage.getItem(
          AVATAR_STORAGE_KEY
        ) ?? '#1432A3'
    );

  // ───────────────────────────────────────────────────────────
  // NOMBRE
  // ───────────────────────────────────────────────────────────

  const [displayName, setDisplayName] =
    React.useState(
      () =>
        localStorage.getItem(
          NAME_STORAGE_KEY
        ) || ''
    );

  // ───────────────────────────────────────────────────────────
  // ESCUCHAR CAMBIOS DEL AVATAR
  // ───────────────────────────────────────────────────────────

  React.useEffect(() => {
    const handler = e => {
      setAvatarColor(e.detail);
    };

    window.addEventListener(
      'corria-avatar-color',
      handler
    );

    return () => {
      window.removeEventListener(
        'corria-avatar-color',
        handler
      );
    };
  }, []);

  // ───────────────────────────────────────────────────────────
  // ESCUCHAR CAMBIOS DEL NOMBRE
  // ───────────────────────────────────────────────────────────

  React.useEffect(() => {
    const handler = e => {
      setDisplayName(e.detail);
    };

    window.addEventListener(
      'corria-user-name',
      handler
    );

    return () => {
      window.removeEventListener(
        'corria-user-name',
        handler
      );
    };
  }, []);

  // Si no hay nombre guardado, utilizar el nombre del usuario
  React.useEffect(() => {
    if (
      !localStorage.getItem(NAME_STORAGE_KEY) &&
      user?.name
    ) {
      setDisplayName(user.name);
    }
  }, [user?.name]);

  // ───────────────────────────────────────────────────────────
  // ROL
  // ───────────────────────────────────────────────────────────

  const groups = user?.groups ?? [];

  const rol = getPrimaryRole(groups);

  // ───────────────────────────────────────────────────────────
  // FILTRAR OPCIONES SEGÚN ROL
  // ───────────────────────────────────────────────────────────

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.divider) return true;

    if (!item.roles) return true;

    return item.roles.some(r =>
      groups.includes(r)
    );
  });

  // ───────────────────────────────────────────────────────────
  // LIMPIAR DIVISORES
  // ───────────────────────────────────────────────────────────

  const filteredItems =
    visibleItems.filter(
      (item, i, arr) => {
        if (!item.divider) return true;

        const prev = arr[i - 1];
        const next = arr[i + 1];

        if (!prev || !next) return false;

        if (prev.divider) return false;

        if (!next || next.divider) return false;

        return true;
      }
    );

  // ───────────────────────────────────────────────────────────
  // ESTILOS DEL SIDEBAR
  // ───────────────────────────────────────────────────────────

  const sidebarStyle = isMobile
    ? {
        position: 'fixed',

        top: 0,
        left: 0,
        bottom: 0,

        width: 240,

        zIndex: 200,

        transform: collapsed
          ? 'translateX(-100%)'
          : 'translateX(0)',

        transition:
          'transform 0.22s ease',

        boxShadow:
          '12px 0 40px rgba(15,45,90,0.18)',
      }
    : {
        // IMPORTANTE:
        // evita que el nuevo fondo del dashboard
        // tape visualmente el sidebar.
        position: 'relative',

        width: collapsed
          ? 64
          : 240,

        flexShrink: 0,

        zIndex: 20,

        transition:
          'width 0.2s ease',

        overflow: 'hidden',
      };

  // ───────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────

  return (
    <aside
      style={{
        ...sidebarStyle,

        background:
          'var(--sidebar-bg)',

        backdropFilter:
          'blur(22px)',

        WebkitBackdropFilter:
          'blur(22px)',

        borderRight:
          '1px solid var(--sidebar-border)',

        display: 'flex',

        flexDirection: 'column',

        height: '100%',

        overflow: 'hidden',

        boxShadow:
          isMobile
            ? '12px 0 40px rgba(15,45,90,0.18)'
            : '6px 0 28px rgba(15,45,90,0.055)',
      }}
    >
      {/* ─────────────────────────────────────────────────────
          BRILLO DECORATIVO DEL SIDEBAR
      ───────────────────────────────────────────────────── */}

      <div
        style={{
          position: 'absolute',

          top: -90,
          left: collapsed
            ? -80
            : -120,

          width: 240,
          height: 240,

          borderRadius: '50%',

          background:
            'radial-gradient(circle, rgba(0,185,255,0.12) 0%, rgba(0,185,255,0.035) 42%, transparent 72%)',

          pointerEvents: 'none',

          filter: 'blur(8px)',
        }}
      />

      {/* Segundo brillo */}
      <div
        style={{
          position: 'absolute',

          bottom: 60,
          right: -100,

          width: 220,
          height: 220,

          borderRadius: '50%',

          background:
            'radial-gradient(circle, rgba(55,100,220,0.09) 0%, rgba(55,100,220,0.02) 45%, transparent 72%)',

          pointerEvents: 'none',

          filter: 'blur(12px)',
        }}
      />

      {/* ─────────────────────────────────────────────────────
          LOGO + BOTÓN
      ───────────────────────────────────────────────────── */}

      <div
        style={{
          height: 56,

          display: 'flex',

          alignItems: 'center',

          justifyContent:
            collapsed && !isMobile
              ? 'center'
              : 'space-between',

          padding:
            collapsed && !isMobile
              ? '0 10px'
              : '0 14px',

          borderBottom:
            '1px solid var(--sidebar-border)',

          flexShrink: 0,

          position: 'relative',

          zIndex: 1,
        }}
      >
        {/* Logo / nombre */}
        {(!collapsed || isMobile) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            {/* Punto luminoso */}
            <span
              style={{
                width: 8,
                height: 8,

                borderRadius: '50%',

                background: 'var(--gradient-brand)',

                boxShadow:
                  '0 0 10px rgba(217,45,32,0.5)',

                flexShrink: 0,
              }}
            />

            <span
              style={{
                fontFamily:
                  'var(--font-ui)',

                fontWeight: 700,

                fontSize: 'var(--text-md)',

                letterSpacing:
                  '-0.01em',

                color:
                  'var(--text-primary)',
              }}
            >
              pf-corrosion
            </span>
          </div>
        )}

        {/* Botón colapsar */}
        <button
          onClick={onToggle}
          title={
            isMobile
              ? 'Cerrar menú'
              : collapsed
                ? 'Expandir'
                : 'Colapsar'
          }
          style={{
            background:
              'var(--sidebar-button-bg)',

            border:
              '1px solid var(--sidebar-border)',

            cursor: 'pointer',

            color:
              'var(--text-muted)',

            display: 'flex',

            alignItems: 'center',

            justifyContent: 'center',

            padding: 6,

            borderRadius: 8,

            flexShrink: 0,

            transition:
              'all 0.18s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background =
              'var(--sidebar-hover-bg)';

            e.currentTarget.style.color =
              'var(--nav-active-text)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background =
              'var(--sidebar-button-bg)';

            e.currentTarget.style.color =
              'var(--text-muted)';
          }}
        >
          {isMobile ? (
            <X size={18} />
          ) : collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────
          NAVEGACIÓN
      ───────────────────────────────────────────────────── */}

      <nav
        style={{
          flex: 1,

          overflow: 'auto',

          padding: '12px 8px',

          position: 'relative',

          zIndex: 1,
        }}
      >
        {filteredItems.map(
          (item, i) =>
            item.divider ? (
              <div
                key={`div-${i}`}
                style={{
                  height: 1,

                  background:
                    'var(--sidebar-divider)',

                  margin:
                    '10px 4px',
                }}
              />
            ) : (
              <NavItem
                key={item.path}
                item={item}
                collapsed={
                  collapsed &&
                  !isMobile
                }
              />
            )
        )}
      </nav>

      {/* ─────────────────────────────────────────────────────
          USUARIO + LOGOUT
      ───────────────────────────────────────────────────── */}

      <div
        style={{
          borderTop:
            '1px solid var(--sidebar-border)',

          padding: '10px 8px',

          flexShrink: 0,

          position: 'relative',

          zIndex: 1,
        }}
      >
        {/* ───────────────────────────────────────────────
            USUARIO EXPANDIDO
        ─────────────────────────────────────────────── */}

        {(!collapsed || isMobile) &&
          user && (
            <div
              onClick={() =>
                navigate('/perfil')
              }
              title="Mi perfil"
              style={{
                display: 'flex',

                alignItems: 'center',

                gap: 'var(--space-2-5)',

                padding: '8px 7px',

                marginBottom: 5,

                overflow: 'hidden',

                cursor: 'pointer',

                borderRadius: 11,

                border:
                  '1px solid transparent',

                transition:
                  'all 0.18s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background =
                  'var(--sidebar-hover-bg)';

                e.currentTarget.style.border =
                  '1px solid var(--sidebar-hover-border)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background =
                  'transparent';

                e.currentTarget.style.border =
                  '1px solid transparent';
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 35,
                  height: 35,

                  borderRadius: 10,

                  background:
                    `linear-gradient(135deg, ${avatarColor}, var(--accent-amber))`,

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center',

                  fontFamily:
                    'var(--font-data)',

                  fontWeight: 700,

                  fontSize: 'var(--text-xs)',

                  color: 'white',

                  flexShrink: 0,

                  boxShadow:
                    '0 4px 12px rgba(20,50,163,0.18)',
                }}
              >
                {getInitials(
                  displayName ||
                    user.name ||
                    user.email
                )}
              </div>

              {/* Información */}
              <div
                style={{
                  overflow: 'hidden',

                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontFamily:
                      'var(--font-ui)',

                    fontWeight: 600,

                    fontSize: 'var(--text-xs)',

                    color:
                      'var(--text-primary)',

                    whiteSpace:
                      'nowrap',

                    overflow:
                      'hidden',

                    textOverflow:
                      'ellipsis',
                  }}
                >
                  {displayName ||
                    user.name ||
                    user.email}
                </div>

                {rol && (
                  <div
                    style={{
                      fontFamily:
                        'var(--font-data)',

                      fontSize: 9,

                      color:
                        'var(--nav-active-text)',

                      letterSpacing:
                        '0.07em',

                      marginTop: 1,

                      textTransform:
                        'uppercase',
                    }}
                  >
                    {ROL_LABELS[rol]}
                  </div>
                )}
              </div>
            </div>
          )}

        {/* ───────────────────────────────────────────────
            AVATAR COLAPSADO
        ─────────────────────────────────────────────── */}

        {collapsed &&
          !isMobile &&
          user && (
            <div
              onClick={() =>
                navigate('/perfil')
              }
              title="Mi perfil"
              style={{
                width: 35,
                height: 35,

                borderRadius: 10,

                background:
                  `linear-gradient(135deg, ${avatarColor}, var(--accent-amber))`,

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                fontFamily:
                  'var(--font-data)',

                fontWeight: 700,

                fontSize: 'var(--text-xs)',

                color: 'white',

                margin:
                  '0 auto 6px',

                cursor: 'pointer',

                boxShadow:
                  '0 4px 12px rgba(20,50,163,0.18)',
              }}
            >
              {getInitials(
                displayName ||
                  user.name ||
                  user.email
              )}
            </div>
          )}

        {/* ───────────────────────────────────────────────
            LOGOUT
        ─────────────────────────────────────────────── */}

        <button
          onClick={onLogout}
          title={
            collapsed &&
            !isMobile
              ? 'Cerrar sesión'
              : undefined
          }
          style={{
            width: '100%',

            display: 'flex',

            alignItems: 'center',

            gap:
              collapsed &&
              !isMobile
                ? 0
                : 8,

            justifyContent:
              collapsed &&
              !isMobile
                ? 'center'
                : 'flex-start',

            padding:
              collapsed &&
              !isMobile
                ? '9px 0'
                : '9px 10px',

            background:
              'transparent',

            border:
              '1px solid transparent',

            cursor: 'pointer',

            borderRadius: 10,

            color:
              'var(--accent-red)',

            fontFamily:
              'var(--font-ui)',

            fontWeight: 500,

            fontSize: 'var(--text-xs)',

            transition:
              'all 0.18s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background =
              'rgba(220,38,38,0.07)';

            e.currentTarget.style.border =
              '1px solid rgba(220,38,38,0.10)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background =
              'transparent';

            e.currentTarget.style.border =
              '1px solid transparent';
          }}
        >
          <LogOut
            size={17}
            strokeWidth={1.8}
            style={{
              flexShrink: 0,
            }}
          />

          {(!collapsed ||
            isMobile) && (
            <span>
              Cerrar sesión
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}