'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, ExternalLink, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { fechaDia, textoDias } from '../../domain/vencimientos.types';
import { useAvisosVencimiento, useVencimientoVisto } from '../../queries/hooks';

/**
 * Migración 198 · Ventana emergente de vencimientos (técnica, matafuego), en cualquier pantalla.
 * La base decide a quién y qué mostrar (vencidos siempre; por vencer con el equipo en la Región
 * Metropolitana). «Entendido» la saca hasta el día siguiente.
 */
export function AvisosVencimiento() {
  const recibe = useCan('mantenimiento.vencimientos:ver');
  const { data } = useAvisosVencimiento(recibe);
  const visto = useVencimientoVisto();
  const [cerrados, setCerrados] = useState<number[]>([]);
  const pendientes = (data ?? []).filter((x) => !cerrados.includes(x.id));
  const a = pendientes[0];
  if (!recibe || !a) return null;
  const cerrar = () => {
    setCerrados((c) => [...c, a.id]);
    visto.mutate({ id: a.id });
  };
  const vencido = a.estado === 'vencido';
  const mapa = a.lat !== null && a.lng !== null ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}` : null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="titulo-venc">
      <div className={cn('relative w-full max-w-md space-y-4 rounded-xl border bg-panel p-5 shadow-xl', vencido ? 'border-error/50' : 'border-alerta/50')}>
        <button type="button" onClick={cerrar} aria-label="Cerrar" className="absolute right-3 top-3 rounded p-1 text-tinta-suave hover:bg-borde/40">
          <X className="size-5" />
        </button>
        <h2 id="titulo-venc" className={cn('flex items-center gap-2 pr-8 text-lg font-semibold', vencido ? 'text-error' : 'text-alerta')}>
          <CalendarClock className="size-5" /> {a.tipo} {vencido ? 'vencida' : 'por vencer'}
        </h2>
        <p className="text-sm text-tinta">
          {vencido ? 'Está vencida: hay que hacerla cuanto antes.' : `Hay que hacer la ${a.tipo.toLowerCase()}: el equipo está en la Región Metropolitana.`}
        </p>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-tinta-suave">{a.equipo === 'tractor' ? 'Tractor' : 'Semi'}</dt>
          <dd className="font-mono font-semibold text-tinta">{a.patente}</dd>
          {a.detalle && (
            <>
              <dt className="text-tinta-suave">Cuál</dt>
              <dd className="text-tinta">{a.detalle}</dd>
            </>
          )}
          <dt className="text-tinta-suave">Vence</dt>
          <dd className={cn('font-semibold', vencido ? 'text-error' : 'text-alerta')}>
            {fechaDia(a.vence)} ({textoDias(a.dias)})
          </dd>
          <dt className="text-tinta-suave">Dónde está</dt>
          <dd className="text-tinta">
            {a.ubicacion ?? (a.enZona ? 'Región Metropolitana' : a.lat !== null ? 'Fuera de la Región Metropolitana' : 'Sin ubicación')}
            {a.tractor && ` · con ${a.tractor}`}
          </dd>
        </dl>
        {pendientes.length > 1 && <p className="text-xs text-tinta-suave">Hay {pendientes.length - 1} aviso(s) más después de este.</p>}
        <div className="flex flex-wrap gap-2">
          <Link href="/ajustes/flota?vista=vencimientos" className={BOTON_SECUNDARIO} onClick={cerrar}>
            <CalendarClock className="size-4" /> Ver vencimientos
          </Link>
          {mapa && (
            <a href={mapa} target="_blank" rel="noreferrer" className={BOTON_SECUNDARIO}>
              <ExternalLink className="size-4" /> Ver dónde está
            </a>
          )}
          <button type="button" className={BOTON_PRIMARIO} onClick={cerrar}>
            <Check className="size-4" /> Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
