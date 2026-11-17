'use client';

import { cn } from '@/shared/lib/cn';
import { dinero } from '../domain/finanzas.types';
import type { Saldo } from '../domain/saldos-por-tercero';

/** Vencido, por vencer y total de cada moneda, en una línea por moneda. */
export function SaldosLinea({ saldos, className }: { saldos: Saldo[]; className?: string }) {
  return (
    <span className={cn('flex flex-col gap-0.5 tabular-nums', className)}>
      {saldos.map((s) => (
        <span key={s.moneda}>
          {s.vencido > 0 && <span className="text-error">Vencido {dinero(s.vencido, s.moneda)} · </span>}
          {s.porVencer > 0 && <span className="text-tinta-suave">Por vencer {dinero(s.porVencer, s.moneda)} · </span>}
          <span className="font-semibold text-tinta">Total {dinero(s.total, s.moneda)}</span>
        </span>
      ))}
    </span>
  );
}

/** Resumen general arriba de la lista: una tarjeta por moneda con lo vencido, lo que falta vencer y el total. */
export function SaldosResumen({ totales }: { totales: Saldo[] }) {
  if (totales.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {totales.map((s) => (
        <div key={s.moneda} className="rounded-lg border border-borde bg-panel p-3 text-sm">
          <p className="text-xs font-medium tracking-wide text-tinta-suave uppercase">{s.moneda}</p>
          <p className="mt-1 flex justify-between gap-2">
            <span className="text-error">Vencido</span>
            <span className="font-medium tabular-nums text-error">{dinero(s.vencido, s.moneda)}</span>
          </p>
          <p className="flex justify-between gap-2">
            <span className="text-tinta-suave">Por vencer</span>
            <span className="tabular-nums">{dinero(s.porVencer, s.moneda)}</span>
          </p>
          <p className="mt-1 flex justify-between gap-2 border-t border-borde pt-1">
            <span className="font-medium">Total</span>
            <span className="font-semibold tabular-nums">{dinero(s.total, s.moneda)}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
