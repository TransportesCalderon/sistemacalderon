import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaISO } from '@/shared/types/dominio';
import { num } from '@/modules/combustible/domain/comun';
import { parsearDetalle, type Alerta, type DetalleAlerta, type Decision, type FiltrosAlertas, type Regla, type Vista } from '../domain/alerta.types';
import {
  parsearAvisosEscalamiento,
  parsearGestiones,
  parsearResponsables,
  parsearResumenCargaImposible,
  type AvisoEscalamiento,
  type GestionAlerta,
  type ResponsablesAlerta,
  type ResumenCargaImposible,
} from '../domain/gestion.types';

/** Alertas (migración 49). Todo lo decide la base; su mensaje se muestra tal cual. */
export const alertaRepository = (db: Db) => {
  const ana = () => db.schema('ana');
  return {
    /** filtros: tractor y gravedad (migración 120); con una base anterior no se mandan. */
    async bandeja(vista: Vista, desde: string | null, hasta: string | null, filtros?: FiltrosAlertas): Promise<Alerta[]> {
      const extra = filtros ? { p_camion: filtros.camionId, p_severidad: filtros.severidad } : {};
      const { data, error } = await ana().rpc('fn_bandeja_alertas', { p_vista: vista, p_desde: desde, p_hasta: hasta, ...extra });
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

    // ---- Migración 189: gestión con responsable, vencimiento, prórroga y escalamiento ----
    async gestiones(ids: number[]): Promise<GestionAlerta[]> {
      if (ids.length === 0) return [];
      const { data, error } = await ana().rpc('fn_gestion_alertas', { p_ids: ids });
      if (error) throw new RepoError(error);
      return parsearGestiones(data);
    },

    async avance(alertaId: number, hecho: string, falta: string | null): Promise<void> {
      const { error } = await ana().rpc('fn_avance_alerta', { p_alerta: alertaId, p_hecho: hecho, p_falta: falta });
      if (error) throw new RepoError(error);
    },

    async reasignar(alertaId: number, rol: string, usuarioId: number | null, motivo: string): Promise<void> {
      const { error } = await ana().rpc('fn_reasignar_alerta', { p_alerta: alertaId, p_rol: rol, p_usuario: usuarioId, p_motivo: motivo });
      if (error) throw new RepoError(error);
    },

    async pedirProrroga(alertaId: number, horas: number, motivo: string): Promise<void> {
      const { error } = await ana().rpc('fn_pedir_prorroga_alerta', { p_alerta: alertaId, p_horas: horas, p_motivo: motivo });
      if (error) throw new RepoError(error);
    },

    async resolverProrroga(prorrogaId: number, aprobar: boolean, motivo: string | null): Promise<void> {
      const { error } = await ana().rpc('fn_resolver_prorroga_alerta', { p_prorroga: prorrogaId, p_aprobar: aprobar, p_motivo: motivo });
      if (error) throw new RepoError(error);
    },

    async avisosEscalamiento(): Promise<AvisoEscalamiento[]> {
      const { data, error } = await ana().rpc('fn_avisos_escalamiento');
      if (error) throw new RepoError(error);
      return parsearAvisosEscalamiento(data);
    },

    async escalamientoVisto(alertaId: number): Promise<void> {
      const { error } = await ana().rpc('fn_escalamiento_visto', { p_alerta: alertaId });
      if (error) throw new RepoError(error);
    },

    async responsables(): Promise<ResponsablesAlerta> {
      const { data, error } = await ana().rpc('fn_responsables_alerta');
      if (error) throw new RepoError(error);
      return parsearResponsables(data);
    },

    async cambiarResponsable(codigo: string, rol: string, usuarioId: number | null): Promise<void> {
      const { error } = await ana().rpc('fn_cambiar_responsable_alerta', { p_codigo: codigo, p_rol: rol, p_usuario: usuarioId });
      if (error) throw new RepoError(error);
    },

    /** Migración 188: cómo viene la regla de carga imposible (normales, imposibles, sin dato, falsos positivos). */
    async resumenCargaImposible(desde: string, hasta: string): Promise<ResumenCargaImposible> {
      const { data, error } = await db.schema('fue').rpc('fn_resumen_carga_imposible', { p_desde: desde, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return parsearResumenCargaImposible(data);
    },

    async cambiarUmbrales(codigo: string, parametros: Record<string, number>, activa: boolean): Promise<string> {
      const { data, error } = await ana().rpc('fn_cambiar_umbrales', { p_codigo: codigo, p_parametros: parametros, p_activa: activa });
      if (error) throw new RepoError(error);
      return data;
    },
  };
};
