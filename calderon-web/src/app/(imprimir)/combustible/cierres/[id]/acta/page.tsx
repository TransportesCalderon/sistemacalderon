import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ActaCierre } from '@/modules/combustible/components/cierres/acta-cierre';
import { idDeRuta } from '@/modules/combustible/domain/comun';
import { datosActa } from '@/modules/combustible/repositories/acta.repository';
import { createSupabaseServerClient } from '@/server/supabase/server';
import type { CierreViajeId } from '@/shared/types/dominio';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Acta de cierre de viaje' };

/**
 * Acta del cierre para imprimir o guardar como PDF. Fuera del marco de la aplicación (sin menú)
 * para que la hoja salga limpia. Solo para cierres aprobados (o anulados después de aprobarse).
 */
export default async function ActaPage({ params }: Props) {
  const ctx = await requirePermiso('combustible.cierre_viaje:ver');
  const id = idDeRuta<CierreViajeId>((await params).id);
  if (!id) notFound();
  const db = await createSupabaseServerClient();
  const datos = await datosActa(db, id);
  if (!datos) notFound();

  if (!datos.cierre.aprobadoEn) {
    return (
      <main className="mx-auto max-w-xl space-y-3 p-8 text-sm">
        <h1 className="text-lg font-semibold">Acta de cierre de viaje</h1>
        <p>El acta se emite cuando el cierre está aprobado. Este cierre todavía es un borrador.</p>
        <Link href={`/combustible/cierres/${id}`} className="text-marca hover:underline">
          Volver al cierre
        </Link>
      </main>
    );
  }
  return <ActaCierre {...datos} zonaHoraria={ctx.zonaHoraria} />;
}
