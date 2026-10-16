import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { BasePantalla } from '@/modules/combustible/components/base/base-pantalla';

export const metadata: Metadata = { title: 'Base Mendoza' };

/** Tanque de Base Mendoza (migraciones 24 y 30). */
export default async function Pagina() {
  await requirePermiso('combustible.depositos:ver');
  return <BasePantalla />;
}
