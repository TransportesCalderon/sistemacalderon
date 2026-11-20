import type { Metadata } from 'next';
import { requireSession } from '@/modules/core/auth/guards';
import { SeguimientoCliente } from '@/modules/cliente/components/seguimiento-cliente';

export const metadata: Metadata = { title: 'Mis cargas en camino' };

/** Migración 288 · La única pantalla del usuario de un cliente: el mapa con los camiones que llevan su carga. */
export default async function SeguimientoClientePage({ searchParams }: { searchParams: Promise<{ clave?: string }> }) {
  await requireSession();
  const { clave } = await searchParams;
  return <SeguimientoCliente pedirClave={clave === '1'} />;
}
