import { RepoError, type Db } from '@/shared/repository/types';
import { parsearPendientesRemitos, type PendientesRemitos } from '../domain/remitos.types';

const ok = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new RepoError(r.error as never);
  return r.data;
};

/** Migración 277 · Remitos de las estaciones que llegan por mail: la base decide quién puede y valida todo. */
export function remitosRepository(db: Db) {
  const ops = () => db.schema('ops');
  return {
    pendientes: async (): Promise<PendientesRemitos> => parsearPendientesRemitos(ok(await ops().rpc('fn_remitos_pendientes'))),
    registrar: async (id: number, estacionId: number | null) => {
      ok(await ops().rpc('fn_remito_registrar', { p_id: id, p_estacion: estacionId }));
    },
    corregir: async (id: number) => {
      ok(await ops().rpc('fn_remito_corregir', { p_id: id }));
    },
    descartar: async (id: number, motivo: string) => {
      ok(await ops().rpc('fn_remito_descartar', { p_id: id, p_motivo: motivo }));
    },
    /** El PDF tal cual llegó por mail. */
    pdf: async (id: number): Promise<{ nombre: string; base64: string }> => {
      const j = ok(await ops().rpc('fn_remito_pdf', { p_id: id })) as { nombre?: string; base64?: string } | null;
      return { nombre: String(j?.nombre ?? 'remito.pdf'), base64: String(j?.base64 ?? '') };
    },
  };
}
