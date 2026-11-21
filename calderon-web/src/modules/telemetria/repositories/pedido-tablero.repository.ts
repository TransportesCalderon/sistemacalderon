import { RepoError, type Db } from '@/shared/repository/types';
import { parsearMisPedidosTablero, parsearPedidosTablero, type MiPedidoTablero, type PedidosTablero } from '../domain/pedido-tablero';

/** Migración 297 · La foto del tablero a pedido de Telemetría: lo decide y controla la base; la web pide y muestra. */
export const pedidoTableroRepository = (db: Db) => ({
  /** Seguimiento de viajes: a qué camiones se les puede pedir y los pedidos vigentes. */
  async lista(): Promise<PedidosTablero> {
    const { data, error } = await db.schema('tel').rpc('fn_pedidos_tablero');
    if (error) throw new RepoError(error);
    return parsearPedidosTablero(data);
  },
  /** Mi viaje: lo que Telemetría le pidió al chofer y todavía no subió. */
  async misPedidos(): Promise<MiPedidoTablero[]> {
    const { data, error } = await db.schema('tel').rpc('fn_mis_pedidos_tablero');
    if (error) throw new RepoError(error);
    return parsearMisPedidosTablero(data);
  },
  async pedir(viajeId: number, motivo: string | null): Promise<{ id: number; nuevo: boolean }> {
    const { data, error } = await db.schema('tel').rpc('fn_pedir_tablero', { p_viaje: viajeId, p_motivo: motivo });
    if (error) throw new RepoError(error);
    const r = (data ?? {}) as { id?: unknown; nuevo?: unknown };
    return { id: Number(r.id ?? 0), nuevo: r.nuevo === true };
  },
  async anular(id: number): Promise<void> {
    const { error } = await db.schema('tel').rpc('fn_anular_pedido_tablero', { p_id: id });
    if (error) throw new RepoError(error);
  },
});
