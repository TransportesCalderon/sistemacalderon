import webpush from 'web-push';

/**
 * Migración 238 · Firma y manda las alertas al teléfono. La llama solo la base (tarea de cada minuto): le pasa la clave
 * privada del Vault y los mensajes; acá se firman, se mandan a Google/Apple y se contesta cómo le fue a cada uno.
 * No guarda nada ni usa variables de entorno con claves. «generar» devuelve un par de claves nuevo (la base guarda la
 * privada en el Vault). Solo acepta destinos de los servicios de push conocidos, así no sirve para mandar a otro lado.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DESTINO = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//;

interface Mensaje {
  id: number;
  sub: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  urgente?: boolean;
  payload: string;
}

export async function POST(request: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (b.accion === 'generar') {
    const k = webpush.generateVAPIDKeys();
    return Response.json({ publica: k.publicKey, privada: k.privateKey }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (b.accion !== 'enviar') return Response.json({ error: 'acción desconocida' }, { status: 400 });
  const { publica, privada, sujeto } = b as { publica?: string; privada?: string; sujeto?: string };
  const mensajes = Array.isArray(b.mensajes) ? (b.mensajes as Mensaje[]) : [];
  if (!publica || !privada || !sujeto || mensajes.length === 0 || mensajes.length > 200) {
    return Response.json({ error: 'faltan datos' }, { status: 400 });
  }

  const resultados = await Promise.all(
    mensajes.map(async (m) => {
      if (typeof m.endpoint !== 'string' || !DESTINO.test(m.endpoint) || typeof m.payload !== 'string' || m.payload.length > 3000) {
        return { id: m.id, sub: m.sub, status: 400, error: 'destino no permitido' };
      }
      try {
        const r = await webpush.sendNotification({ endpoint: m.endpoint, keys: { p256dh: m.p256dh, auth: m.auth } }, m.payload, {
          vapidDetails: { subject: sujeto, publicKey: publica, privateKey: privada },
          TTL: 12 * 3600,
          urgency: m.urgente ? 'high' : 'normal',
          timeout: 4_000,
        });
        return { id: m.id, sub: m.sub, status: r.statusCode };
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        return { id: m.id, sub: m.sub, status: err.statusCode ?? 502, error: String(err.body || err.message || 'error').slice(0, 300) };
      }
    }),
  );
  return Response.json({ resultados }, { headers: { 'Cache-Control': 'no-store' } });
}
