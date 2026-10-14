import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ClienteFicha } from '@/modules/comercial/components/clientes/cliente-ficha';
import { catalogosComercialQueries } from '@/modules/comercial/queries/keys';
import { idClienteDeRuta, precargarCliente } from '@/modules/comercial/queries/precarga';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idClienteDeRuta((await params).id);
  if (!id) return { title: 'Cliente' };
  const { cliente } = await precargarCliente(id);
  return { title: cliente ? cliente.razonSocial : 'Cliente' };
}

/** P-CLI-01 · Ficha del cliente. */
export default async function ClientePage({ params }: Props) {
  await requirePermiso('comercial.clientes:ver');
  const id = idClienteDeRuta((await params).id);
  if (!id) notFound();

  const { db, qc, cliente } = await precargarCliente(id);
  if (!cliente) notFound();
  await qc.prefetchQuery(catalogosComercialQueries.obtener(db));

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ClienteFicha id={id} />
    </HydrationBoundary>
  );
}
