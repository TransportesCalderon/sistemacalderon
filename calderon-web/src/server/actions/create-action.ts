import 'server-only';

import type { z } from 'zod';
import { getSessionContext } from '@/modules/core/auth/session';
import type { ContextoAutenticado } from '@/modules/core/auth/guards';
import { alcanceDe } from '@/modules/core/permissions/resolver';
import type { Alcance, Permiso } from '@/modules/core/permissions/types';
import { createSupabaseServerClient, type SupabaseServerClient } from '@/server/supabase/server';
import { traducirErrorDb } from '@/server/errors/traducir';
import { fallo, ok, type ActionResult } from './result';

export interface AccionCtx {
  sesion: ContextoAutenticado;
  db: SupabaseServerClient;
  /** 'propio' obliga al servicio a filtrar por sesion.identidad.choferId. */
  alcance: Alcance;
}

/**
 * Envoltorio de toda server action de escritura (arquitectura §10):
 * autentica → verifica permiso → valida con Zod → ejecuta → traduce el error.
 */
export function createAction<S extends z.ZodType, T>(def: {
  permiso: Permiso;
  schema: S;
  handler: (input: z.infer<S>, ctx: AccionCtx) => Promise<T>;
}): (input: z.input<S>) => Promise<ActionResult<T>> {
  return async (input) => {
    const sesion = await getSessionContext();
    if (!sesion) return fallo('no_autenticado', 'Tu sesión expiró. Volvé a iniciar sesión.');
    if (!sesion.identidad) return fallo('sin_permiso', 'Tu usuario no está habilitado en el sistema.');

    const alcance = alcanceDe(sesion.permisos, def.permiso);
    if (!alcance) return fallo('sin_permiso', 'No tenés permiso para esta acción.');

    const parsed = def.schema.safeParse(input);
    if (!parsed.success) {
      const campos: Record<string, string> = {};
      for (const issue of parsed.error.issues) campos[issue.path.join('.')] ??= issue.message;
      return fallo('validacion', 'Revisá los datos marcados.', campos);
    }

    try {
      const db = await createSupabaseServerClient();
      const data = await def.handler(parsed.data, { sesion: sesion as ContextoAutenticado, db, alcance });
      return ok(data);
    } catch (error) {
      const traducido = traducirErrorDb(error);
      return { ok: false, error: traducido };
    }
  };
}
