import type { Db } from '@/shared/repository/types';
import type { CargaId, SolicitudId } from '@/shared/types/dominio';
import type { CargaAlta } from '../domain/carga.schemas';
import { cargaRepository } from '../repositories/carga.repository';

/**
 * Casos de uso de Cargas. Sin reglas propias: cada operación es una escritura o una
 * función de la base, que valida el corte de viaje, el faltante, el período cerrado y
 * la aprobación por otro usuario (C3a).
 */
export function cargaService(db: Db) {
  const repo = cargaRepository(db);
  return {
    crear: (d: CargaAlta): Promise<CargaId> => repo.crear(d),
    solicitarAnulacion: (cargaId: number, motivo: string): Promise<SolicitudId> => repo.solicitarAnulacion(cargaId, motivo),
    /** Migración 44: elimina del todo una carga cargada por error (las reglas las aplica la base). */
    eliminar: (cargaId: number, motivo: string): Promise<void> => repo.eliminar(cargaId, motivo),
    /** Aprueba (ejecuta la anulación) o rechaza. Devuelve la carga, para refrescar su ficha. */
    async resolver(solicitudId: number, aprobar: boolean, motivo: string | null): Promise<CargaId | null> {
      const cargaId = await repo.cargaDeSolicitud(solicitudId);
      await repo.resolverSolicitud(solicitudId, aprobar, motivo);
      return cargaId;
    },
    async retirar(solicitudId: number): Promise<CargaId | null> {
      const cargaId = await repo.cargaDeSolicitud(solicitudId);
      await repo.retirarSolicitud(solicitudId);
      return cargaId;
    },
  };
}
