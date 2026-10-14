'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { fallo, ok, type ActionResult } from '@/server/actions/result';
import { permisosDe } from '@/modules/core/permissions/resolver';
import { rutaInicial } from '@/modules/core/navigation/filtrar';
import { decodificarClaims, identidadDesdeClaims } from './claims';
import {
  cambiarPasswordSchema,
  loginSchema,
  recuperarSchema,
  type CambiarPasswordInput,
  type LoginInput,
  type RecuperarInput,
} from './schemas';
import { COOKIE_ZONA, esZonaValida } from './zonas';

/** Solo destinos internos: evita redirecciones abiertas a otros dominios. */
function destinoSeguro(next: string | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) return null;
  return next;
}

export async function iniciarSesion(input: LoginInput): Promise<ActionResult<{ destino: string }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const issue of parsed.error.issues) campos[issue.path.join('.')] ??= issue.message;
    return fallo('validacion', 'Revisá los datos.', campos);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.session) {
    if (error?.code === 'email_not_confirmed') {
      return fallo('credenciales', 'Tu email todavía no fue confirmado.');
    }
    return fallo('credenciales', 'Email o contraseña incorrectos.');
  }

  const identidad = identidadDesdeClaims(decodificarClaims(data.session.access_token));
  if (!identidad) return ok({ destino: '/sin-acceso?motivo=vinculo' });

  const permisos = permisosDe(identidad.rolesApp, { gerenciaDetalleAlertas: 'agregado' });
  revalidatePath('/', 'layout');
  return ok({ destino: destinoSeguro(parsed.data.next) ?? rutaInicial(permisos) });
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function solicitarRecuperacion(input: RecuperarInput): Promise<ActionResult<null>> {
  const parsed = recuperarSchema.safeParse(input);
  if (!parsed.success) return fallo('validacion', 'Revisá el email.', { email: parsed.error.issues[0]?.message ?? '' });

  const origen = (await headers()).get('origin') ?? '';
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origen}/auth/callback?next=/perfil`,
  });
  // Misma respuesta exista o no el email: no revela qué cuentas existen.
  return ok(null);
}

export async function cambiarZonaHoraria(zona: string): Promise<ActionResult<null>> {
  if (!esZonaValida(zona)) return fallo('validacion', 'Zona horaria no válida.');
  (await cookies()).set(COOKIE_ZONA, zona, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
  return ok(null);
}

export async function cambiarPassword(input: CambiarPasswordInput): Promise<ActionResult<null>> {
  const parsed = cambiarPasswordSchema.safeParse(input);
  if (!parsed.success) return fallo('validacion', parsed.error.issues[0]?.message ?? 'Revisá los datos.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fallo('no_autenticado', 'Tu sesión expiró. Volvé a iniciar sesión.');

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fallo('desconocido', 'No se pudo cambiar la contraseña. Probá con otra.');
  return ok(null);
}
