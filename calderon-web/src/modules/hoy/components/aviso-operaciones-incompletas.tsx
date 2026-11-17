'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { browserDb } from '@/shared/supabase/browser';
import { faltaEn, leerOperacionesIncompletas, resumenIncompletas, type OperacionesIncompletas } from '../operaciones-incompletas';

/** La misma consulta para el cartel y para marcar los renglones (clave bajo «pendientes»: se refresca al guardar una operación). */
export const useOperacionesIncompletas = () =>
  useQuery<OperacionesIncompletas>({
    queryKey: ['pendientes', 'operaciones-incompletas'] as const,
    queryFn: () => leerOperacionesIncompletas(browserDb()),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });

/** Qué le falta a una operación (por su número), o null. Para marcarla en rojo en las listas. */
export function useFaltaEnOperacion(numero: number | string): string | null {
  const { data } = useOperacionesIncompletas();
  const o = data?.operaciones.find((x) => x.numero === String(numero));
  return o ? faltaEn(o) : null;
}

/**
 * Cartel rojo arriba de Hoy, de Operaciones y de la Pizarra: cuántas operaciones están sin cliente o sin precio y cuáles.
 * A Operaciones le muestra todas; a Gerencia, las que pasaron el plazo sin que Operaciones las resuelva. Si no hay, no aparece.
 */
export function AvisoOperacionesIncompletas() {
  const { data } = useOperacionesIncompletas();
  const [abierto, setAbierto] = useState(false);
  if (!data || data.total === 0 || data.alcance === 'nada') return null;
  const gerencia = data.alcance === 'vencidas';
  const dias = (n: number) => (n <= 0 ? 'cargada hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`);
  return (
    <section role="alert" className="rounded-xl border-2 border-error bg-error-suave p-4">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex w-full items-start gap-3 text-left">
        <TriangleAlert className="mt-0.5 size-6 shrink-0 text-error" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-error">
            {resumenIncompletas(data)}
            {gerencia && ` · llevan ${data.plazoGerenciaDias} días o más sin resolverse`}
          </span>
          <span className="block text-sm text-tinta">
            {gerencia
              ? 'Operaciones todavía no completó estos datos. Sin ellos no se pueden facturar.'
              : `Sin estos datos no se pueden facturar ni marcar como entregadas. Hay que completarlos hoy${
                  data.vencidas > 0 ? `: ${data.vencidas} ya pasaron los ${data.plazoGerenciaDias} días y las está viendo Gerencia.` : '.'
                }`}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-error">
          {abierto ? 'Ocultar' : 'Ver cuáles'} {abierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
      </button>
      {abierto && (
        <ul className="mt-3 divide-y divide-error/20 rounded-lg bg-panel">
          {data.operaciones.map((o) => (
            <li key={o.servicioId}>
              <Link href={`/operacion/operaciones?op=${encodeURIComponent(o.numero)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-hover">
                <span className="font-mono font-semibold text-marca">{o.numero}</span>
                <span className="font-medium text-error">{faltaEn(o)}</span>
                <span className="min-w-0 flex-1 text-sm text-tinta-suave">
                  {[o.faltaCliente ? null : o.cliente, o.linea, o.estado === 'entregado' ? 'ya entregada' : null, gerencia && o.cargadaPor ? `la cargó ${o.cargadaPor}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className={o.vencida ? 'text-sm font-semibold text-error' : 'text-sm text-tinta-suave'}>{dias(o.dias)}</span>
              </Link>
            </li>
          ))}
          {data.total > data.operaciones.length && <li className="px-3 py-2 text-sm text-tinta-suave">Y {data.total - data.operaciones.length} más.</li>}
        </ul>
      )}
    </section>
  );
}
