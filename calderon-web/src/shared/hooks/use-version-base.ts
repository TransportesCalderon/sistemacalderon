'use client';

import { useSesion } from '@/modules/core/session/session-provider';
import { baseTiene } from '@/shared/lib/version-base';

/**
 * Sprint 0 · T05: última migración aplicada en la base (0 si no se pudo leer).
 * En el servidor se usa getSessionContext().versionBase.
 */
export function useVersionBase(): number {
  return useSesion().versionBase;
}

/**
 * true si la base ya tiene la migración que trae una función nueva. Uso:
 *   const hayBuscador = useBaseTiene(115); // fn_buscar llega en la 115
 */
export function useBaseTiene(minima: number): boolean {
  return baseTiene(useVersionBase(), minima);
}
