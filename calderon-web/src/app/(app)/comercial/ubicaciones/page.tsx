import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { UbicacionesPantalla } from '@/modules/catalogos/components/ubicaciones';

export const metadata: Metadata = { title: 'Ubicaciones' };

/** Comercial > Ubicaciones: puertos, base y clientes. */
export default async function Pagina() {
  await requirePermiso('comercial.ubicaciones:ver');
  return <UbicacionesPantalla />;
}
