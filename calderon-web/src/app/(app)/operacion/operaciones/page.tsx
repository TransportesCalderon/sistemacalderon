import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { OperacionesPantalla } from '@/modules/logistica/components/operaciones-pantalla';

export const metadata: Metadata = { title: 'Operaciones' };

/** Operación > Operaciones (Logística, migración 41). ?op=<nro> abre la ficha de esa operación. */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ op?: string }> }) {
  await requirePermiso('operacion.servicios:ver');
  const p = await searchParams;
  const op = p.op && /^\d+$/.test(p.op) ? Number(p.op) : undefined;
  return <OperacionesPantalla opInicial={op} />;
}
