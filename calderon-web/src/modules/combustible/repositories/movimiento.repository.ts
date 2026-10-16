import { RepoError, rangoPagina, type Db, type Pagina } from '@/shared/repository/types';
import type { CamionId, ChoferId, DepositoId, FechaISO, MovimientoCamionId, SolicitudId } from '@/shared/types/dominio';
import type { Descarga, MovimientoConMotivo } from '../domain/movimiento.schemas';
import {
  TAMANO_PAGINA_MOVIMIENTOS,
  esEstadoAprobacion,
  esTipoMovimiento,
  type CategoriaMovimiento,
  type MovimientoCamion,
  type MovimientoListaParams,
  type TanqueBaseOpcion,
} from '../domain/movimiento.types';
import { nombresDe } from './catalogo-combustible.repository';

/**
 * Movimientos del camión (fue.v_movimiento_camion, migración 26). La aplicación no escribe la
 * tabla: todo pasa por las funciones de la base (descarga, movimiento con motivo, resolución,
 * pedido de reverso), que validan y bloquean.
 */
const COLS =
  'id, camion_id, fecha_hora, tipo, litros, operacion, deposito_destino_id, camion_contraparte_id, categoria, evidencia, motivo, chofer_id, estado_aprobacion, motivo_resolucion, anula_id, revertido, solicitud_pendiente_id, creado_por, creado_en';

type Fila = {
  id: number | null;
  camion_id: number | null;
  fecha_hora: string | null;
  tipo: string | null;
  litros: number | null;
  operacion: string | null;
  deposito_destino_id: number | null;
  camion_contraparte_id: number | null;
  categoria: string | null;
  evidencia: string | null;
  motivo: string | null;
  chofer_id: number | null;
  estado_aprobacion: string | null;
  motivo_resolucion: string | null;
  anula_id: number | null;
  revertido: boolean | null;
  solicitud_pendiente_id: number | null;
  creado_por: number | null;
  creado_en: string | null;
};

export const movimientoRepository = (db: Db) => ({
  async listar(p: MovimientoListaParams): Promise<Pagina<MovimientoCamion>> {
    const [desde, hasta] = rangoPagina(p.pagina, TAMANO_PAGINA_MOVIMIENTOS);
    let q = db.schema('fue').from('v_movimiento_camion').select(COLS, { count: 'exact' });
    if (p.camionId !== undefined) q = q.eq('camion_id', p.camionId);
    if (p.tipo) q = q.eq('tipo', p.tipo);
    const { data, count, error } = await q.order('fecha_hora', { ascending: false }).order('id', { ascending: false }).range(desde, hasta);
    if (error) throw new RepoError(error);
    const filas = data as Fila[];
    const nombres = await nombresDe(db, {
      camiones: filas.flatMap((f) => [f.camion_id ?? NaN, f.camion_contraparte_id ?? NaN]),
      choferes: filas.map((f) => f.chofer_id ?? NaN),
      depositos: filas.map((f) => f.deposito_destino_id ?? NaN),
    });
    return {
      total: count,
      filas: filas.map((f) => ({
        id: f.id as MovimientoCamionId,
        camionId: f.camion_id as CamionId,
        camionPatente: f.camion_id === null ? null : (nombres.patente.get(f.camion_id) ?? null),
        fechaHora: f.fecha_hora as FechaISO,
        tipo: esTipoMovimiento(f.tipo) ? f.tipo : 'salida_motivo',
        litros: Number(f.litros),
        operacion: f.operacion ?? '',
        depositoDestinoId: f.deposito_destino_id as DepositoId | null,
        depositoDestinoCodigo: f.deposito_destino_id === null ? null : (nombres.deposito.get(f.deposito_destino_id)?.codigo ?? null),
        camionContraparteId: f.camion_contraparte_id as CamionId | null,
        camionContrapartePatente: f.camion_contraparte_id === null ? null : (nombres.patente.get(f.camion_contraparte_id) ?? null),
        categoria: f.categoria as CategoriaMovimiento | null,
        evidencia: f.evidencia,
        motivo: f.motivo,
        choferId: f.chofer_id as ChoferId | null,
        choferNombre: f.chofer_id === null ? null : (nombres.chofer.get(f.chofer_id) ?? null),
        estadoAprobacion: esEstadoAprobacion(f.estado_aprobacion) ? f.estado_aprobacion : null,
        motivoResolucion: f.motivo_resolucion,
        anulaId: f.anula_id as MovimientoCamionId | null,
        revertido: Boolean(f.revertido),
        solicitudPendienteId: f.solicitud_pendiente_id as SolicitudId | null,
        creadoPor: f.creado_por,
        creadoEn: f.creado_en as FechaISO,
      })),
    };
  },

  /** Tanques de base activos (destino de una descarga). */
  async tanquesBase(): Promise<TanqueBaseOpcion[]> {
    const { data, error } = await db
      .schema('fue')
      .from('deposito_combustible')
      .select('id, codigo, nombre, tipo_combustible_id')
      .eq('tipo', 'tanque_base')
      .eq('estado', 'activo')
      .is('eliminado_en', null)
      .order('codigo');
    if (error) throw new RepoError(error);
    return data.map((d) => ({ id: d.id as DepositoId, codigo: d.codigo, nombre: d.nombre, tipoCombustibleId: d.tipo_combustible_id }));
  },

  async descargar(d: Descarga): Promise<string> {
    const { data, error } = await db.schema('fue').rpc('fn_descargar_combustible', {
      p_camion: d.camionId,
      p_litros: d.litros,
      p_fecha_hora: d.fechaHora,
      p_deposito_base: d.depositoBaseId,
      p_camion_destino: d.camionDestinoId,
      p_chofer_id: d.choferId,
      p_motivo: d.motivo,
    });
    if (error) throw new RepoError(error);
    return data as string;
  },

  async conMotivo(d: MovimientoConMotivo): Promise<MovimientoCamionId> {
    const { data, error } = await db.schema('fue').rpc('fn_movimiento_camion_con_motivo', {
      p_camion: d.camionId,
      p_categoria: d.categoria,
      p_litros: d.litros,
      p_fecha_hora: d.fechaHora,
      p_motivo: d.motivo,
      p_evidencia: d.evidencia,
      p_chofer_id: d.choferId,
    });
    if (error) throw new RepoError(error);
    return data as MovimientoCamionId;
  },

  async resolver(movimientoId: number, aprobar: boolean, motivo: string | null): Promise<void> {
    const { error } = await db.schema('fue').rpc('fn_resolver_movimiento_camion', { p_id: movimientoId, p_aprobar: aprobar, p_motivo: motivo });
    if (error) throw new RepoError(error);
  },

  async solicitarReverso(movimientoId: number, motivo: string): Promise<SolicitudId> {
    const { data, error } = await db.schema('fue').rpc('fn_solicitar_reverso_camion', { p_movimiento: movimientoId, p_motivo: motivo });
    if (error) throw new RepoError(error);
    return data as SolicitudId;
  },
});
