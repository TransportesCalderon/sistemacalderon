import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/shared/types/db';
import { env } from '@/shared/lib/env';

/**
 * Refresca la sesión de Supabase en el middleware y devuelve la respuesta con las
 * cookies actualizadas, el usuario validado y el access token (para leer los claims).
 */
export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() valida el token contra Supabase Auth (getSession() sola no es confiable).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let accessToken: string | null = null;
  if (user) {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token ?? null;
  }

  return { response: () => response, user, accessToken };
}
