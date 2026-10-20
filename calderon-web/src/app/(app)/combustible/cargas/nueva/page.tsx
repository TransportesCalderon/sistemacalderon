import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CargaForm } from '@/modules/combustible/components/cargas/carga-form';
import { CargaGensetPantalla } from '@/modules/combustible/components/genset/carga-genset-pantalla';
import { idDe } from '@/modules/combustible/domain/comun';
import { combustibleQueries as q } from '@/modules/combustible/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Nueva carga' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Alta de carga. ?camion= preselecciona el camión; ?reemplaza= registra la carga que sustituye a una anulada; ?destino=genset carga un genset (migración 48). */
export default async function NuevaCargaPage({ searchParams }: Props) {
  await requirePermiso('combustible.cargas:editar');
  const sp = await searchParams;
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([
    qc.prefetchQuery(q.catalogos.camiones(db)),
    qc.prefetchQuery(q.catalogos.estaciones(db)),
    qc.prefetchQuery(q.catalogos.choferes(db)),
    qc.prefetchQuery(q.catalogos.monedas(db)),
  ]);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      {sp.destino === 'genset' ? (
        <CargaGensetPantalla gensetInicial={idDe(sp, 'genset') ?? null} />
      ) : (
        <CargaForm camionInicial={idDe(sp, 'camion') ?? null} reemplazaId={idDe(sp, 'reemplaza') ?? null} />
      )}
    </HydrationBoundary>
  );
}
