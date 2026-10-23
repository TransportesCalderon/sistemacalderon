import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { FacturacionPantalla } from '@/modules/ventas/components/facturacion-pantalla';

export const metadata: Metadata = { title: 'Facturación' };

/** Ventas › Facturación y cobranzas (migración 67). */
export default async function Pagina() {
  await requirePermiso('ventas.facturacion:ver');
  return (
    <Suspense>
      <FacturacionPantalla />
    </Suspense>
  );
}
