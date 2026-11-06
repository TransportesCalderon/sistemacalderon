import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_EQUIPOS } from '@/shared/ui/pestanas-secciones';
import { CamionesLista } from '@/modules/flota/components/camiones/camiones-lista';
import { VencimientosPantalla } from '@/modules/flota/components/vencimientos/vencimientos-pantalla';
import { OrdenesPantalla } from '@/modules/flota/components/mantenimiento/ordenes-pantalla';
import { PlanPantalla } from '@/modules/flota/components/mantenimiento/plan-pantalla';
import { parsearListaCamiones } from '@/modules/flota/domain/camion.lista';
import { camionesQueries, catalogosFlotaQueries } from '@/modules/flota/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Camiones' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** P-MAE-01 · Lista de camiones. Precarga en el servidor e hidrata React Query. */
export default async function CamionesPage({ searchParams }: Props) {
  await requirePermiso('flota.camiones:ver');
  const sp = await searchParams;
  // Migración 198 · Mantenimiento › Vencimientos (técnicas y matafuegos), vista de esta pantalla
  if (sp.vista === 'vencimientos') {
    await requirePermiso('mantenimiento.vencimientos:ver');
    return <VencimientosPantalla />;
  }
  // Migración 199 · Mantenimiento › Órdenes de trabajo y Plan de mantenimiento
  if (sp.vista === 'ordenes') {
    await requirePermiso('mantenimiento.ordenes:ver');
    return <OrdenesPantalla />;
  }
  if (sp.vista === 'plan') {
    await requirePermiso('mantenimiento.plan:ver');
    return <PlanPantalla />;
  }
  const params = parsearListaCamiones(sp);

  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([qc.prefetchQuery(camionesQueries.lista(db, params)), qc.prefetchQuery(catalogosFlotaQueries.obtener(db))]);

  return (
    <>
      <Pestanas items={PESTANAS_EQUIPOS} />
      <HydrationBoundary state={dehydrate(qc)}>
        <CamionesLista />
      </HydrationBoundary>
    </>
  );
}
