import 'server-only';
import { variantesDireccion } from '@/modules/logistica/domain/rutas';

/**
 * Ubica una dirección escrita (p. ej. «Cmo. a Melipilla 11246, 9280030 Maipú, Región Metropolitana, Chile»)
 * con OpenStreetMap (Nominatim). Se usa solo para los puntos de un link de Google Maps que no traen
 * coordenadas. Es aproximado: la pantalla pide revisarlo en el mapa. Máximo 1 consulta por segundo.
 */
const URL_BASE = 'https://nominatim.openstreetmap.org/search';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function buscar(q: string): Promise<{ lat: number; lng: number } | null> {
  const u = new URL(URL_BASE);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', '1');
  u.searchParams.set('countrycodes', 'cl,ar');
  u.searchParams.set('q', q);
  const r = await fetch(u, {
    headers: { 'User-Agent': 'IronTrack/1.0 (rutas para choferes)', 'Accept-Language': 'es' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { lat?: string; lon?: string }[];
  const lat = Number(j[0]?.lat), lng = Number(j[0]?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export async function ubicarDirecciones(textos: string[]): Promise<({ lat: number; lng: number } | null)[]> {
  const out: ({ lat: number; lng: number } | null)[] = [];
  let primera = true;
  for (const texto of textos) {
    let hallado: { lat: number; lng: number } | null = null;
    for (const q of variantesDireccion(texto).slice(0, 3)) {
      if (!primera) await espera(1_100);
      primera = false;
      try {
        hallado = await buscar(q);
      } catch {
        hallado = null;
      }
      if (hallado) break;
    }
    out.push(hallado);
  }
  return out;
}
