'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, TriangleAlert, X } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { VERSION_RUTAS_PANTALLA } from '../../domain/rutas';
import { useAvisosDesvio, useDesvioVisto } from '../../queries/hooks';

/** Quiénes reciben la ventana emergente (la base decide además cuándo: Gerencia, pasados 30 minutos). */
const ROLES_AVISO = ['analista_control', 'gerencia'];

/**
 * Migración 156 · Ventana emergente «Camión fuera de la ruta», en cualquier pantalla. La base dice qué
 * desvíos mostrarle a cada usuario; «Entendido» lo saca para ese usuario.
 * La ventana se cierra en el acto (aunque la base tarde o falle), así nunca deja la pantalla trabada.
 */
export function AvisosDesvio() {
  const { rolesApp, zonaHoraria } = useSesion();
  const hay = useBaseTiene(VERSION_RUTAS_PANTALLA);
  const recibe = hay && rolesApp.some((r) => ROLES_AVISO.includes(r));
  const { data } = useAvisosDesvio(recibe);
  const visto = useDesvioVisto();
  const [cerrados, setCerrados] = useState<number[]>([]);
  const pendientes = (data ?? []).filter((x) => !cerrados.includes(x.id));
  const a = pendientes[0];
  if (!recibe || !a) return null;
  const cerrar = () => {
    setCerrados((c) => [...c, a.id]);
    visto.mutate({ id: a.id });
  };
  const mapa = a.lat !== null && a.lng !== null ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}` : null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="titulo-desvio">
      <div className="relative w-full max-w-md space-y-4 rounded-xl border border-error/40 bg-panel p-5 shadow-xl">
        <button type="button" onClick={cerrar} aria-label="Cerrar" className="absolute right-3 top-3 rounded p-1 text-tinta-suave hover:bg-borde/40">
          <X className="size-5" />
        </button>
        <h2 id="titulo-desvio" className="flex items-center gap-2 pr-8 text-lg font-semibold text-error">
          <TriangleAlert className="size-5" /> Camión fuera de la ruta
        </h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-tinta-suave">Tractor</dt>
          <dd className="font-semibold text-tinta">{a.tractor}</dd>
          <dt className="text-tinta-suave">Chofer</dt>
          <dd className="text-tinta">{a.chofer ?? '—'}</dd>
          <dt className="text-tinta-suave">Operación</dt>
          <dd className="text-tinta">{a.numero ? `${a.numero} · ${a.cliente}` : 'Movimiento (sin operación)'}</dd>
          <dt className="text-tinta-suave">Fuera desde</dt>
          <dd className="text-tinta">
            {formatearFechaHora(a.desde, zonaHoraria)} ({a.minutos} min)
          </dd>
          <dt className="text-tinta-suave">Distancia</dt>
          <dd className="text-tinta">
            {a.km} km de la ruta{a.kmMax > a.km ? ` (llegó a ${a.kmMax} km)` : ''}
          </dd>
        </dl>
        {pendientes.length > 1 && <p className="text-xs text-tinta-suave">Hay {pendientes.length - 1} aviso(s) más después de este.</p>}
        <div className="flex flex-wrap gap-2">
          {mapa && (
            <a href={mapa} target="_blank" rel="noreferrer" className={BOTON_SECUNDARIO}>
              <ExternalLink className="size-4" /> Ver dónde está
            </a>
          )}
          <Link href="/pizarra/rutas" className={BOTON_SECUNDARIO}>
            Ver la ruta
          </Link>
          <button type="button" className={BOTON_PRIMARIO} onClick={cerrar}>
            <Check className="size-4" /> Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
