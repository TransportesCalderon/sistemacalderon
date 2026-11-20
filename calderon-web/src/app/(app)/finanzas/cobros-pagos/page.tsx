import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CobrosPagosPantalla } from '@/modules/finanzas/components/cobros-pagos-pantalla';

export const metadata: Metadata = { title: 'Cobros y pagos' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Finanzas › Cobros y pagos (migración 73).
 * 20/11/2026 (plan de simplificación, cambio 4): «Entradas y salidas» pasó a Bancos › Movimientos; la dirección vieja lleva ahí.
 */
export default async function Pagina({ searchParams }: Props) {
  await requirePermiso('finanzas.cobros_pagos:ver');
  if ((await searchParams).ver === 'movimientos') redirect('/conciliacion?vista=movimientos');
  return (
    <Suspense>
      <CobrosPagosPantalla />
    </Suspense>
  );
}
