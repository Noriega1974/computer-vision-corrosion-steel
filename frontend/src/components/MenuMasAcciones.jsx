import React, { useEffect, useId, useRef, useState } from 'react';
import { IconoMasAcciones } from './Iconos';

// Overflow menu ("Más acciones"). Accessible menu button pattern:
// the trigger has aria-haspopup="menu" and aria-expanded; opening focuses the first
// enabled item; Arrow keys / Home / End move between items; Esc closes and gives focus
// back to the trigger; Tab or a click outside closes. Items: { key, label, Icono,
// onClick, peligro?: boolean }. `disabled`/`title` apply to the whole menu.
export default function MenuMasAcciones({ items, etiqueta = 'Más acciones', disabled = false, title }) {
  const [abierto, setAbierto] = useState(false);
  const raizRef = useRef(null);
  const botonRef = useRef(null);
  const menuRef = useRef(null);
  const idMenu = useId();

  const itemsDom = () => Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? []);

  useEffect(() => {
    if (!abierto) return undefined;
    itemsDom()[0]?.focus();
    const fuera = (e) => { if (!raizRef.current?.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  // A disabled menu cannot stay open (e.g. a batch starts while it is showing).
  useEffect(() => { if (disabled) setAbierto(false); }, [disabled]);

  const cerrar = (devolverFoco) => {
    setAbierto(false);
    if (devolverFoco) botonRef.current?.focus();
  };

  const alTeclear = (e) => {
    const lista = itemsDom();
    const i = lista.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); cerrar(true); }
    else if (e.key === 'Tab') cerrar(true); // the items unmount: park focus on the trigger so Tab continues from it
    else if (e.key === 'ArrowDown') { e.preventDefault(); lista[(i + 1) % lista.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); lista[(i - 1 + lista.length) % lista.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); lista[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); lista[lista.length - 1]?.focus(); }
  };

  return (
    <div className="menu-acciones" ref={raizRef}>
      <button
        ref={botonRef}
        type="button"
        className="menu-acciones__boton"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        disabled={disabled}
        title={title}
        onClick={() => { if (abierto) cerrar(true); else setAbierto(true); }}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !abierto) { e.preventDefault(); setAbierto(true); } }}
      >
        <IconoMasAcciones size={15} aria-hidden="true" />
        {etiqueta}
      </button>
      {abierto && (
        <div id={idMenu} ref={menuRef} role="menu" aria-label={etiqueta} className="menu-acciones__lista" onKeyDown={alTeclear}>
          {items.map(({ key, label, Icono, onClick, peligro }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              className={`menu-acciones__item${peligro ? ' menu-acciones__item--peligro' : ''}`}
              // Focus goes back to the trigger first, so a dialog opened by the item records it as its opener.
              onClick={() => { cerrar(true); onClick(); }}
            >
              {Icono && <Icono size={14} aria-hidden="true" />}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
