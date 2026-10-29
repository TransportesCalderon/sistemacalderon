'use client';

import { useQuery } from '@tanstack/react-query';
import { useSesion } from '@/modules/core/session/session-provider';
import { can } from '@/modules/core/permissions/resolver';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { browserDb } from '@/shared/supabase/browser';
import { hoyQuery, tareasVisibles, VERSION_HOY } from './hoy';

/**
 * Sprint 3: la lista de «Hoy». La comparten la pantalla y el contador de la barra (una sola
 * consulta). Se vuelve a leer cada minuto, solo mientras la pestaña está a la vista.
 */
export function useHoy() {
  const { permisos } = useSesion();
  const activo = useBaseTiene(VERSION_HOY) && can(permisos, 'inicio.hoy:ver');
  const q = useQuery({
    ...hoyQuery(browserDb()),
    enabled: activo,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    select: (tareas) => tareasVisibles(tareas, permisos),
  });
  return { ...q, activo };
}
