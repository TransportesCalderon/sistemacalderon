'use client';

import type { ReactNode } from 'react';
import { useSesion } from '@/modules/core/session/session-provider';
import { alcanceDe, can } from './resolver';
import type { Alcance, Permiso } from './types';

/** ¿El usuario de la sesión tiene el permiso? (capa 4: interfaz). */
export function useCan(permiso: Permiso): boolean {
  return can(useSesion().permisos, permiso);
}

/** Alcance del permiso: 'todo', 'propio' (chofer) o null. */
export function useAlcance(permiso: Permiso): Alcance | null {
  return alcanceDe(useSesion().permisos, permiso);
}

/**
 * Muestra su contenido solo si el usuario tiene el permiso.
 * La condición de estado del registro (transiciones permitidas) se combina por fuera:
 * <Can permiso="combustible.cargas:transicionar">{estado === 'pendiente' && <Boton…/>}</Can>
 */
export function Can({ permiso, children, fallback = null }: { permiso: Permiso; children: ReactNode; fallback?: ReactNode }) {
  return useCan(permiso) ? <>{children}</> : <>{fallback}</>;
}
