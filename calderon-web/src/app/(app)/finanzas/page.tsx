import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { TableroFinanzas } from '@/modules/finanzas/components/tablero';

export const metadata: Metadata = { title: 'Tablero financiero' };

/** Finanzas › Tablero financiero (antes «Resumen»; migración 73). */
export default async function Pagina() {
  await requirePermiso('finanzas.resumen:ver');
  return <TableroFinanzas />;
}
