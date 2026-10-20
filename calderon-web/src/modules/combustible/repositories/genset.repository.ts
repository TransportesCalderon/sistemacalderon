import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaISO } from '@/shared/types/dominio';
import type { RegistroGenset } from '../domain/genset.schemas';
import { parsearFichaGenset, type FichaGenset, type GensetCombustible } from '../domain/genset.types';

/** Combustible de los gensets (migración 48). Todo lo calcula la base; su mensaje se muestra tal cual. */
export const gensetRepository = (db: Db) => {
  const fue = () => db.schema('fue');
  return {
    async lista(): Promise<GensetCombustible[]> {
      const { data, error } = await fue().rpc('fn_gensets_combustible');
      if (error) throw new RepoError(error);
      return (data ?? []).map((g) => ({
        gensetId: g.genset_id,
        codigo: g.codigo,
        semi: g.semi,
        capacidadL: g.capacidad_l === null ? null : Number(g.capacidad_l),
        consumoLh: g.consumo_lh === null ? null : Number(g.consumo_lh),
        consumoRealLh: g.consumo_real_lh === null ? null : Number(g.consumo_real_lh),
        ultimo: g.ultimo_ts as FechaISO | null,
        ultimoHorometroH: g.ultimo_horometro_h === null ? null : Number(g.ultimo_horometro_h),
        vueltaInicioId: g.vuelta_inicio_id,
        vueltaDesde: g.vuelta_desde as FechaISO | null,
        vueltaChofer: g.vuelta_chofer,
        porCerrar: g.por_cerrar,
        descuentosL: Number(g.descuentos_l ?? 0),
      }));
    },

    async ficha(gensetId: number): Promise<FichaGenset> {
      const { data, error } = await fue().rpc('fn_genset_ficha', { p_genset: gensetId });
      if (error) throw new RepoError(error);
      return parsearFichaGenset((data ?? {}) as Record<string, unknown>);
    },

    async registrar(d: RegistroGenset): Promise<number> {
      const { data, error } = await fue().rpc('fn_registrar_genset', {
        p_datos: {
          genset_id: d.gensetId,
          tipo: d.tipo,
          fecha_hora: d.fechaHora,
          litros: d.litros,
          horometro_h: d.horometroH,
          tanque_lleno: d.tipo === 'carga' ? d.tanqueLleno : false,
          vacio: d.tipo === 'descarga' ? d.vacio : false,
          chofer_id: d.choferId,
          camion_id: d.camionId,
          estacion_id: d.tipo === 'carga' ? d.estacionId : null,
          precio_unitario: d.tipo === 'carga' ? d.precioUnitario : null,
          moneda: d.tipo === 'carga' ? d.moneda : null,
          ticket_numero: d.tipo === 'carga' ? d.ticketNumero : null,
          deposito_id: d.tipo === 'descarga' ? d.depositoId : null,
          observacion: d.observacion,
        },
      });
      if (error) throw new RepoError(error);
      return data;
    },

    async eliminar(registroId: number, motivo: string): Promise<void> {
      const { error } = await fue().rpc('fn_eliminar_registro_genset', { p_registro: registroId, p_motivo: motivo });
      if (error) throw new RepoError(error);
    },

    async cerrar(inicioId: number, choferId: number | null, motivoChofer: string | null, ok: boolean, observacion: string | null): Promise<number> {
      const { data, error } = await fue().rpc('fn_cerrar_genset', {
        p_inicio: inicioId,
        p_chofer: choferId,
        p_motivo_chofer: motivoChofer,
        p_ok_tolerancia: ok,
        p_observacion: observacion,
      });
      if (error) throw new RepoError(error);
      return data;
    },

    async anular(cierreId: number, motivo: string): Promise<void> {
      const { error } = await fue().rpc('fn_anular_cierre_genset', { p_cierre: cierreId, p_motivo: motivo });
      if (error) throw new RepoError(error);
    },
  };
};
