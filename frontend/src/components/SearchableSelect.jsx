import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-page)',
  color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 13,
  boxSizing: 'border-box',
};

/**
 * Combobox de búsqueda: el usuario escribe para filtrar una lista cerrada
 * de opciones, pero solo puede seleccionar una opción real de `options`.
 * Texto libre que no coincide con ninguna opción no se puede confirmar.
 */
export default function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Buscar…',
  disabled = false,
  emptyMessage = 'Sin resultados',
}) {
  // Los ids de la lista y de la opcion activa se derivan del id del combobox,
  // asi dos instancias en la misma pantalla (departamento y ciudad) no chocan.
  const listboxId = id ? `${id}-listbox` : undefined;
  const optionId = (i) => (id ? `${id}-option-${i}` : undefined);
  const [query, setQuery] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef(null);

  // Mantener el texto visible sincronizado si el valor cambia desde afuera
  // (p. ej. al resetear el departamento cuando cambia la ciudad disponible).
  useEffect(() => {
    setQuery(value ?? '');
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, query]);

  // Cerrar al hacer clic afuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        // Si lo que quedó escrito no es una opción válida, volver al último valor confirmado
        setQuery(value ?? '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  const selectOption = (opt) => {
    onChange(opt);
    setQuery(opt);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) selectOption(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(value ?? '');
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        {/* role="combobox" + aria-* es lo que hace que un lector de pantalla
            anuncie que hay una lista, si esta abierta y que opcion esta activa.
            Sin esto el control se lee como un campo de texto cualquiera. */}
        <input
          id={id}
          role="combobox"
          aria-expanded={open && !disabled}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && filtered.length > 0 ? optionId(highlight) : undefined
          }
          value={query}
          disabled={disabled}
          onChange={e => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
            // Si el texto ya no coincide con el valor confirmado, invalidarlo
            if (e.target.value !== value) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? placeholder : `${placeholder}…`}
          style={{ ...inputStyle, paddingRight: 30, opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'text' }}
          autoComplete="off"
        />
        <ChevronDown size={14} style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-faint)', pointerEvents: 'none',
        }} />
      </div>

      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
            maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            // Evita que el scroll de la lista arrastre la pagina de atras al llegar al tope.
            overscrollBehavior: 'contain',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-faint)' }}>{emptyMessage}</div>
          ) : (
            filtered.map((opt, i) => (
              // El teclado se maneja en el input via aria-activedescendant, asi que
              // la opcion no recibe foco propio: solo necesita rol e identidad.
              <div
                key={opt}
                id={optionId(i)}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => { e.preventDefault(); selectOption(opt); }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  fontFamily: 'var(--font-ui)', color: 'var(--text-primary)',
                  background: i === highlight ? 'var(--bg-page)' : 'transparent',
                }}
              >
                {opt}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
