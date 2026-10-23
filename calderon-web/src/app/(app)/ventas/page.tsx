import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { TableroVentas } from '@/modules/ventas/components/tablero';

export const metadata: Metadata = { title: 'Ventas' };

/** Ventas › Tablero (migración 67). */
export default async function Pagina() {
  await requirePermiso('ventas.tablero:ver');
  return <TableroVentas />;
}
