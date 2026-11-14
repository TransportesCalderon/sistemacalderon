'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Siren, Wrench, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { BotonCopiar } from '@/modules/telemetria/components/boton-copiar';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { useAvisosOt, useOtVista } from '../../queries/hooks';

/**
 * Migración 199 · Ventana emergente de órdenes de trabajo para Mantenimiento: OT nueva (la suya, o sin asignar
 * para el Jefe) y OT atrasada (una vez por día). La base decide a quién; «Entendido» la saca.
 * Migración 225: «en la base ahora», urgente y primero: el equipo con órdenes abiertas está en la base (una vez por
 * cada vez que entra; a todo Mantenimiento).
 */
export function AvisosOt() {
  const recibe = useCan('mantenimiento.ordenes:ver');
  const { data } = useAvisosOt(recibe);
  const visto = useOtVista();
  const [cerrados, setCerrados] = useState<number[]>([]);
  const pendientes = (data ?? []).filter((x) => !cerrados.includes(x.id));
  const a = pendientes[0];
  if (!recibe || !a) return null;
  const cerrar = () => {
    setCerrados((c) => [...c, a.id]);
    visto.mutate({ id: a.id });
  };
  const atrasada = a.tipo === 'atrasada';
  const enBase = a.tipo === 'en_base';

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="titulo-ot">
      <div
        className={cn(
          'relative w-full max-w-md space-y-4 rounded-xl border bg-panel p-5 shadow-xl',
          enBase ? 'border-2 border-error ring-4 ring-error/20' : atrasada || a.prioridad === 'urgente' ? 'border-error/50' : 'border-marca/40',
        )}
      >
        <button type="button" onClick={cerrar} aria-label="Cerrar" className="absolute right-3 top-3 rounded p-1 text-tinta-suave hover:bg-borde/40">
          <X className="size-5" />
        </button>
        <h2 id="titulo-ot" className={cn('flex items-center gap-2 pr-8 text-lg font-semibold', atrasada || enBase ? 'text-error' : 'text-tinta')}>
          {enBase ? <Siren className="size-5 animate-pulse" /> : <Wrench className="size-5" />}
          {enBase
            ? `Urgente: ${a.patente} está en la base`
            : atrasada
              ? 'Orden de trabajo atrasada'
              : a.asignada
                ? 'Te asignaron una orden de trabajo'
                : 'Orden de trabajo nueva'}
        </h2>
        {enBase && (
          <p className="text-sm font-medium text-tinta">
            {a.cantidad === 1 ? 'Tiene 1 orden de trabajo abierta' : `Tiene ${a.cantidad} órdenes de trabajo abiertas`}: aprovechá ahora que está en {a.lugar ?? 'la base'}.
          </p>
        )}
        <p className="max-h-[50vh] overflow-y-auto whitespace-pre-line rounded-md bg-hover p-3 text-sm text-tinta">{a.mensaje}</p>
        {pendientes.length > 1 && <p className="text-xs text-tinta-suave">Hay {pendientes.length - 1} aviso(s) más después de este.</p>}
        <div className="flex flex-wrap gap-2">
          <BotonCopiar texto={a.mensaje} />
          <Link href="/ajustes/flota?vista=ordenes" className={BOTON_SECUNDARIO} onClick={cerrar}>
            <Wrench className="size-4" /> Ver órdenes
          </Link>
          <button type="button" className={BOTON_PRIMARIO} onClick={cerrar}>
            <Check className="size-4" /> Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
