'use client';

import { useState } from 'react';
import { Check, ExternalLink, Fuel, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { useAvisosTanqueBajo, useTanqueBajoVisto } from '../../queries/hooks';

export const VERSION_TANQUE_BAJO = 177;

/**
 * Migración 177 · Ventana emergente «Tanque bajo» (sensor en 20 % o menos), en cualquier pantalla.
 * La base decide a quién mostrársela (Telemetría y los que marque TI); «Entendido» la saca para ese usuario.
 */
export function AvisosTanqueBajo() {
  const { zonaHoraria } = useSesion();
  const hay = useBaseTiene(VERSION_TANQUE_BAJO);
  const recibe = useCan('telemetria.mapa:ver') && hay;
  const { data } = useAvisosTanqueBajo(recibe);
  const visto = useTanqueBajoVisto();
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
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="titulo-tanque">
      <div className="relative w-full max-w-md space-y-4 rounded-xl border border-alerta/50 bg-panel p-5 shadow-xl">
        <button type="button" onClick={cerrar} aria-label="Cerrar" className="absolute right-3 top-3 rounded p-1 text-tinta-suave hover:bg-borde/40">
          <X className="size-5" />
        </button>
        <h2 id="titulo-tanque" className="flex items-center gap-2 pr-8 text-lg font-semibold text-alerta">
          <Fuel className="size-5" /> Tanque bajo
        </h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-tinta-suave">Tractor</dt>
          <dd className="font-semibold text-tinta">{a.tractor}</dd>
          <dt className="text-tinta-suave">Chofer</dt>
          <dd className="text-tinta">{a.chofer ?? '—'}</dd>
          <dt className="text-tinta-suave">Sensor</dt>
          <dd className="text-tinta">
            {formatearNumero(a.ultimoPct, 0)} %{a.litros !== null ? ` (unos ${formatearNumero(a.litros, 0)} L en el tanque principal)` : ''}
          </dd>
          <dt className="text-tinta-suave">Desde</dt>
          <dd className="text-tinta">{formatearFechaHora(a.desde, zonaHoraria)}</dd>
        </dl>
        {pendientes.length > 1 && <p className="text-xs text-tinta-suave">Hay {pendientes.length - 1} aviso(s) más después de este.</p>}
        <div className="flex flex-wrap gap-2">
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
