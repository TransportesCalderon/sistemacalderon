import type { Db } from '@/shared/repository/types';
import type { ControlSaldoId, DepositoId } from '@/shared/types/dominio';
import type { ControlAlta, PuestaEnMarcha } from '../domain/mochila.schemas';
import { mochilaRepository } from '../repositories/mochila.repository';

export interface ResultadoPuestaEnMarcha {
  depositoId: DepositoId;
  /** Pasos hechos en esta llamada (los que ya estaban hechos se saltean). */
  pasos: ('uso' | 'mochila' | 'control_inicial')[];
}

/**
 * Casos de uso de Mochilas y controles. La puesta en marcha son tres escrituras de la base
 * (uso de mochila, depósito, control inicial medido): PostgREST no las agrupa en una
 * transacción, así que cada paso se saltea si ya está hecho y repetir la operación
 * continúa donde quedó. Las vigencias y superposiciones las valida la base.
 */
export function mochilaService(db: Db) {
  const repo = mochilaRepository(db);
  return {
    async ponerEnMarcha(d: PuestaEnMarcha): Promise<ResultadoPuestaEnMarcha> {
      const pasos: ResultadoPuestaEnMarcha['pasos'] = [];
      const usos = await repo.usos(d.camionId);
      if (!usos.some((u) => u.hastaTs === null)) {
        await repo.crearUso(d.camionId, d.paradaDesdeId);
        pasos.push('uso');
      }
      let depositoId = await repo.mochilaDesde(d.camionId, d.paradaDesdeId);
      if (!depositoId) {
        depositoId = await repo.crearMochila(d);
        pasos.push('mochila');
      }
      if (!(await repo.tieneControlInicial(depositoId))) {
        await repo.crearControl({
          depositoId,
          rol: 'inicial',
          cargaParadaId: d.paradaDesdeId,
          fechaHora: null,
          litros: d.litrosIniciales,
          fuente: 'medicion',
          metodo: d.metodo,
          declaranteTipo: null,
          choferId: null,
          observaciones: d.observaciones,
          reemplazaId: null,
          motivoReemplazo: null,
          declaranteUsuarioId: null,
        });
        pasos.push('control_inicial');
      }
      return { depositoId, pasos };
    },
    registrarUso: (camionId: number, paradaDesdeId: number) => repo.crearUso(camionId, paradaDesdeId),
    cerrarUso: (usoId: number, versionFila: number, paradaHastaId: number) => repo.cerrarUso({ id: usoId, versionFila }, paradaHastaId),
    cerrarVigencia: (depositoId: number, versionFila: number, paradaHastaId: number) => repo.cerrarVigencia({ id: depositoId, versionFila }, paradaHastaId),
    registrarControl: (d: ControlAlta, usuarioId: number): Promise<ControlSaldoId> => repo.crearControl({ ...d, declaranteUsuarioId: usuarioId }),
  };
}
