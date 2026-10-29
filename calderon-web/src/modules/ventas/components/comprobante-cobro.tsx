'use client';

import { useState } from 'react';
import { FileText, LoaderCircle, Paperclip } from 'lucide-react';
import { abrirArchivo, borrarArchivo, subirArchivo } from '@/modules/chofer/components/archivos';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import type { ErrorAccion } from '@/server/actions/result';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { VERSION_DETALLE } from '../domain/detalle';
import type { Factura } from '../domain/ventas.types';
import { useGuardarComprobanteCobro } from '../queries/hooks';

/**
 * Migración 125 · Comprobante de pago del cobro (foto o PDF). Antes de subirlo se comprime
 * (shared/lib/archivo.ts): fotos a JPEG más chico y PDF pesados re-armados con páginas livianas.
 * Queda en Storage (carpeta cobros/<factura>) y la base guarda la ruta en la factura.
 */
export async function subirComprobante(facturaId: number, archivo: File) {
  const r = await subirArchivo(archivo, `cobros/${facturaId}`);
  return { ruta: r.ruta, nombre: r.nombre };
}

const errorDe = (e: unknown): ErrorAccion => ({ codigo: 'desconocido', mensaje: e instanceof Error ? e.message : 'No se pudo subir el archivo.' });

/** Elegir el archivo (foto o PDF). */
export function CampoComprobante({ archivo, onArchivo }: { archivo: File | null; onArchivo: (a: File | null) => void }) {
  const hay = useBaseTiene(VERSION_DETALLE);
  if (!hay) return null;
  return (
    <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm text-marca hover:underline">
      <Paperclip className="size-4" />
      <span className="max-w-56 truncate">{archivo ? archivo.name : 'Adjuntar comprobante de pago'}</span>
      <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => onArchivo(e.target.files?.[0] ?? null)} />
    </label>
  );
}

/**
 * Sube el archivo y lo deja en la factura (si ya había uno, borra el anterior de Storage).
 * Devuelve el error para mostrarlo, o null si salió bien.
 */
export function useAdjuntarComprobante() {
  const guardar = useGuardarComprobanteCobro();
  const [ocupado, setOcupado] = useState(false);
  const adjuntar = async (facturaId: number, archivo: File): Promise<ErrorAccion | null> => {
    setOcupado(true);
    try {
      let sub: { ruta: string; nombre: string };
      try {
        sub = await subirComprobante(facturaId, archivo);
      } catch (e) {
        return errorDe(e);
      }
      const r = await guardar.mutateAsync({ id: facturaId, ruta: sub.ruta, nombre: sub.nombre });
      if (!r.ok) {
        void borrarArchivo(sub.ruta);
        return r.error;
      }
      if (r.data) void borrarArchivo(r.data);
      return null;
    } finally {
      setOcupado(false);
    }
  };
  return { adjuntar, ocupado };
}

/** En la factura emitida o cobrada: ver el comprobante, o subirlo / cambiarlo. */
export function ComprobanteCobro({ f, puede }: { f: Factura; puede: boolean }) {
  const hay = useBaseTiene(VERSION_DETALLE);
  const { adjuntar, ocupado } = useAdjuntarComprobante();
  const [error, setError] = useState<ErrorAccion | null>(null);
  if (!hay || !['emitida', 'vencida', 'cobrada'].includes(f.estado)) return null;
  if (!f.comprobanteRuta && (!puede || f.estado !== 'cobrada')) return null;
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {f.comprobanteRuta && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-marca hover:underline"
            onClick={async () => {
              const e = await abrirArchivo(f.comprobanteRuta!);
              setError(e ? { codigo: 'desconocido', mensaje: e } : null);
            }}
          >
            <FileText className="size-4" /> Comprobante de pago{f.comprobanteNombre && ` (${f.comprobanteNombre})`}
          </button>
        )}
        {puede && (
          <label className="inline-flex cursor-pointer items-center gap-1 text-tinta-suave hover:underline">
            {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {f.comprobanteRuta ? 'Cambiar' : 'Adjuntar el comprobante de pago'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              disabled={ocupado}
              onChange={async (e) => {
                const a = e.target.files?.[0];
                e.target.value = '';
                if (a) setError(await adjuntar(f.id, a));
              }}
            />
          </label>
        )}
      </div>
      <ErrorBase error={error} />
    </div>
  );
}
