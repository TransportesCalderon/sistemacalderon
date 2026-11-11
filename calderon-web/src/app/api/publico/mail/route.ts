import nodemailer from 'nodemailer';

/**
 * Migración 244 · Manda un mail por SMTP. La llama solo la base (tarea de cada minuto): le pasa el mail y los datos de
 * la cuenta, con la contraseña sacada del Vault. No guarda nada ni usa variables de entorno con claves: sin una
 * cuenta SMTP válida no sirve para nada. Contesta { ok, error, tipo } para que la base anote cómo le fue.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export async function POST(request: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }
  const servidor = String(b.servidor ?? '').trim();
  const puerto = Number(b.puerto ?? 465);
  const usuario = String(b.usuario ?? '').trim();
  const clave = String(b.clave ?? '');
  const de = String(b.de ?? usuario).trim();
  const para = String(b.para ?? '')
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const asunto = String(b.asunto ?? '').slice(0, 300);
  const html = String(b.html ?? '');
  // Migración 245: imágenes dentro del mail (la foto del chofer), referenciadas con cid:
  const adjuntos = (Array.isArray(b.adjuntos) ? (b.adjuntos as Record<string, unknown>[]) : [])
    .slice(0, 3)
    .filter((a) => typeof a.base64 === 'string' && /^[A-Za-z0-9+/=]+$/.test(a.base64) && a.base64.length <= 200_000 && /^[a-z0-9-]+$/.test(String(a.cid)))
    .map((a) => ({
      filename: String(a.nombre ?? 'imagen.jpg').replace(/[^\w.-]/g, '').slice(0, 60) || 'imagen.jpg',
      content: Buffer.from(String(a.base64), 'base64'),
      contentType: ['image/jpeg', 'image/png'].includes(String(a.tipo)) ? String(a.tipo) : 'image/jpeg',
      cid: String(a.cid),
    }));
  if (!/^[a-z0-9.-]+$/i.test(servidor) || ![25, 465, 587, 2525].includes(puerto) || !usuario || !clave || !MAIL.test(de)) {
    return Response.json({ ok: false, error: 'Faltan o están mal los datos de la cuenta SMTP' });
  }
  if (para.length === 0 || para.length > 10 || !para.every((x) => MAIL.test(x)) || html.length > 300_000) {
    return Response.json({ ok: false, error: 'Destinatarios o contenido no válidos' });
  }
  try {
    const t = nodemailer.createTransport({
      host: servidor,
      port: puerto,
      secure: puerto === 465,
      auth: { user: usuario, pass: clave },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await t.sendMail({ from: de, to: para, subject: asunto, html, attachments: adjuntos });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const err = e as { code?: string; responseCode?: number; message?: string };
    const auth = err.code === 'EAUTH' || err.responseCode === 535;
    return Response.json(
      {
        ok: false,
        tipo: auth ? 'autenticacion' : 'envio',
        error: auth ? 'Usuario o contraseña SMTP incorrectos' : String(err.message ?? 'No se pudo mandar').slice(0, 300),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
