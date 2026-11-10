'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Fuel, LoaderCircle, QrCode, Receipt, Trash2, X } from 'lucide-react';
import { leerTicketChofer } from '@/modules/combustible/actions/orden-carga.actions';
import { urlQr, type MiOrden } from '@/modules/combustible/domain/orden-carga.types';
import { useMisOrdenesCarga, useTerminarOrdenCarga } from '@/modules/combustible/queries/orden-carga.hooks';
import { useSesion } from '@/modules/core/session/session-provider';
import { iaRepository } from '@/modules/ia/ia.repository';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { idAleatorio, prepararArchivo, sha256Hex } from '@/shared/lib/archivo';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { BUCKET_OPERACION } from '../domain/chofer.types';

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
async function aBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Migración 234 · La orden de carga del chofer: «Estás autorizado a cargar combustible» → un QR, sin otros datos.
 * Cuando la estación confirma, «Terminé mi carga» → las fotos de los tickets.
 */
export function OrdenCargaChofer() {
  const hay = useBaseTiene(234);
  const { data } = useMisOrdenesCarga(hay);
  const o = data?.[0];
  if (!o) return null;
  return o.estado === 'emitida' ? <Autorizado o={o} /> : <Terminar o={o} />;
}

function Autorizado({ o }: { o: MiOrden }) {
  const [ver, setVer] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    if (!ver) return;
    void QRCode.toDataURL(urlQr(window.location.origin, o.token), { width: 900, margin: 2, errorCorrectionLevel: 'M' }).then(setImg);
  }, [ver, o.token]);
  return (
    <>
      <div className="space-y-3 rounded-xl border-2 border-marca bg-marca-suave p-4">
        <p className="flex items-center gap-2 text-lg font-semibold text-marca">
          <Fuel className="size-6" /> Estás autorizado a cargar combustible
        </p>
        <button type="button" className={`${BOTON_PRIMARIO} w-full justify-center`} onClick={() => setVer(true)}>
          <QrCode className="size-5" /> Mostrar el QR
        </button>
      </div>
      {ver && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-white p-6" role="dialog" aria-modal="true" aria-label="Código QR de la carga">
          <button type="button" aria-label="Cerrar" className="absolute right-4 top-4 rounded-full p-2 text-black/60 hover:bg-black/5" onClick={() => setVer(false)}>
            <X className="size-7" />
          </button>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="Código QR" className="aspect-square w-full max-w-sm" />
          ) : (
            <LoaderCircle className="size-10 animate-spin text-black/40" />
          )}
        </div>
      )}
    </>
  );
}

type Ticket = { clave: string; vista: string; estado: 'subiendo' | 'leyendo' | 'listo' | 'error'; ruta?: string; hash?: string; lectura?: number; litros?: number | null; error?: string };

