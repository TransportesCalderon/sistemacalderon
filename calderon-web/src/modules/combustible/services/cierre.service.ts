import type { Db } from '@/shared/repository/types';
import type { CierreViajeId } from '@/shared/types/dominio';
import type { CierreViaje, DatosBorrador } from '../domain/cierre.types';
import { cierreRepository } from '../repositories/cierre.repository';

/**
 * Casos de uso del cierre de viaje. Ninguna regla propia: los límites del viaje, los
 * pendientes, las tolerancias y la verificación los resuelve la base.
 */
export function cierreService(db: Db) {
  const repo = cierreRepository(db);
  return {
    /** Abre el borrador del viaje que sale de esa frontera (si ya existe, devuelve ese). */
    async crearBorrador(camionId: number, cargaSalidaId: number): Promise<CierreViajeId> {
      const existente = await repo.deViaje(cargaSalidaId);
      if (existente) return existente;
      return (await repo.crear(camionId, cargaSalidaId)).id;
    },
    guardar: (id: number, versionFila: number, datos: DatosBorrador): Promise<CierreViaje> => repo.guardar({ id, versionFila }, datos),
    /** Vuelve a guardar: la base toma la frontera de llegada vigente del camión. */
    actualizarLimites: (id: number, versionFila: number): Promise<CierreViaje> => repo.guardar({ id, versionFila }),
    aprobar: (id: number, versionFila: number): Promise<CierreViaje> => repo.aprobar({ id, versionFila }),
    anular: (id: number, versionFila: number, motivo: string): Promise<CierreViaje> => repo.anular({ id, versionFila }, motivo),
  };
}
