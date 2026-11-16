import { RepoError, type Db } from '@/shared/repository/types';
import { parsearPendientesEnex, type PendientesEnex } from '../domain/enex.types';

const ok = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new RepoError(r.error as never);
  return r.data;
};

/** Shell 02 · Cargas de Shell Card (Enex): la base decide quién puede y valida todo. */
export function enexRepository(db: Db) {
  const ops = () => db.schema('ops');
  return {
    pendientes: async (): Promise<PendientesEnex> => parsearPendientesEnex(ok(await ops().rpc('fn_enex_pendientes'))),
    registrar: async (id: number, estacionId: number | null) => {
      ok(await ops().rpc('fn_enex_registrar', { p_id: id, p_estacion: estacionId }));
    },
    corregir: async (id: number) => {
      ok(await ops().rpc('fn_enex_corregir', { p_id: id }));
    },
    descartar: async (id: number, motivo: string) => {
      ok(await ops().rpc('fn_enex_descartar', { p_id: id, p_motivo: motivo }));
    },
  };
}
