/**
 * Sprint 0 · T05 (docs/DECISIONES.md, regla 5): las funciones nuevas se prenden según la
 * migración que tiene la base (parámetro web.version_base, migración 113). Así, si la web se
 * sube antes que el SQL, lo nuevo queda apagado y ninguna pantalla se rompe.
 */

/** Convierte lo que devuelve ref.fn_version_base() en un número; cualquier otra cosa vale 0. */
export function leerVersionBase(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** true si la base ya tiene aplicada la migración `minima`. */
export function baseTiene(versionBase: number, minima: number): boolean {
  return versionBase >= minima;
}
