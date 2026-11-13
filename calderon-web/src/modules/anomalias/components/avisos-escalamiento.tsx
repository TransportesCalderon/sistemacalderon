'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Siren, X } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { useAvisosEscalamiento, useEscalamientoVisto } from '../queries/hooks';
import { HistorialGestionLista, ResolverProrroga } from './gestion-alerta';

/**
 * Migración 189 · Ventana emergente para quienes reciben escalamientos (los marca TI; al instalar,
 * Gerencia): alertas vencidas sin resolver y pedidos de prórroga, con todo el historial (responsable,
 * cuándo se creó, qué se hizo, qué falta, reasignaciones). La base decide a quién mostrársela.
 */
export function AvisosEscalamiento() {
  const { zonaHoraria } = useSesion();
  const { data } = useAvisosEscalamiento(true);
  const visto = useEscalamientoVisto();
  const [cerrados, setCerrados] = useState<string[]>([]);
  const pendientes = (data ?? []).filter((x) => !cerrados.includes(`${x.motivo}:${x.id}`));
  const a = pendientes[0];
  if (!a) return null;
  const cerrar = () => {
    setCerrados((c) => [...c, `${a.motivo}:${a.id}`]);
    visto.mutate({ alertaId: a.id });
  };
  const titulo = a.motivo === 'prorroga' ? 'Pedido de prórroga' : 'Alerta vencida sin resolver';

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="titulo-escalamiento">
      <div className="relative max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-error/40 bg-panel p-5 shadow-xl">
        <button type="button" onClick={cerrar} aria-label="Cerrar" className="absolute right-3 top-3 rounded p-1 text-tinta-suave hover:bg-borde/40">
          <X className="size-5" />
        </button>
        <h2 id="titulo-escalamiento" className="flex items-center gap-2 pr-8 text-lg font-semibold text-error">
          <Siren className="size-5" /> {titulo}
        </h2>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-tinta-suave">Alerta</dt>
          <dd className="font-semibold text-tinta">
            {a.tipo} · gravedad {a.severidad}
          </dd>
          <dt className="text-tinta-suave">Tractor</dt>
          <dd className="text-tinta">{a.patente ?? '—'}</dd>
          <dt className="text-tinta-suave">Chofer</dt>
          <dd className="text-tinta">{a.chofer ?? '—'}</dd>
          <dt className="text-tinta-suave">Cuándo pasó</dt>
          <dd className="text-tinta">{a.ocurrio ? formatearFechaHora(a.ocurrio, zonaHoraria) : '—'}</dd>
        </dl>
        <HistorialGestionLista h={a.gestion} />
        {a.gestion.prorroga && <ResolverProrroga p={a.gestion.prorroga} />}
        {pendientes.length > 1 && <p className="text-xs text-tinta-suave">Hay {pendientes.length - 1} aviso(s) más después de este.</p>}
        <div className="flex flex-wrap gap-2">
          <Link href="/anomalias/alertas" className={BOTON_SECUNDARIO} onClick={cerrar}>
            Ir a Alertas
          </Link>
          <button type="button" className={BOTON_PRIMARIO} onClick={cerrar}>
            <Check className="size-4" /> Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
