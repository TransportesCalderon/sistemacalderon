import { NextResponse, type NextRequest } from 'next/server';
import { ordenCargaRepository } from '@/modules/combustible/repositories/orden-carga.repository';
import { createSupabaseServerClient } from '@/server/supabase/server';

/**
 * Migración 236 · Vuelta de Microsoft después de dar el permiso a la cuenta de mail (Hotmail). Con la sesión del
 * usuario (TI o Gerencia), la base cambia el código por el permiso renovable y lo guarda en el Vault. Acá no hay
 * ninguna clave: solo se pasa el código.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const u = request.nextUrl;
  const volver = `${u.origin}/api/mail/microsoft`;
  const destino = new URL('/analisis/cargas', u.origin);
  destino.searchParams.set('vista', 'ordenes');
  const codigo = u.searchParams.get('code');
  const estado = u.searchParams.get('state');
  if (!codigo || !estado) {
    destino.searchParams.set('mail', u.searchParams.get('error_description') ?? u.searchParams.get('error') ?? 'Microsoft no devolvió el permiso');
    return NextResponse.redirect(destino);
  }
  try {
    const r = await ordenCargaRepository(await createSupabaseServerClient()).conectarMail(codigo, estado, volver);
    destino.searchParams.set('mail', r.ok ? 'ok' : 'No se pudo conectar la cuenta');
  } catch (e) {
    destino.searchParams.set('mail', e instanceof Error ? e.message : 'No se pudo conectar la cuenta');
  }
  return NextResponse.redirect(destino);
}
