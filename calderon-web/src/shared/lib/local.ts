/** Preferencias de esta persona en este navegador (localStorage). Si no se puede (modo privado), se ignora. */
export function leerLocal<T>(clave: string, defecto: T): T {
  try {
    const v = window.localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : defecto;
  } catch {
    return defecto;
  }
}

export function guardarLocal(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // almacenamiento no disponible (modo privado): se ignora
  }
}

/**
 * Borrador de un formulario en esta pestaña (sessionStorage), para no perder lo escrito si la página se
 * recarga sola (por ejemplo, porque se publicó una versión nueva mientras estaba abierta). Vence a las 12 h.
 */
export function leerBorrador<T>(clave: string): T | null {
  try {
    const v = window.sessionStorage.getItem(clave);
    if (!v) return null;
    const { en, datos } = JSON.parse(v) as { en: number; datos: T };
    return Date.now() - en < 12 * 3600_000 ? datos : null;
  } catch {
    return null;
  }
}

export function guardarBorrador(clave: string, datos: unknown) {
  try {
    window.sessionStorage.setItem(clave, JSON.stringify({ en: Date.now(), datos }));
  } catch {
    // almacenamiento no disponible: se ignora
  }
}

export function borrarBorrador(clave: string) {
  try {
    window.sessionStorage.removeItem(clave);
  } catch {
    // se ignora
  }
}
