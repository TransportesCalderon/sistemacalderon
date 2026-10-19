import 'server-only';

/**
 * Tipo de cambio minorista del BCRA (serie 4), pedido desde el servidor de la aplicación:
 * la conexión directa desde Supabase se corta (SSL_ERROR_SYSCALL). Dato público, sin claves.
 */
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export function periodoBcra(desde?: string | null, hasta?: string | null): { desde: string; hasta: string } | null {
  const fin = hasta ?? new Date().toISOString().slice(0, 10);
  const inicio = desde ?? new Date(Date.parse(`${fin}T00:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10);
  if (!DIA.test(inicio) || !DIA.test(fin)) return null;
  const dias = (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000;
  return dias >= 0 && dias <= 60 ? { desde: inicio, hasta: fin } : null;
}

export async function pedirBcra(desde: string, hasta: string): Promise<{ status: number; cuerpo: unknown }> {
  const r = await fetch(`https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/4?desde=${desde}&hasta=${hasta}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; TransportesCalderon/1.0)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const texto = await r.text();
  try {
    return { status: r.status, cuerpo: JSON.parse(texto) };
  } catch {
    return { status: r.ok ? 502 : r.status, cuerpo: { error: texto.slice(0, 200) } };
  }
}
