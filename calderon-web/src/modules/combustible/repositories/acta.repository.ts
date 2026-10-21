import { RepoError, type Db } from '@/shared/repository/types';
import type { CierreViajeId } from '@/shared/types/dominio';
import { parsearActa, type ActaExtra } from '../domain/acta.types';
import type { CierreViaje } from '../domain/cierre.types';
import { cierreRepository } from './cierre.repository';
import { nombresDe } from './catalogo-combustible.repository';

/** Lo que necesita el acta de un cierre: el cierre y los nombres a mostrar (sin cálculos). */
export interface FuenteActa {
  cierre: CierreViaje;
  camion: string;
  chofer: string | null;
  aprobador: string | null;
  /** Migración 56: todo lo que el chofer necesita entender del viaje. */
  extra: ActaExtra;
}

export async function datosActa(db: Db, id: CierreViajeId): Promise<FuenteActa | null> {
  const cierre = await cierreRepository(db).obtener(id);
  if (!cierre) return null;
  const choferId = cierre.congelado?.choferResponsableId ?? cierre.datos.choferResponsableId;
  const [camion, nombres, aprobador, acta] = await Promise.all([
    db.schema('mae').from('camion').select('codigo_interno, patente').eq('id', cierre.camionId).maybeSingle(),
    nombresDe(db, { choferes: choferId ? [choferId] : [] }),
    cierre.aprobadoPor === null
      ? Promise.resolve({ data: null, error: null })
      : db.schema('seg').from('usuario').select('nombre').eq('id', cierre.aprobadoPor).maybeSingle(),
    db.schema('fue').rpc('fn_acta_cierre', { p_cierre: id }),
  ]);
  if (acta.error) throw new RepoError(acta.error);
  if (camion.error) throw new RepoError(camion.error);
  if (aprobador.error) throw new RepoError(aprobador.error);
  return {
    cierre,
    camion: camion.data ? `${camion.data.codigo_interno} · ${camion.data.patente}` : `Camión #${cierre.camionId}`,
    chofer: choferId ? (nombres.chofer.get(choferId) ?? `Chofer #${choferId}`) : null,
    aprobador: aprobador.data?.nombre ?? (cierre.aprobadoPor === null ? null : `Usuario #${cierre.aprobadoPor}`),
    extra: parsearActa(acta.data),
  };
}
