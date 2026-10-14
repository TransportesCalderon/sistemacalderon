import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/shared/types/db';
import { env } from '@/shared/lib/env';

/**
 * Cliente Supabase para Server Components, server actions y route handlers.
 * Usa la sesión del usuario (cookies) — nunca la clave service_role — para que el
 * pre-request de PostgREST aplique su rol tc_* y la auditoría registre su usuario.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Llamado desde un Server Component: no puede escribir cookies.
          // El middleware ya refresca la sesión en cada petición.
        }
      },
    },
  });
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
