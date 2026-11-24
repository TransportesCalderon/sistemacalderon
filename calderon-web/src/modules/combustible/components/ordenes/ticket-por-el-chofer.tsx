'use client';

/* El ticket de una orden lo sube la oficina en nombre del chofer (por ejemplo, si no pudo subirlo desde el celular).
   Queda igual que si lo hubiera subido él: la orden pasa a «cargada», se le quita la traba de «Subí el ticket…» y
   aparece en «Por registrar». La base deja hacerlo a Gerencia, Adm. de combustible y TI. */
import { useState } from 'react';
import { LoaderCircle, Receipt, Trash2 } from 'lucide-react';
import { leerTicketCombustible } from '@/modules/ia/ia.actions';
import { iaRepository } from '@/modules/ia/ia.repository';
import { BUCKET_OPERACION } from '@/modules/chofer/domain/chofer.types';
import { idAleatorio, prepararArchivo, sha256Hex } from '@/shared/lib/archivo';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { useTerminarOrdenCargaOficina } from '../../queries/orden-carga.hooks';

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
async function aBase64(blob: Blob): Promise<string> {
  const b = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

type Ticket = { clave: string; estado: 'subiendo' | 'leyendo' | 'listo' | 'error'; nombre: string; ruta?: string; hash?: string; lectura?: number; litros?: number | null; error?: string };

export function TicketPorElChofer({ ordenId, numero, chofer, onCerrar }: { ordenId: number; numero: string; chofer: string | null; onCerrar: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [litros, setLitros] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<number | null | undefined>(undefined);
  const terminar = useTerminarOrdenCargaOficina();
  const ocupado = tickets.some((t) => t.estado === 'subiendo' || t.estado === 'leyendo');
  const cambiar = (clave: string, c: Partial<Ticket>) => setTickets((ts) => ts.map((t) => (t.clave === clave ? { ...t, ...c } : t)));

  const procesar = async (archivo: File, clave: string) => {
    try {
      const { blob, extension, tipo } = await prepararArchivo(archivo);
      const hash = await sha256Hex(blob);
      const ruta = `oficina/tickets-orden/${ordenId}/${idAleatorio()}.${extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'}`;
      const sub = await browserDb().storage.from(BUCKET_OPERACION).upload(ruta, blob, { contentType: tipo, upsert: false });
      if (sub.error) throw new Error(`No se pudo subir la foto: ${sub.error.message}`);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(tipo)) {
        cambiar(clave, { estado: 'listo', ruta, hash, litros: null });
        return;
      }
      cambiar(clave, { estado: 'leyendo', ruta, hash });
      const r = await leerTicketCombustible({ tipo: 'ticket_combustible', base64: await aBase64(blob), mediaType: tipo as 'image/jpeg' });
      if (!r.ok) {
        cambiar(clave, { estado: 'listo', litros: null, error: r.error.mensaje });
        return;
      }
      for (let i = 0; i < 50; i++) {
        const res = await iaRepository(browserDb()).resultado(r.data);
        if (res.estado === 'lista') {
          const l = Number((res.propuesta as Record<string, unknown> | null)?.litros);
          cambiar(clave, { estado: 'listo', lectura: r.data, litros: Number.isFinite(l) && l > 0 ? l : null });
          return;
        }
        if (res.estado === 'error') {
          cambiar(clave, { estado: 'listo', litros: null, error: res.error ?? 'Iris no pudo leer el ticket' });
          return;
        }
        await espera(1500);
      }
      cambiar(clave, { estado: 'listo', litros: null });
    } catch (e) {
      cambiar(clave, { estado: 'error', error: e instanceof Error ? e.message : 'No se pudo subir la foto' });
    }
  };

  const agregar = (lista: FileList | null) => {
    if (!lista) return;
    const archivos = Array.from(lista).slice(0, 5 - tickets.length);
    const nuevas: Ticket[] = archivos.map((a) => ({ clave: idAleatorio(), estado: 'subiendo', nombre: a.name }));
    setTickets((ts) => [...ts, ...nuevas]);
    archivos.forEach((a, i) => void procesar(a, nuevas[i]!.clave));
  };

  const leidos = tickets.filter((t) => t.litros != null).reduce((s, t) => s + (t.litros ?? 0), 0);
  const faltaLeer = tickets.some((t) => t.estado === 'listo' && t.litros == null);

  if (hecho !== undefined)
    return (
      <div className="rounded-md bg-exito/10 px-3 py-2 text-sm text-tinta">
        Listo: el ticket de {numero} quedó subido{hecho !== null ? ` (${formatearNumero(hecho, 2)} L)` : ''}, como si lo hubiera subido el chofer. Ahora registrala en «Por registrar».{' '}
        <button type="button" className="text-marca hover:underline" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    );

  return (
    <div className="space-y-2 rounded-md border border-borde bg-fondo/40 p-3 text-sm">
      <p className="text-tinta">
        Subí la foto del ticket de <strong>{numero}</strong> en nombre de {chofer ?? 'el chofer'}. Queda igual que si lo hubiera subido él y se le destraba la tarea pendiente.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${BOTON_SECUNDARIO} cursor-pointer`}>
          <Receipt className="size-4" /> Agregar foto del ticket
          <input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => agregar(e.target.files)} disabled={tickets.length >= 5} />
        </label>
        {tickets.map((t) => (
          <span key={t.clave} className="inline-flex items-center gap-1 rounded bg-panel px-2 py-1 text-xs" title={t.error}>
            {t.nombre.slice(0, 24)} ·{' '}
            {t.estado === 'subiendo' ? 'subiendo…' : t.estado === 'leyendo' ? 'Iris está leyendo…' : t.estado === 'error' ? 'error' : t.litros != null ? `${formatearNumero(t.litros, 2)} L` : 'subido'}
            {!ocupado && (
              <button type="button" aria-label="Quitar" onClick={() => setTickets((ts) => ts.filter((x) => x.clave !== t.clave))}>
                <Trash2 className="size-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {tickets.length > 0 && !ocupado && (
        <p className="text-tinta">
          {leidos > 0 ? `Iris leyó ${formatearNumero(leidos, 2)} L en total.` : 'Iris no leyó los litros.'} {(faltaLeer || leidos === 0) && 'Escribí el total del ticket:'}
        </p>
      )}
      {tickets.length > 0 && !ocupado && (faltaLeer || leidos === 0) && (
        <input
          inputMode="decimal"
          className="h-9 w-56 rounded-md border border-borde bg-panel px-3 text-sm"
          placeholder="Litros, con los decimales del ticket"
          value={litros}
          onChange={(e) => setLitros(e.target.value)}
        />
      )}
      {error && <p className="text-error">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ocupado || terminar.isPending || !tickets.some((t) => t.ruta)}
          onClick={async () => {
            setError(null);
            const manual = litros.trim() === '' ? null : Number(litros.replace(/\./g, '').replace(',', '.'));
            const r = await terminar.mutateAsync({
              id: ordenId,
              fotos: tickets.flatMap((t) => (t.ruta ? [{ ruta: t.ruta, hash: t.hash ?? '' }] : [])),
              lecturas: tickets.flatMap((t) => (t.lectura ? [t.lectura] : [])),
              litros: manual !== null && Number.isFinite(manual) && manual > 0 ? manual : null,
            });
            if (!r.ok) setError(r.error.mensaje);
            else setHecho((r.data as { litros?: number | null }).litros ?? null);
          }}
        >
          {ocupado || terminar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Receipt className="size-4" />} Enviar el ticket
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar} disabled={terminar.isPending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
