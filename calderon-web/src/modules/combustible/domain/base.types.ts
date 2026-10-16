import type { DepositoId, FechaISO } from '@/shared/types/dominio';
import { esDe } from './comun';

/**
 * Base Mendoza: el tanque de la base (fue.deposito_combustible tipo 'tanque_base'), su libro de
 * movimientos, los controles medidos, el responsable y la aprobación de cada segmento entre
 * controles (migraciones 24 y 30). La base calcula y decide; acá solo hay nombres para mostrar.
 */

export interface TanqueBase {
  id: DepositoId;
  codigo: string;
  nombre: string;
  estacionId: number;
  tipoCombustibleId: number;
  capacidadL: number;
  estado: string;
  observaciones: string | null;
  versionFila: number;
  /** Saldo de libro (movimientos + ajustes de los controles). */
  saldoL: number;
  ultimoControlId: number | null;
  ultimoControlEn: FechaISO | null;
  ultimoControlL: number | null;
  /** fue.base_frecuencia_max_horas: pasó más tiempo del permitido sin medir. */
  controlVencido: boolean;
  movimientosPendientes: number;
  responsableUsuarioId: number | null;
}

export const METODOS_MEDICION = ['varilla', 'caudalimetro', 'sensor', 'visual'] as const;
export type MetodoMedicion = (typeof METODOS_MEDICION)[number];
export const ETIQUETA_METODO: Record<MetodoMedicion, string> = {
  varilla: 'Varilla',
  caudalimetro: 'Caudalímetro',
  sensor: 'Sensor',
  visual: 'Visual',
};
export const etiquetaMetodo = (m: string | null) => (m && m in ETIQUETA_METODO ? ETIQUETA_METODO[m as MetodoMedicion] : (m ?? '—'));

export interface ControlBase {
  id: number;
  depositoId: DepositoId;
  fechaHora: FechaISO;
  litros: number;
  rol: 'inicial' | 'base';
  metodo: string | null;
  observaciones: string | null;
  /** Libro en ese instante y diferencia libro − físico (positiva = faltante). */
  saldoLibroL: number;
  diferenciaL: number;
  medidoPorNombre: string | null;
  motivoReemplazo: string | null;
  controlAnteriorId: number | null;
  controlAnteriorEn: FechaISO | null;
  responsableUsuarioId: number | null;
  responsableNombre: string | null;
  aprobacionId: number | null;
  aprobadoImputableL: number | null;
  aprobadoPorNombre: string | null;
  aprobadoEn: FechaISO | null;
}

/** Tipos del libro de un depósito (fue.movimiento_combustible). */
export const TIPOS_MOVIMIENTO_BASE = [
  'entrada_camion',
  'entrada_otra',
  'salida_carga_propia',
  'salida_otra',
  'entrada_carga',
  'transferencia_entrada',
  'transferencia_salida',
  'salida_tractor',
  'ajuste',
] as const;
export type TipoMovimientoBase = (typeof TIPOS_MOVIMIENTO_BASE)[number];
export const esTipoMovimientoBase = esDe(TIPOS_MOVIMIENTO_BASE);
export const ETIQUETA_TIPO_MOVIMIENTO_BASE: Record<TipoMovimientoBase, string> = {
  entrada_camion: 'Descarga de camión',
  entrada_otra: 'Entrada con motivo',
  salida_carga_propia: 'Carga a camión',
  salida_otra: 'Salida con motivo',
  entrada_carga: 'Carga recibida',
  transferencia_entrada: 'Transferencia recibida',
  transferencia_salida: 'Transferencia enviada',
  salida_tractor: 'Salida al tractor',
  ajuste: 'Ajuste por control',
};

export const CATEGORIAS_ENTRADA_BASE = ['compra_granel', 'carga_bidon'] as const;
export const CATEGORIAS_SALIDA_BASE = ['derrame', 'robo_denunciado', 'drenaje_agua'] as const;
export const CATEGORIAS_BASE = [...CATEGORIAS_ENTRADA_BASE, ...CATEGORIAS_SALIDA_BASE] as const;
export type CategoriaBase = (typeof CATEGORIAS_BASE)[number];
export const esCategoriaBase = esDe(CATEGORIAS_BASE);
export const ETIQUETA_CATEGORIA_BASE: Record<CategoriaBase, string> = {
  compra_granel: 'Compra a granel',
  carga_bidon: 'Carga de bidón',
  derrame: 'Derrame',
  robo_denunciado: 'Robo denunciado',
  drenaje_agua: 'Drenaje de agua',
};
/** Categorías en las que la base exige evidencia (remito, factura, denuncia). */
export const CATEGORIAS_CON_EVIDENCIA: readonly CategoriaBase[] = ['compra_granel', 'robo_denunciado'];

export interface MovimientoBase {
  id: number;
  fechaHora: FechaISO;
  tipo: TipoMovimientoBase;
  /** Con signo: positivo entra al tanque, negativo sale. */
  litros: number;
  camionId: number | null;
  camionPatente: string | null;
  cargaId: number | null;
  controlId: number | null;
  categoria: CategoriaBase | null;
  motivo: string | null;
  evidencia: string | null;
  estadoAprobacion: 'pendiente' | 'aprobado' | 'rechazado' | null;
  motivoResolucion: string | null;
  anulaId: number | null;
  creadoPor: number | null;
}

export interface ResponsableBase {
  id: number;
  usuarioId: number;
  nombre: string;
  desde: FechaISO;
  hasta: FechaISO | null;
}

export interface UsuarioOpcion {
  id: number;
  nombre: string;
}

export interface TipoCombustibleOpcion {
  id: number;
  nombre: string;
}

/** Resultado del segmento que cierra un control (fue.fn_resultado_control_base). */
export interface SegmentoBase {
  controlId: number;
  controlAnteriorId: number;
  desde: FechaISO;
  hasta: FechaISO;
  fisicoAnteriorL: number;
  realL: number;
  realPorTipo: Record<string, number>;
  teoricoL: number;
  fisicoL: number;
  diferenciaL: number;
  toleranciaL: number;
  imputableL: number;
  responsableNombre: string | null;
  pendientes: { codigo: string; mensaje: string }[];
}

export const TAMANO_PAGINA_LIBRO = 50;
