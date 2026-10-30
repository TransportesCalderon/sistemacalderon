import 'server-only';
import { esLinkDeMaps } from '@/modules/logistica/domain/rutas';

/**
 * Migración 135: abre un link corto de Google Maps (maps.app.goo.gl) para ver adónde lleva y así
 * leer sus puntos. Solo sigue redirecciones a dominios de Google Maps (nunca a otros sitios).
 */
export async function abrirLinkMaps(link: string): Promise<string> {
  let actual = link.trim();
  for (let i = 0; i < 6; i++) {
    if (!esLinkDeMaps(actual)) throw new Error('El link no es de Google Maps');
    const u = new URL(actual);
    if (u.pathname.includes('/dir/') || u.searchParams.get('api') === '1') return actual;
    const r = await fetch(actual, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IronTrack/1.0)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const destino = r.headers.get('location');
    if (!destino || r.status < 300 || r.status >= 400) return actual;
    actual = new URL(destino, actual).toString();
  }
  return actual;
}
