'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, FileText, Printer } from 'lucide-react';
import { Cargando, Chip, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { nombrePeriodo } from '@/modules/chofer/domain/chofer.types';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { TARJETA } from '@/shared/ui/clases';
import { ETIQUETA_ESTADO_LIQ, pesos } from '../domain/liquidacion.types';
import { useMisLiquidaciones } from '../queries/hooks';
import { Recibo } from './recibo';
import { TONO_LIQ } from './liquidaciones-pantalla';

/** Chofer › Mis liquidaciones: las aprobadas y pagadas, con el detalle (solo lectura). */
export function MisLiquidaciones() {
  const { data, isLoading, isError, refetch } = useMisLiquidaciones();
  const [abierta, setAbierta] = useState<number | null>(null);

  if (isLoading) return <Cargando texto="Buscando tus liquidaciones…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudieron leer tus liquidaciones." onReintentar={() => void refetch()} />;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/chofer" className="inline-flex items-center gap-1 text-sm text-marca">
        <ChevronLeft className="size-4" /> Mi carga
      </Link>
      <h1 className="text-2xl font-semibold text-tinta">Mis liquidaciones</h1>
      {data.length === 0 ? (
        <div className={cn(TARJETA, 'space-y-2 p-6 text-center')}>
          <FileText className="mx-auto size-8 text-tinta-suave" />
          <p className="text-sm text-tinta-suave">Todavía no tenés liquidaciones aprobadas. Aparecen acá cuando RRHH las aprueba.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((l) => (
            <li key={l.id} className={cn(TARJETA, 'p-4')}>
              <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setAbierta(abierta === l.id ? null : l.id)}>
                <div>
                  <p className="font-semibold text-tinta first-letter:uppercase">{nombrePeriodo(l.periodo)}</p>
                  <p className="text-xs text-tinta-suave">
                    Del {formatearFechaDia(l.desde)} al {formatearFechaDia(l.hasta)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums text-tinta">{pesos(l.legal && l.legal.totalHaberes > 0 ? l.legal.aPagar : l.neto, l.moneda)}</p>
                  <Chip tono={TONO_LIQ[l.estado]}>{ETIQUETA_ESTADO_LIQ[l.estado]}</Chip>
                </div>
                <ChevronDown className={cn('size-4 shrink-0 text-tinta-suave transition-transform', abierta === l.id && 'rotate-180')} />
              </button>
              {abierta === l.id && (
                <div className="mt-4 space-y-3 border-t border-borde pt-4">
                  <Recibo l={l} compacto />
                  <Link href={`/chofer/liquidaciones/${l.id}/recibo`} target="_blank" className="inline-flex items-center gap-1 text-sm text-marca">
                    <Printer className="size-4" /> Ver los papeles (liquidación de sueldo, planilla y egreso)
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