function Terminar({ o }: { o: MiOrden }) {
  const { choferId } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [litros, setLitros] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ litros: number | null } | null>(null);
  const terminar = useTerminarOrdenCarga();
  const ocupado = tickets.some((t) => t.estado === 'subiendo' || t.estado === 'leyendo');
  const cambiar = (clave: string, c: Partial<Ticket>) => setTickets((ts) => ts.map((t) => (t.clave === clave ? { ...t, ...c } : t)));

  const procesar = async (archivo: File, clave: string) => {
    try {
      const { blob, extension, tipo } = await prepararArchivo(archivo);
      const hash = await sha256Hex(blob);
      const ruta = `${choferId ?? 0}/tickets/${idAleatorio()}.${extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'}`;
      const sub = await browserDb().storage.from(BUCKET_OPERACION).upload(ruta, blob, { contentType: tipo, upsert: false });
      if (sub.error) throw new Error(`No se pudo subir la foto: ${sub.error.message}`);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(tipo)) {
        cambiar(clave, { estado: 'listo', ruta, hash, litros: null });
        return;
      }
      cambiar(clave, { estado: 'leyendo', ruta, hash });
      const r = await leerTicketChofer({ base64: await aBase64(blob), mediaType: tipo as 'image/jpeg' });
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
          cambiar(clave, { estado: 'listo', litros: null, error: res.error ?? 'La IA no pudo leer el ticket' });
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
    const nuevas: Ticket[] = Array.from(lista)
      .slice(0, 5 - tickets.length)
      .map((a) => ({ clave: idAleatorio(), vista: URL.createObjectURL(a), estado: 'subiendo' }));
    setTickets((ts) => [...ts, ...nuevas]);
    Array.from(lista)
      .slice(0, nuevas.length)
      .forEach((a, i) => void procesar(a, nuevas[i]!.clave));
  };

  const leidos = tickets.filter((t) => t.litros != null).reduce((s, t) => s + (t.litros ?? 0), 0);
  const faltaLeer = tickets.some((t) => t.estado === 'listo' && t.litros == null);

  if (hecho)
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-exito bg-exito/10 p-4 text-tinta">
        <CheckCircle2 className="size-6 text-exito" />
        <p className="text-sm">
          Carga terminada{hecho.litros !== null ? `: ${formatearNumero(hecho.litros, 0)} L` : ''}. ¡Gracias!
        </p>
      </div>
    );

  return (
    <div className="space-y-3 rounded-xl border-2 border-exito bg-exito/10 p-4">
      <p className="flex items-center gap-2 text-lg font-semibold text-tinta">
        <CheckCircle2 className="size-6 text-exito" /> La estación autorizó tu carga ({o.patente})
      </p>
      {!abierto ? (
        <button type="button" className={`${BOTON_PRIMARIO} w-full justify-center`} onClick={() => setAbierto(true)}>
          <Receipt className="size-5" /> Terminé mi carga
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-tinta">Sacale una foto a cada ticket que te dio la estación (suelen ser 2 o 3).</p>
          <label className={`${BOTON_SECUNDARIO} w-full cursor-pointer justify-center`}>
            <Receipt className="size-4" /> Agregar foto de ticket
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => agregar(e.target.files)} disabled={tickets.length >= 5} />
          </label>
          {tickets.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {tickets.map((t) => (
                <li key={t.clave} className="relative overflow-hidden rounded-md border border-borde bg-panel">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.vista} alt="Ticket" className="aspect-[3/4] w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[11px] text-white" title={t.error}>
                    {t.estado === 'subiendo' ? 'Subiendo…' : t.estado === 'leyendo' ? 'Leyendo…' : t.estado === 'error' ? 'Error' : t.litros != null ? `${formatearNumero(t.litros, 0)} L` : 'Subido'}
                  </span>
                  {!ocupado && (
                    <button
                      type="button"
                      aria-label="Quitar"
                      className="absolute right-1 top-1 rounded bg-black/50 p-1 text-white"
                      onClick={() => setTickets((ts) => ts.filter((x) => x.clave !== t.clave))}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {tickets.length > 0 && !ocupado && (
            <p className="text-sm text-tinta">
              {leidos > 0 ? `La IA leyó ${formatearNumero(leidos, 0)} L en total.` : 'La IA no leyó los litros.'} {faltaLeer && 'Si falta algún ticket, escribí el total:'}
            </p>
          )}
          {tickets.length > 0 && !ocupado && (faltaLeer || leidos === 0) && (
            <input
              inputMode="decimal"
              className="h-10 w-full rounded-md border border-borde bg-panel px-3 text-sm"
              placeholder="Total de litros cargados"
              value={litros}
              onChange={(e) => setLitros(e.target.value)}
            />
          )}
          {error && <p className="text-sm text-error">{error}</p>}
          <button
            type="button"
            className={`${BOTON_PRIMARIO} w-full justify-center`}
            disabled={ocupado || terminar.isPending}
            onClick={async () => {
              setError(null);
              const manual = litros.trim() === '' ? null : Number(litros.replace(/\./g, '').replace(',', '.'));
              const r = await terminar.mutateAsync({
                id: o.id,
                fotos: tickets.flatMap((t) => (t.ruta ? [{ ruta: t.ruta, hash: t.hash ?? '' }] : [])),
                lecturas: tickets.flatMap((t) => (t.lectura ? [t.lectura] : [])),
                litros: manual !== null && Number.isFinite(manual) && manual > 0 ? manual : null,
              });
              if (!r.ok) setError(r.error.mensaje);
              else setHecho({ litros: (r.data as { litros?: number | null }).litros ?? null });
            }}
          >
            {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Enviar los tickets
          </button>
        </div>
      )}
    </div>
  );
}
