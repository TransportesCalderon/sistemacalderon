import { ImapFlow } from 'imapflow';
import { partesPdf } from '@/server/mail/partes-pdf';

/**
 * Migración 277 · Lee la casilla por IMAP y devuelve los PDF de los mails nuevos de ciertos remitentes (los remitos que
 * mandan las estaciones). La llama solo la base (tarea de cada 10 minutos), con la cuenta del SMTP y la contraseña
 * sacada del Vault en el momento, igual que /api/publico/mail. No guarda nada, no usa variables de entorno con claves
 * y no marca los mails como leídos. Contesta { ok, mensajes: [{ id, de, asunto, fecha, adjuntos: [{ nombre, tipo, base64 }] }] }.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MAX_PDF = 4_000_000;

type Adjunto = { nombre: string; tipo: string; base64: string };
type Mensaje = { id: string; de: string; asunto: string; fecha: string | null; adjuntos: Adjunto[] };

async function leerTodo(s: NodeJS.ReadableStream, max: number): Promise<Buffer | null> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const c of s as AsyncIterable<Buffer | string>) {
    const b = typeof c === 'string' ? Buffer.from(c) : c;
    total += b.length;
    if (total > max) return null;
    partes.push(b);
  }
  return Buffer.concat(partes);
}

export async function POST(request: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }
  const servidor = String(b.servidor ?? '').trim();
  const puerto = Number(b.puerto ?? 993);
  const usuario = String(b.usuario ?? '').trim();
  const clave = String(b.clave ?? '');
  const remitentes = (Array.isArray(b.remitentes) ? b.remitentes : []).map((x) => String(x).trim().toLowerCase()).filter((x) => MAIL.test(x)).slice(0, 20);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(b.desde ?? '')) ? new Date(`${String(b.desde)}T00:00:00Z`) : new Date(Date.now() - 3 * 86_400_000);
  const conocidos = new Set((Array.isArray(b.conocidos) ? b.conocidos : []).map((x) => String(x)));
  const max = Math.min(Math.max(Number(b.max ?? 8) || 8, 1), 20);
  if (!/^[a-z0-9.-]+$/i.test(servidor) || ![143, 993].includes(puerto) || !usuario || !clave) {
    return Response.json({ ok: false, error: 'Faltan o están mal los datos de la cuenta' });
  }
  if (remitentes.length === 0) return Response.json({ ok: true, revisados: 0, mensajes: [] });

  const cliente = new ImapFlow({
    host: servidor,
    port: puerto,
    secure: puerto === 993,
    auth: { user: usuario, pass: clave },
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  const mensajes: Mensaje[] = [];
  let revisados = 0;
  try {
    await cliente.connect();
    const candado = await cliente.getMailboxLock('INBOX');
    try {
      const uids = new Set<number>();
      for (const r of remitentes) {
        const res = await cliente.search({ since: desde, from: r }, { uid: true });
        for (const u of res || []) uids.add(u);
      }
      const lista = [...uids].sort((x, y) => x - y);
      const nuevos: { uid: number; id: string; de: string; asunto: string; fecha: string | null; pdfs: { parte: string; nombre: string }[] }[] = [];
      if (lista.length > 0) {
        for await (const m of cliente.fetch(lista, { uid: true, envelope: true, bodyStructure: true }, { uid: true })) {
          revisados += 1;
          const de = String(m.envelope?.from?.[0]?.address ?? '').toLowerCase();
          const id = String(m.envelope?.messageId ?? `uid-${m.uid}`);
          if (!remitentes.includes(de) || conocidos.has(id)) continue;
          const pdfs = partesPdf(m.bodyStructure);
          if (pdfs.length === 0) continue;
          nuevos.push({ uid: m.uid, id, de, asunto: String(m.envelope?.subject ?? ''), fecha: m.envelope?.date ? new Date(m.envelope.date).toISOString() : null, pdfs });
        }
      }
      // Los adjuntos se bajan después de recorrer la lista (IMAP no deja bajar mientras se recorre)
      for (const n of nuevos.slice(0, max)) {
        const adjuntos: Adjunto[] = [];
        for (const p of n.pdfs.slice(0, 3)) {
          const d = await cliente.download(String(n.uid), p.parte, { uid: true });
          const buf = d?.content ? await leerTodo(d.content, MAX_PDF) : null;
          if (buf && buf.subarray(0, 4).toString('latin1') === '%PDF') {
            adjuntos.push({ nombre: p.nombre.replace(/[^\w .()-]/g, '').slice(0, 120) || 'remito.pdf', tipo: 'application/pdf', base64: buf.toString('base64') });
          }
        }
        if (adjuntos.length > 0) mensajes.push({ id: n.id, de: n.de, asunto: n.asunto.slice(0, 300), fecha: n.fecha, adjuntos });
      }
    } finally {
      candado.release();
    }
    await cliente.logout();
    return Response.json({ ok: true, revisados, mensajes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    try {
      cliente.close();
    } catch {
      // ya estaba cerrada
    }
    const err = e as { authenticationFailed?: boolean; message?: string; responseText?: string };
    return Response.json(
      {
        ok: false,
        tipo: err.authenticationFailed ? 'autenticacion' : 'lectura',
        error: err.authenticationFailed ? 'Usuario o contraseña del mail incorrectos (IMAP)' : String(err.responseText ?? err.message ?? 'No se pudo leer la casilla').slice(0, 300),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
