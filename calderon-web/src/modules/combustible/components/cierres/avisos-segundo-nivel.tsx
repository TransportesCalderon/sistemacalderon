'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { useEsperanSegundoNivel } from '../../queries/hooks';

/**
 * Migración 200 · Ventana para quien da la segunda aprobación: cierres que descuentan menos que la diferencia
 * (ya con la primera aprobación) y pedidos de quitar un descuento. La base decide a quién; «Más tarde» la
 * cierra hasta que se recargue la página.
 */
export function AvisosSegundoNivel() {
  const recibe = useCan('combustible.cierre_viaje:ver');
  const { data } = useEsperanSegundoNivel(recibe);
  const [cerrada, setCerrada] = useState(false);
  const lista = data ?? [];
  if (!recibe || cerrada || lista.length === 0) return null;
  const l = (v: number | null) => (v === null ? '—' : `${formatearNumero(v, 1)} L`);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="titulo-2n">
      <div className="relative w-full max-w-lg space-y-4 rounded-xl border border-alerta/50 bg-panel p-5 shadow-xl">
        <button type="button" onClick={() => setCerrada(true)} aria-label="Cerrar" className="absolute right-3 top-3 rounded p-1 text-tinta-suave hover:bg-borde/40">
          <X className="size-5" />
        </button>
        <h2 id="titulo-2n" className="flex items-center gap-2 pr-8 text-lg font-semibold text-alerta">
          <ShieldCheck className="size-5" /> Esperan tu segunda aprobación
        </h2>
        <p className="text-sm text-tinta-suave">Se le descuenta al chofer menos que la diferencia de combustible: falta tu aprobación.</p>
        <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
          {lista.map((e) => (
            <li key={`${e.tipo}${e.cierreId}`} className="rounded-md border border-borde p-2">
              <Link href={`/combustible/cierres/${e.cierreId}`} className="font-medium text-marca hover:underline" onClick={() => setCerrada(true)}>
                {e.numero} · {e.patente}
              </Link>
              <span className="block text-xs text-tinta-suave">
                {e.chofer ?? 'Sin chofer'} ·{' '}
                {e.tipo === 'cierre'
                  ? `diferencia ${l(e.diferenciaL)}, se descuentan ${l(e.aDescontarL)} · 1.ª aprobación: ${e.primeraPor ?? '—'}`
                  : `pedido de quitar el descuento de ${l(e.quitarL)} (${e.primeraPor ?? '—'}): ${e.motivo ?? ''}`}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setCerrada(true)}>
          Más tarde
        </button>
      </div>
    </div>
  );
}
