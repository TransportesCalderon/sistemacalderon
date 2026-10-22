import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { MisGastos } from '@/modules/chofer/components/mis-gastos';

export const metadata: Metadata = { title: 'Mis gastos' };

/** Chofer › Mis gastos: fondo fijo y gastos del camión con su comprobante (migración 61). */
export default async function Pagina() {
  await requirePermiso('chofer.mis_gastos:ver');
  return <MisGastos />;
}
