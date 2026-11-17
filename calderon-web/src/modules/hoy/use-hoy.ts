'use client';

import { useQuery } from '@tanstack/react-query';
import { useSesion } from '@/modules/core/session/session-provider';
import { can } from '@/modules/core/permissions/resolver';
import { usePuedeEnBase } from '@/modules/core/permissions/can';
import { browserDb } from '@/shared/supabase/browser';
import { hoyQuery, tareasVisibles } from './hoy';

/**
 * Sprint 3: la lista de «Hoy». La comparten la pantalla y el contador de la barra (una sola
 * consulta). Se vuelve a leer cada minuto, solo mientras la pestaña está a la vista.
 */
export function useHoy() {
  const { permisos } = useSesion();
  // S4: el Auditor tiene la pantalla, pero la base no le deja leer «lo mío de hoy»: no se pide
  const baseDeja = usePuedeEnBase('loMioDeHoy');
  const activo = can(permisos, 'inicio.hoy:ver') && baseDeja;
  const q = useQuery({
    ...hoyQuery(browserDb()),
    enabled: activo,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    select: (tareas) => tareasVisibles(tareas, permisos),
  });
  return { ...q, activo };
}
