import type { CamionId, CargaId, ChoferId, ControlSaldoId, DepositoId, FechaISO, UsoMochilaId } from '@/shared/types/dominio';
import { esDe } from './comun';

/**
 * Combustible > Mochilas y controles (migraciones 22 y 24):
 * fue.uso_mochila (K3), fue.deposito_combustible tipo 'mochila' con vigencia por paradas
 * frontera, y fue.control_saldo_deposito.
 */

export interface UsoMochila {
  id: UsoMochilaId;
  camionId: CamionId;
  paradaDesdeId: CargaId;
  paradaHastaId: CargaId | null;
  desdeTs: FechaISO;
  hastaTs: FechaISO | null;
  versionFila: number;
}

export interface Mochila {
  id: DepositoId;
  codigo: string;
  nombre: string;
  camionId: CamionId;
  tipoCombustibleId: number;
  capacidadL: number;
  estado: string;
  paradaDesdeId: CargaId | null;
  paradaHastaId: CargaId | null;
  vigenteDesde: FechaISO | null;
  vigenteHasta: FechaISO | null;
  saldoL: number | null;
  ultimoControlEn: FechaISO | null;
  ultimoControlL: number | null;
  versionFila: number;
}

export const ROLES_CONTROL = ['inicial', 'llegada', 'intermedio', 'base'] as const;
export type RolControl = (typeof ROLES_CONTROL)[number];
export const esRolControl = esDe(ROLES_CONTROL);
/** Inicial · de frontera (control de llegada de una parada) · intermedio (referencia dentro de un viaje). */
export const ETIQUETA_ROL_CONTROL: Record<RolControl, string> = {
  inicial: 'Inicial',
  llegada: 'De frontera',
  intermedio: 'Intermedio',
  base: 'De base',
};

export const FUENTES_CONTROL = ['medicion', 'declaracion'] as const;
export type FuenteControl = (typeof FUENTES_CONTROL)[number];
export const ETIQUETA_FUENTE: Record<FuenteControl, string> = { medicion: 'Medición', declaracion: 'Declaración' };

export const METODOS_MEDICION = ['varilla', 'visual', 'sensor', 'caudalimetro'] as const;
export type MetodoMedicion = (typeof METODOS_MEDICION)[number];
export const ETIQUETA_METODO: Record<MetodoMedicion, string> = {
  varilla: 'Varilla',
  visual: 'Visual',
  sensor: 'Sensor',
  caudalimetro: 'Caudalímetro',
};

export const DECLARANTES = ['chofer', 'operaciones', 'base'] as const;
export type Declarante = (typeof DECLARANTES)[number];
export const ETIQUETA_DECLARANTE: Record<Declarante, string> = { chofer: 'Chofer', operaciones: 'Operaciones', base: 'Base' };

export interface ControlSaldo {
  id: ControlSaldoId;
  depositoId: DepositoId;
  fechaHora: FechaISO;
  litros: number;
  fuente: string;
  metodo: string | null;
  rol: RolControl;
  origen: string;
  cargaParadaId: CargaId | null;
  choferId: ChoferId | null;
  declaranteTipo: string | null;
  medidoPor: number | null;
  estado: string;
  reemplazaId: ControlSaldoId | null;
  motivoReemplazo: string | null;
  /** Saldo de libro en ese instante, cuando se registró (lo fija la base). */
  saldoLibroL: number;
  /** Libro − físico al registrar. Positivo = faltaba combustible. */
  diferenciaL: number;
  observaciones: string | null;
  creadoEn: FechaISO;
}

/** Fila de /combustible/mochilas: un camión con su uso y su mochila vigente. */
export interface CamionMochila {
  camionId: CamionId;
  codigoInterno: string;
  patente: string;
  usoVigente: UsoMochila | null;
  mochila: Mochila | null;
}
