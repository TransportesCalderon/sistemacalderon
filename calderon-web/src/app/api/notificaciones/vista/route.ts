import { createSupabaseServerClient } from '@/server/supabase/server';

/**
 * Migración 306 · El teléfono avisa que la persona tocó una notificación: queda vista y se contesta cuántas le quedan
 * sin abrir (el número del ícono). La llama el service worker (public/sw.js) con la sesión del teléfono; la base solo
 * marca las de esa persona.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let id = 0;
  try {
    id = Number(((await request.json()) as { id?: unknown } | null)?.id);
  } catch {
    id = 0;
  }
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: 'falta la notificación' }, { status: 400 });
  const db = await createSupabaseServerClient();
  const { data, error } = await db.schema('ops').rpc('fn_notificacion_vista', { p_id: id });
  if (error) return Response.json({ error: 'no se pudo marcar' }, { status: 400 });
  return Response.json({ pendientes: Number(data ?? 0) }, { headers: { 'Cache-Control': 'no-store' } });
}
