'use client';

import Link from 'next/link';
import { Fuel } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { TARJETA } from '@/shared/ui/clases';
import { useAvisosCarga } from '../queries/hooks';

/** Migración 89: camiones que llegaron a una estación en las últimas 12 horas y cuánto les faltaba para llenar. */
export function AvisosCargaOficina() {
  const { zonaHoraria } = useSesion();
  const { data } = useAvisosCarga(12);
  if (!data || data.length === 0) return null;
  return (
    <section className={cn(TARJETA, 'space-y-2 p-3')} aria-label="Llegando a cargar">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-tinta">
        <Fuel className="size-4 text-marca" /> Llegaron a cargar (últimas 12 horas)
      </h2>
      <ul className="divide-y divide-borde text-sm">
        {data.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span>
              <span className="font-mono font-medium text-tinta">{a.patente}</span>
              <span className="text-tinta-suave">
                {' '}
                · {a.estacion} · {formatearFechaHora(a.creadoEn, zonaHoraria)}
                {a.chofer ? ` · ${a.chofer}` : ''}
              </span>
            </span>
            <span className="tabular-nums">
              Faltaban ≈ <b>{formatearNumero(a.litros, 0)} L</b>
              {a.cargado ? (
                <span className={cn('ml-2', a.cargado.litros > a.litros * 1.1 ? 'font-medium text-error' : 'text-exito')}>
                  cargó {formatearNumero(a.cargado.litros, 0)} L
                </span>
              ) : a.camionId ? (
                <Link href={`/combustible/cargas/nueva?camion=${a.camionId}`} className="ml-2 text-marca hover:underline">
                  Registrar carga
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
