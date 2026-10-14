import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/server/supabase/server';

/** Intercambio del código de Supabase Auth (recuperación de contraseña, magic link, SSO). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const destino = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destino, origin));
  }
  return NextResponse.redirect(new URL('/login?error=enlace', origin));
}
