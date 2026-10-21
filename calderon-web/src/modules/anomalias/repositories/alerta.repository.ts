import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaISO } from '@/shared/types/dominio';
import { num } from '@/modules/combustible/domain/comun';
import { parsearDetalle, type Alerta, type DetalleAlerta, type Decision, type Regla, type Vista } from '../domain/alerta.types';

/** Alertas (migración 49). Todo lo decide la base; su mensaje se muestra tal cual. */
export const alertaRepository = (db: Db) => {
  const ana = () => db.schema('ana');
  return {
    async bandeja(vista: Vista, desde: string | null, hasta: string | null): Promise<Alerta[]> {
      const { data, error } = await ana().rpc('fn_bandeja_alertas', { p_vista: vista, p_desde: desde, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return (data ?? []).map((a) => ({
        id: a.id,
        codigo: a.codigo,
        tipo: a.tipo,
        categoria: a.categoria,
        severidad: a.severidad,
        estado: a.estado,
        resolucion: a.resolucion,
        camionId: a.camion_id,
        patente: a.patente,
        choferId: a.chofer_id,
        chofer: a.chofer,
        cargaId: a.carga_id,
        desde: a.ocurrio_desde as FechaISO | null,
        hasta: a.ocurrio_hasta as FechaISO | null,
        detectada: a.detectada_en as FechaISO,
        observado: num(a.valor_observado),
        esperado: num(a.valor_esperado),
        unidad: a.unidad,
        evidencia: (a.evidencia && typeof a.evidencia === 'object' && !Array.isArray(a.evidencia) ? a.evidencia : {}) as Record<string, unknown>,
        descuentoL: num(a.descuento_l),
        descuentoImporte: num(a.descuento_importe),
        moneda: a.moneda,
        descuentoChofer: a.descuento_chofer,
        comentarios: a.comentarios,
      }));
    },

    async detalle(alertaId: number): Promise<DetalleAlerta> {
      const { data, error } = await ana().rpc('fn_alerta_detalle', { p_alerta: alertaId });
      if (error) throw new RepoError(error);
      return parsearDetalle(data);
    },

    async reglas(): Promise<Regla[]> {
      const { data, error } = await ana().rpc('fn_reglas_vigentes');
      if (error) throw new RepoError(error);
      return (data ?? []).map((r) => ({
        codigo: r.codigo,
        nombre: r.nombre,
        descripcion: r.descripcion,
        categoria: r.categoria,
        version: r.version,
        parametros: (r.parametros && typeof r.parametros === 'object' && !Array.isArray(r.parametros) ? r.parametros : {}) as Record<string, unknown>,
        activa: r.activa,
        vigenteDesde: r.vigente_desde,
      }));
    },

    async tomar(alertaId: number): Promise<void> {
      const { error } = await ana().rpc('fn_tomar_alerta', { p_alerta: alertaId });
      if (error) throw new RepoError(error);
    },

    async resolver(alertaId: number, decision: Decision, justificacion: string, choferId: number | null, litros: number | null): Promise<void> {
      const { error } = await ana().rpc('fn_resolver_alerta', {
        p_alerta: alertaId,
        p_decision: decision,
        p_justificacion: justificacion,
        p_chofer: choferId,
        p_litros: litros,
      });
      if (error) throw new RepoError(error);
    },

    async reabrir(alertaId: number, justificacion: string): Promise<void> {
      const { error } = await ana().rpc('fn_reabrir_alerta', { p_alerta: alertaId, p_justificacion: justificacion });
      if (error) throw new RepoError(error);
    },

    async comentar(alertaId: number, texto: string): Promise<void> {
      const { error } = await ana().rpc('fn_comentar_alerta', { p_alerta: alertaId, p_texto: texto });
      if (error) throw new RepoError(error);
    },

    async cambiarUmbrales(codigo: string, parametros: Record<string, number>, activa: boolean): Promise<string> {
      const { data, error } = await ana().rpc('fn_cambiar_umbrales', { p_codigo: codigo, p_parametros: parametros, p_activa: activa });
      if (error) throw new RepoError(error);
      return data;
    },
  };
};
