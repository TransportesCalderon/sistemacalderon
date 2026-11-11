'use server';

import { z } from 'zod';
import { getSessionContext } from '@/modules/core/auth/session';
import { createSupabaseServerClient, type SupabaseServerClient } from '@/server/supabase/server';
import { traducirErrorDb } from '@/server/errors/traducir';
import { fallo, ok, type ActionResult } from '@/server/actions/result';

/**
 * Migración 238 · Alertas en el teléfono. Cada persona activa las suyas (Mi perfil): no hace falta un permiso de
 * pantalla, solo la sesión. La base valida todo y decide qué avisos le llegan a cada uno.
 */
async function conSesion<T>(fn: (db: SupabaseServerClient) => Promise<T>): Promise<ActionResult<T>> {
  const sesion = await getSessionContext();
  if (!sesion?.identidad) return fallo('no_autenticado', 'Tu sesión expiró. Volvé a iniciar sesión.');
  try {
    return ok(await fn(await createSupabaseServerClient()));
  } catch (e) {
    return { ok: false, error: traducirErrorDb(e) };
  }
}

const sinError = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

export async function clavePushPublica(): Promise<ActionResult<string>> {
  return conSesion(async (db) => String(sinError(await db.schema('ops').rpc('fn_push_clave_publica'))));
}

const suscripcion = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
  dispositivo: z.string().max(200).nullable(),
});

export async function suscribirPush(input: z.input<typeof suscripcion>): Promise<ActionResult<null>> {
  const d = suscripcion.safeParse(input);
  if (!d.success) return fallo('validacion', 'Este navegador no es compatible con las alertas.');
  return conSesion(async (db) => {
    sinError(
      await db.schema('ops').rpc('fn_push_suscribir', { p_endpoint: d.data.endpoint, p_p256dh: d.data.p256dh, p_auth: d.data.auth, p_dispositivo: d.data.dispositivo }),
    );
    return null;
  });
}

export async function desuscribirPush(endpoint: string): Promise<ActionResult<null>> {
  return conSesion(async (db) => {
    sinError(await db.schema('ops').rpc('fn_push_desuscribir', { p_endpoint: String(endpoint).slice(0, 1000) }));
    return null;
  });
}

export async function probarPush(): Promise<ActionResult<null>> {
  return conSesion(async (db) => {
    sinError(await db.schema('ops').rpc('fn_push_probar'));
    return null;
  });
}
