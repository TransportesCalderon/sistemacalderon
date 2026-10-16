import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { EstacionesPantalla } from '@/modules/catalogos/components/estaciones';

export const metadata: Metadata = { title: 'Estaciones de servicio' };

/** Estaciones de servicio (migración 28). */
export default async function Pagina() {
  await requirePermiso('comercial.proveedores:ver');
  return <EstacionesPantalla />;
}
