import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { EmpresasPantalla } from '@/modules/ventas/components/empresas-pantalla';

export const metadata: Metadata = { title: 'Clientes y prospectos' };

/** Ventas › Clientes y prospectos (migración 67). */
export default async function Pagina() {
  await requirePermiso('ventas.empresas:ver');
  return <EmpresasPantalla />;
}
