import type { CamionId, ChoferId, DepositoId, FechaISO, MovimientoCamionId, SolicitudId } from '@/shared/types/dominio';
import { esDe, idDe, leerParam, paginaDe, type EntradaUrl } from './comun';

/**
 * Movimientos del camión (fue.movimiento_camion, migración 26): combustible que entra o sale
 * del camión por otra vía que una carga con ticket. La base valida y calcula todo; acá solo
 * hay nombres para mostrar.
 */
export const TIPOS_MOVIMIENTO = ['descarga_base', 'descarga_camion', 'recepcion_camion', 'salida_motivo', 'entrada_motivo'] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];
export const esTipoMovimiento = esDe(TIPOS_MOVIMIENTO);
export const ETIQUETA_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  descarga_base: 'Descarga a base',
  descarga_camion: 'Descarga a otro camión',
  recepcion_camion: 'Recibido de otro camión',
  salida_motivo: 'Salida con motivo',
  entrada_motivo: 'Entrada con motivo',
};

export const CATEGORIAS_SALIDA = ['derrame', 'robo_denunciado', 'drenaje_agua'] as const;
export const CATEGORIAS_ENTRADA = ['carga_bidon'] as const;
export type CategoriaMovimiento = (typeof CATEGORIAS_SALIDA)[number] | (typeof CATEGORIAS_ENTRADA)[number];
export const ETIQUETA_CATEGORIA: Record<CategoriaMovimiento, string> = {
  derrame: 'Derrame',
  robo_denunciado: 'Robo denunciado',
  drenaje_agua: 'Drenaje de agua',
  carga_bidon: 'Carga de bidón',
};

export const ESTADOS_APROBACION = ['pendiente', 'aprobado', 'rechazado'] as const;
export type EstadoAprobacion = (typeof ESTADOS_APROBACION)[number];
export const esEstadoAprobacion = esDe(ESTADOS_APROBACION);
export const ETIQUETA_ESTADO_APROBACION: Record<EstadoAprobacion, string> = {
  pendiente: 'Pendiente de aprobación',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

export interface MovimientoCamion {
  id: MovimientoCamionId;
  camionId: CamionId;
  camionPatente: string | null;
  fechaHora: FechaISO;
  tipo: TipoMovimiento;
  /** Con signo: positivo entra al camión, negativo sale. */
  litros: number;
  operacion: string;
  depositoDestinoId: DepositoId | null;
  depositoDestinoCodigo: string | null;
  camionContraparteId: CamionId | null;
  camionContrapartePatente: string | null;
  categoria: CategoriaMovimiento | null;
  evidencia: string | null;
  motivo: string | null;
  choferId: ChoferId | null;
  choferNombre: string | null;
  estadoAprobacion: EstadoAprobacion | null;
  motivoResolucion: string | null;
  anulaId: MovimientoCamionId | null;
  revertido: boolean;
  solicitudPendienteId: SolicitudId | null;
  creadoPor: number | null;
  creadoEn: FechaISO;
}

export interface MovimientoListaParams {
  camionId?: number;
  tipo?: TipoMovimiento;
  pagina: number;
}

export const TAMANO_PAGINA_MOVIMIENTOS = 50;

export function parsearListaMovimientos(e: EntradaUrl): MovimientoListaParams {
  const p: MovimientoListaParams = { pagina: paginaDe(e) };
  const camion = idDe(e, 'camion');
  if (camion) p.camionId = camion;
  const tipo = leerParam(e, 'tipo');
  if (esTipoMovimiento(tipo)) p.tipo = tipo;
  return p;
}

export function serializarListaMovimientos(p: MovimientoListaParams): string {
  const u = new URLSearchParams();
  if (p.camionId !== undefined) u.set('camion', String(p.camionId));
  if (p.tipo) u.set('tipo', p.tipo);
  if (p.pagina > 1) u.set('pagina', String(p.pagina));
  return u.toString();
}

/** Tanque de base al que puede descargar un camión. */
export interface TanqueBaseOpcion {
  id: DepositoId;
  codigo: string;
  nombre: string;
  tipoCombustibleId: number;
}
