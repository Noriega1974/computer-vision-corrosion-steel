import { useEffect, useRef, useState } from 'react';

const PREFIJO = 'pixelrust:conteo:';
const MAXIMO = 12;

function leer(clave) {
  try {
    const n = parseInt(window.localStorage.getItem(PREFIJO + clave), 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function guardar(clave, n) {
  try {
    window.localStorage.setItem(PREFIJO + clave, String(n));
  } catch {
    // Sin storage (modo privado, bloqueado): se usa el valor por defecto.
  }
}

/**
 * Cantidad de esqueletos a mostrar mientras carga una lista.
 *
 * No se puede saber antes de la peticion, asi que se recuerda cuantos items
 * habia la ultima vez que cargo esta misma lista (`clave`). Primera visita:
 * `porDefecto`. Minimo 1 y tope de 12 para no pintar cientos de bloques.
 */
export function useConteoRecordado(clave, items, loading, porDefecto = 3) {
  const [guardado, setGuardado] = useState(() => leer(clave));
  const largo = Array.isArray(items) ? items.length : 0;

  // Solo se guarda tras ver una carga completa de ESTA clave (loading true ->
  // false). Asi no se guarda el conteo de la lista anterior al cambiar de
  // zona/punto, ni un 0 de un render previo a que arranque la peticion.
  const vioCarga = useRef(false);

  // La clave puede cambiar (otra zona, otro punto): releer.
  useEffect(() => {
    vioCarga.current = false;
    setGuardado(leer(clave));
  }, [clave]);

  useEffect(() => {
    if (loading) {
      vioCarga.current = true;
    } else if (vioCarga.current) {
      guardar(clave, largo);
    }
  }, [clave, loading, largo]);

  const base = guardado ?? porDefecto;
  return Math.min(Math.max(base, 1), MAXIMO);
}
