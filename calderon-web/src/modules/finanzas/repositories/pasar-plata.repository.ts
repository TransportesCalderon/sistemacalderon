import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/database.generated';
import {
  parsearCuentasHoy,
  parsearTransferenciaHecha,
  type AnularTransferenciaEntrada,
  type CuentasHoy,
  type PasarPlataEntrada,
  type TransferenciaHecha,
} from '../domain/pasar-plata';

/** La base todavía no tiene la migración 388 (la función no existe). */
const FUNCION_INEXISTENTE = new Set(['PGRST202', '42883']);

/** Migración 388 · Las cuentas en «Hoy» y transferir entre cuentas. La base valida todo; su mensaje se muestra tal cual. */
export function pasarPlataRepository(db: Db) {
  const fin = () => db.schema('fin');
  return {
    /** Cada cuenta en su moneda, el cambio del día y las últimas transferencias; null si la base todavía no lo tiene. */
    async cuentasHoy(): Promise<CuentasHoy | null> {
      const { data, error } = await fin().rpc('fn_cuentas_hoy');
      if (error) {
        if (FUNCION_INEXISTENTE.has((error as { code?: string }).code ?? '')) return null;
        throw new RepoError(error);
      }
      return parsearCuentasHoy(data);
    },
    /** Anota una transferencia entre dos cuentas propias (con cambio de moneda si son distintas). */
    async pasar(d: PasarPlataEntrada): Promise<TransferenciaHecha> {
      const { data, error } = await fin().rpc('fn_pasar_plata', {
        p_datos: {
          cuenta_dinero_id: d.desdeId,
          destino_id: d.haciaId,
          fecha: d.fecha,
          monto: d.salio,
          monto_destino: d.llego,
          descripcion: d.descripcion,
        } as Json,
      });
      if (error) throw new RepoError(error);
      return parsearTransferenciaHecha(data);
    },
    async anular(d: AnularTransferenciaEntrada): Promise<void> {
      const { error } = await fin().rpc('fn_pasar_plata_anular', { p_id: d.id, p_motivo: d.motivo });
      if (error) throw new RepoError(error);
    },
  };
}
