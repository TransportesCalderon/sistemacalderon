import { ConflictoVersion, RepoError, rangoPagina, type Db, type Pagina } from '@/shared/repository/types';
import type { DepositoId, FechaISO } from '@/shared/types/dominio';
import type { ControlBaseDatos, MovimientoBaseDatos, TanqueBaseDatos } from '../domain/base.schemas';
import {
  TAMANO_PAGINA_LIBRO,
  esCategoriaBase,
  esTipoMovimientoBase,
  type ControlBase,
  type MovimientoBase,
  type ResponsableBase,
  type SegmentoBase,
  type TanqueBase,
  type TipoCombustibleOpcion,
  type UsuarioOpcion,
} from '../domain/base.types';
import { num0 } from '../domain/comun';
import { nombresDe } from './catalogo-combustible.repository';

/**
 * Base Mendoza (migraciones 24 y 30). Lecturas de vistas y tablas; las escrituras del libro,
 * los controles, el traspaso y las aprobaciones son funciones de la base. El alta del tanque es
 * una fila de fue.deposito_combustible que solo puede escribir TI (tc_admin).
 */
export const baseRepository = (db: Db) => {
  const fue = () => db.schema('fue');
  return {
    async tanques(): Promise<TanqueBase[]> {
      const [saldos, filas] = await Promise.all([
        fue().from('v_saldo_deposito').select('*').eq('tipo', 'tanque_base').order('codigo'),
        fue().from('deposito_combustible').select('id, observaciones, version_fila').eq('tipo', 'tanque_base').is('eliminado_en', null),
      ]);
      if (saldos.error) throw new RepoError(saldos.error);
      if (filas.error) throw new RepoError(filas.error);
      const extra = new Map(filas.data.map((f) => [f.id, f]));
      return saldos.data.map((s) => ({
        id: s.deposito_id as DepositoId,
        codigo: s.codigo ?? '',
        nombre: s.nombre ?? '',
        estacionId: s.estacion_id ?? 0,
        tipoCombustibleId: s.tipo_combustible_id ?? 0,
        capacidadL: num0(s.capacidad_l),
        estado: s.estado ?? 'activo',
        observaciones: extra.get(s.deposito_id ?? 0)?.observaciones ?? null,
        versionFila: extra.get(s.deposito_id ?? 0)?.version_fila ?? 1,
        saldoL: num0(s.saldo_l),
        ultimoControlId: s.ultimo_control_id,
        ultimoControlEn: s.ultimo_control_en as FechaISO | null,
        ultimoControlL: s.ultimo_control_l === null ? null : Number(s.ultimo_control_l),
        controlVencido: Boolean(s.control_vencido),
        movimientosPendientes: num0(s.movimientos_pendientes),
        responsableUsuarioId: s.responsable_usuario_id,
      }));
    },

    async controles(depositoId: number): Promise<ControlBase[]> {
      const { data, error } = await fue()
        .from('v_control_base')
        .select('*')
        .eq('deposito_id', depositoId)
        .order('fecha_hora', { ascending: false })
        .limit(200);
      if (error) throw new RepoError(error);
      return data.map((c) => ({
        id: c.id ?? 0,
        depositoId: c.deposito_id as DepositoId,
        fechaHora: c.fecha_hora as FechaISO,
        litros: num0(c.litros),
        rol: c.rol === 'inicial' ? 'inicial' : 'base',
        metodo: c.metodo,
        observaciones: c.observaciones,
        saldoLibroL: num0(c.saldo_libro_l),
        diferenciaL: num0(c.diferencia_l),
        medidoPorNombre: c.medido_por_nombre,
        motivoReemplazo: c.motivo_reemplazo,
        controlAnteriorId: c.control_anterior_id,
        controlAnteriorEn: c.control_anterior_en as FechaISO | null,
        responsableUsuarioId: c.responsable_usuario_id,
        responsableNombre: c.responsable_nombre,
        aprobacionId: c.aprobacion_id,
        aprobadoImputableL: c.aprobado_imputable_l === null ? null : Number(c.aprobado_imputable_l),
        aprobadoPorNombre: c.aprobado_por_nombre,
        aprobadoEn: c.aprobado_en as FechaISO | null,
      }));
    },

    async libro(depositoId: number, pagina: number): Promise<Pagina<MovimientoBase>> {
      const [desde, hasta] = rangoPagina(pagina, TAMANO_PAGINA_LIBRO);
      const { data, count, error } = await fue()
        .from('movimiento_combustible')
        .select(
          'id, fecha_hora, tipo, litros, camion_id, carga_id, control_id, categoria, motivo, evidencia, estado_aprobacion, motivo_resolucion, anula_id, creado_por',
          { count: 'exact' },
        )
        .eq('deposito_id', depositoId)
        .is('eliminado_en', null)
        .order('fecha_hora', { ascending: false })
        .order('id', { ascending: false })
        .range(desde, hasta);
      if (error) throw new RepoError(error);
      const nombres = await nombresDe(db, { camiones: data.map((m) => m.camion_id ?? NaN) });
      return {
        total: count,
        filas: data.map((m) => ({
          id: m.id,
          fechaHora: m.fecha_hora as FechaISO,
          tipo: esTipoMovimientoBase(m.tipo) ? m.tipo : 'ajuste',
          litros: Number(m.litros),
          camionId: m.camion_id,
          camionPatente: m.camion_id === null ? null : (nombres.patente.get(m.camion_id) ?? null),
          cargaId: m.carga_id,
          controlId: m.control_id,
          categoria: esCategoriaBase(m.categoria) ? m.categoria : null,
          motivo: m.motivo,
          evidencia: m.evidencia,
          estadoAprobacion:
            m.estado_aprobacion === 'pendiente' || m.estado_aprobacion === 'aprobado' || m.estado_aprobacion === 'rechazado'
              ? m.estado_aprobacion
              : null,
          motivoResolucion: m.motivo_resolucion,
          anulaId: m.anula_id,
          creadoPor: m.creado_por,
        })),
      };
    },

    async responsables(depositoId: number): Promise<ResponsableBase[]> {
      const { data, error } = await fue()
        .from('responsable_deposito')
        .select('id, usuario_id, desde_ts, hasta_ts')
        .eq('deposito_id', depositoId)
        .is('eliminado_en', null)
        .order('desde_ts', { ascending: false });
      if (error) throw new RepoError(error);
      const ids = [...new Set(data.map((r) => r.usuario_id))];
      const usuarios = ids.length ? await db.schema('seg').from('usuario').select('id, nombre').in('id', ids) : { data: [], error: null };
      if (usuarios.error) throw new RepoError(usuarios.error);
      const nombre = new Map((usuarios.data ?? []).map((u) => [u.id, u.nombre]));
      return data.map((r) => ({
        id: r.id,
        usuarioId: r.usuario_id,
        nombre: nombre.get(r.usuario_id) ?? `Usuario ${r.usuario_id}`,
        desde: r.desde_ts as FechaISO,
        hasta: r.hasta_ts as FechaISO | null,
      }));
    },

    async usuarios(): Promise<UsuarioOpcion[]> {
      const { data, error } = await db.schema('seg').from('usuario').select('id, nombre').eq('activo', true).order('nombre');
      if (error) throw new RepoError(error);
      return data;
    },

    async tiposCombustible(): Promise<TipoCombustibleOpcion[]> {
      const { data, error } = await db.schema('ref').from('tipo_combustible').select('id, nombre').is('eliminado_en', null).order('nombre');
      if (error) throw new RepoError(error);
      return data;
    },

    /** Vista previa del segmento que cierra el control (la misma función que usa la aprobación). */
    async segmento(controlId: number): Promise<SegmentoBase> {
      const { data, error } = await fue().rpc('fn_resultado_control_base', { p_control: controlId });
      if (error) throw new RepoError(error);
      const r = data as Record<string, unknown>;
      return {
        controlId: Number(r.control_id),
        controlAnteriorId: Number(r.control_anterior_id),
        desde: r.desde_ts as FechaISO,
        hasta: r.hasta_ts as FechaISO,
        fisicoAnteriorL: Number(r.fisico_anterior_l),
        realL: Number(r.real_l),
        realPorTipo: Object.fromEntries(Object.entries((r.real_por_tipo ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)])),
        teoricoL: Number(r.teorico_l),
        fisicoL: Number(r.fisico_l),
        diferenciaL: Number(r.diferencia_l),
        toleranciaL: Number(r.tolerancia_l),
        imputableL: Number(r.imputable_l),
        responsableNombre: (r.responsable_nombre as string | null) ?? null,
        pendientes: (r.pendientes ?? []) as { codigo: string; mensaje: string }[],
      };
    },

    /** Recalcula un segmento aprobado desde los hechos (fue.fn_verificar_control_base). */
    async verificar(aprobacionId: number): Promise<{ ok: boolean; defectos: string[] }> {
      const { data, error } = await fue().rpc('fn_verificar_control_base', { p_id: aprobacionId });
      if (error) throw new RepoError(error);
      const r = data as { ok: boolean; defectos: string[] };
      return { ok: Boolean(r.ok), defectos: r.defectos ?? [] };
    },

    // ------------------------------------------------------------- escrituras
    async guardarTanque(d: TanqueBaseDatos): Promise<void> {
      if (d.id === null) {
        const { error } = await fue()
          .from('deposito_combustible')
          .insert({
            codigo: d.codigo,
            nombre: d.nombre,
            tipo: 'tanque_base',
            estacion_id: d.estacionId,
            tipo_combustible_id: d.tipoCombustibleId,
            capacidad_l: d.capacidadL ?? 0,
            observaciones: d.observaciones,
          });
        if (error) throw new RepoError(error);
        return;
      }
      const { data, error } = await fue()
        .from('deposito_combustible')
        .update({ nombre: d.nombre, capacidad_l: d.capacidadL ?? 0, observaciones: d.observaciones, version_fila: d.versionFila ?? 0 })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila ?? 0)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('fue.deposito_combustible', d.id);
    },

    async registrarControl(d: ControlBaseDatos): Promise<number> {
      const { data, error } = await fue().rpc('fn_registrar_control_base', {
        p_deposito: d.depositoId,
        p_fecha_hora: d.fechaHora,
        p_litros: d.litros,
        p_metodo: d.metodo,
        p_observaciones: d.observaciones,
        p_reemplaza: d.reemplazaId,
        p_motivo_reemplazo: d.motivoReemplazo,
      });
      if (error) throw new RepoError(error);
      return data as number;
    },

    async movimientoConMotivo(d: MovimientoBaseDatos): Promise<number> {
      const { data, error } = await fue().rpc('fn_movimiento_con_motivo', {
        p_deposito: d.depositoId,
        p_categoria: d.categoria,
        p_litros: d.litros ?? 0,
        p_fecha_hora: d.fechaHora,
        p_motivo: d.motivo,
        p_evidencia: d.evidencia,
      });
      if (error) throw new RepoError(error);
      return data as number;
    },

    async resolverMovimiento(movimientoId: number, aprobar: boolean, motivo: string | null): Promise<void> {
      const { error } = await fue().rpc('fn_resolver_movimiento', { p_movimiento: movimientoId, p_aprobar: aprobar, p_motivo: motivo });
      if (error) throw new RepoError(error);
    },

    async asignarResponsable(depositoId: number, usuarioId: number, desde: string): Promise<void> {
      const { error } = await fue()
        .from('responsable_deposito')
        .insert({ deposito_id: depositoId, usuario_id: usuarioId, desde_ts: desde });
      if (error) throw new RepoError(error);
    },

    async traspasar(d: {
      depositoId: number;
      usuarioId: number;
      fechaHora: string;
      litros: number;
      metodo: string;
      observaciones: string | null;
    }) {
      const { error } = await fue().rpc('fn_traspasar_responsable', {
        p_deposito: d.depositoId,
        p_usuario_entrante: d.usuarioId,
        p_fecha_hora: d.fechaHora,
        p_litros: d.litros,
        p_metodo: d.metodo,
        p_observaciones: d.observaciones,
      });
      if (error) throw new RepoError(error);
    },

    async aprobarSegmento(d: {
      controlId: number;
      justificacion: string | null;
      noImputableL: number;
      noImputableMotivo: string | null;
    }): Promise<void> {
      const { error } = await fue().rpc('fn_aprobar_control_base', {
        p_control: d.controlId,
        p_justificacion: d.justificacion,
        p_no_imputable_l: d.noImputableL,
        p_no_imputable_motivo: d.noImputableMotivo,
      });
      if (error) throw new RepoError(error);
    },

    async anularSegmento(aprobacionId: number, motivo: string): Promise<void> {
      const { error } = await fue().rpc('fn_anular_aprobacion_base', { p_id: aprobacionId, p_motivo: motivo });
      if (error) throw new RepoError(error);
    },
  };
};
