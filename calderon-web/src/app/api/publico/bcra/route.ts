import { pedirBcra, periodoBcra } from '@/server/externos/bcra';

/**
 * Pasarela pública al tipo de cambio minorista del BCRA (migración 38). La usa la tarea
 * programada de Supabase cuando su conexión directa con el BCRA se corta. Solo esa serie
 * y hasta 60 días: devuelve la respuesta del BCRA tal cual. No toca la base ni usa claves.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const u = new URL(request.url);
  const p = periodoBcra(u.searchParams.get('desde'), u.searchParams.get('hasta'));
  if (!p) return Response.json({ error: 'desde y hasta: AAAA-MM-DD, hasta 60 días' }, { status: 400 });
  try {
    const r = await pedirBcra(p.desde, p.hasta);
    return Response.json(r.cuerpo, { status: r.status, headers: { 'Cache-Control': 'public, s-maxage=900' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'BCRA sin respuesta' }, { status: 502 });
  }
}
