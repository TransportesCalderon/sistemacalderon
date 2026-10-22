import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { MiCarga } from '@/modules/chofer/components/mi-carga';

export const metadata: Metadata = { title: 'Mi carga' };

/** Chofer › Mi carga: la operación asignada, sus documentos y compartir la ubicación (migración 60). */
export default async function Pagina() {
  await requirePermiso('chofer.mi_carga:ver');
  return <MiCarga />;
}
