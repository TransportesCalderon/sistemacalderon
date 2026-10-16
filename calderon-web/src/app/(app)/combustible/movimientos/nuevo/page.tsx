import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { MovimientoForm } from '@/modules/combustible/components/movimientos/movimiento-form';
import { idDe } from '@/modules/combustible/domain/comun';
import { combustibleQueries as q } from '@/modules/combustible/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Registrar movimiento del camión' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Alta de descarga o movimiento con motivo. ?camion= preselecciona el camión. */
export default async function NuevoMovimientoPage({ searchParams }: Props) {
  await requirePermiso('combustible.movimientos:editar');
  const sp = await searchParams;
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([
    qc.prefetchQuery(q.catalogos.camiones(db)),
    qc.prefetchQuery(q.catalogos.choferes(db)),
    qc.prefetchQuery(q.movimientos.tanquesBase(db)),
  ]);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MovimientoForm camionInicial={idDe(sp, 'camion') ?? null} />
    </HydrationBoundary>
  );
}
