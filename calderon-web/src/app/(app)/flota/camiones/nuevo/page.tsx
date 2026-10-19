import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CamionForm, type CamionSugerido } from '@/modules/flota/components/camiones/camion-form';
import { catalogosFlotaQueries } from '@/modules/flota/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Nuevo camión' };

/** F-MAE-01 · Alta de camión (Operaciones y TI). */
/** Datos sugeridos por la URL (Telemetría > Mapa de flota > «Dar de alta»). Solo texto: el formulario y la base validan. */
function sugeridoDe(sp: Record<string, string | string[] | undefined>): CamionSugerido {
  const t = (k: string) => {
    const v = sp[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s.slice(0, 60) : undefined;
  };
  const r: CamionSugerido = {};
  const patente = t('patente');
  const pais = t('pais');
  const vin = t('vin');
  const marca = t('marca');
  const modelo = t('modelo');
  if (patente) r.patente = patente;
  if (pais && /^[A-Z]{2}$/.test(pais)) r.paisPatente = pais;
  if (vin) r.vin = vin;
  if (marca) r.marca = marca;
  if (modelo) r.modelo = modelo;
  return r;
}

export default async function NuevoCamionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermiso('flota.camiones:editar');

  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await qc.prefetchQuery(catalogosFlotaQueries.obtener(db));

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CamionForm modo="alta" sugerido={sugeridoDe(await searchParams)} />
    </HydrationBoundary>
  );
}
