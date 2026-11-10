import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_RANKING } from '@/shared/ui/pestanas-secciones';
import { RankingMensualPantalla } from '@/modules/telemetria/components/ranking-mensual';
import { ConsumoChoferesPantalla } from '@/modules/combustible/components/consumo/consumo-choferes';

export const metadata: Metadata = { title: 'Ranking de choferes' };

/** Viajes › Ranking de choferes: los mejores choferes de cada mes por Puntaje IronTrack (migración 103). */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Migración 223: «Choferes con consumo alto» como vista de esta pantalla. */
export default async function Pagina({ searchParams }: Props) {
  await requirePermiso('telemetria.sesiones:ver');
  const sp = await searchParams;
  return (
    <>
      <Pestanas items={PESTANAS_RANKING} />
      {sp.vista === 'consumo' ? <ConsumoChoferesPantalla /> : <RankingMensualPantalla />}
    </>
  );
}
