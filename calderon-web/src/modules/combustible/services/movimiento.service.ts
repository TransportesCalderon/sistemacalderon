import type { Db } from '@/shared/repository/types';
import type { Descarga, MovimientoConMotivo } from '../domain/movimiento.schemas';
import { cargaRepository } from '../repositories/carga.repository';
import { movimientoRepository } from '../repositories/movimiento.repository';

/**
 * Casos de uso de Movimientos del camión. Sin reglas propias: cada operación es una función
 * de la base (destino válido, período abierto, aprobación por otro usuario, reverso con
 * todas sus patas).
 */
export function movimientoService(db: Db) {
  const repo = movimientoRepository(db);
  const solicitudes = cargaRepository(db);
  return {
    descargar: (d: Descarga) => repo.descargar(d),
    conMotivo: (d: MovimientoConMotivo) => repo.conMotivo(d),
    resolver: (movimientoId: number, aprobar: boolean, motivo: string | null) => repo.resolver(movimientoId, aprobar, motivo),
    solicitarReverso: (movimientoId: number, motivo: string) => repo.solicitarReverso(movimientoId, motivo),
    /** El reverso se resuelve como cualquier solicitud de corrección (fue.fn_resolver_solicitud). */
    resolverReverso: (solicitudId: number, aprobar: boolean, motivo: string | null) => solicitudes.resolverSolicitud(solicitudId, aprobar, motivo),
    retirarReverso: (solicitudId: number) => solicitudes.retirarSolicitud(solicitudId),
  };
}
