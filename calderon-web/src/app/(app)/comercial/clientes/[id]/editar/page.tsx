import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ClienteForm } from '@/modules/comercial/components/clientes/cliente-form';
import { catalogosComercialQueries, clientesQueries } from '@/modules/comercial/queries/keys';
import { idClienteDeRuta, precargarCliente } from '@/modules/comercial/queries/precarga';

export const metadata: Metadata = { title: 'Editar cliente' };

type Props = { params: Promise<{ id: string }> };

/** P-CLI-01 · Edición de cliente (Operaciones y Finanzas). Inactivar y bloquear son cambios de estado. */
export default async function EditarClientePage({ params }: Props) {
  await requirePermiso('comercial.clientes:editar');
  const id = idClienteDeRuta((await params).id);
  if (!id) notFound();

  const { db, qc, cliente } = await precargarCliente(id);
  if (!cliente) notFound();
  if (cliente.eliminadoEn) redirect(`/comercial/clientes/${id}`);
  await Promise.all([qc.prefetchQuery(catalogosComercialQueries.obtener(db)), qc.prefetchQuery(clientesQueries.segmentos(db))]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ClienteForm modo="edicion" cliente={cliente} />
    </HydrationBoundary>
  );
}
