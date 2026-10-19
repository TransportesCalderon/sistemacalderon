import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { LineasPantalla } from '@/modules/logistica/components/lineas';

export const metadata: Metadata = { title: 'Líneas' };

/** Operación > Líneas (migración 41). */
export default async function Pagina() {
  await requirePermiso('operacion.servicios:ver');
  return <LineasPantalla />;
}
