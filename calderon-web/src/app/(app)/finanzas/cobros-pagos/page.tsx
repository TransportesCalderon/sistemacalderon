import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CobrosPagosPantalla } from '@/modules/finanzas/components/cobros-pagos-pantalla';

export const metadata: Metadata = { title: 'Cobros y pagos' };

/** Finanzas › Cobros y pagos (migración 73). */
export default async function Pagina() {
  await requirePermiso('finanzas.cobros_pagos:ver');
  return (
    <Suspense>
      <CobrosPagosPantalla />
    </Suspense>
  );
}
