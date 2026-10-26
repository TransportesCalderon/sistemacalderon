import type { CamionId, CargaId, ChoferId, DepositoId, FechaISO, SolicitudId } from '@/shared/types/dominio';
import { esDe } from './comun';

/**
 * Combustible > Cargas (fue.carga_combustible). Desde la migración 26 el camión es un solo
 * volumen de combustible: no importa a qué tanque fue la carga (la mochila es un tanque más).
 */

export const ESTADOS_VALIDACION = ['pendiente', 'validada', 'observada', 'anulada'] as const;
export type EstadoValidacion = (typeof ESTADOS_VALIDACION)[number];
export const esEstadoValidacion = esDe(ESTADOS_VALIDACION);
export const ETIQUETA_ESTADO_VALIDACION: Record<EstadoValidacion, string> = {
  pendiente: 'Pendiente',
  validada: 'Validada',
  observada: 'Observada',
  anulada: 'Anulada',
};

export const MEDIOS_PAGO = ['tarjeta', 'cuenta_corriente', 'efectivo', 'surtidor_propio', 'fondo_chofer'] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];
export const ETIQUETA_MEDIO_PAGO: Record<MedioPago, string> = {
  tarjeta: 'Tarjeta',
  cuenta_corriente: 'Cuenta corriente',
  efectivo: 'Efectivo',
  surtidor_propio: 'Surtidor propio',
  fondo_chofer: 'Fondo del chofer',
};

/**
 * Situación de la carga para la pantalla (especificación del frontend):
 * normal · anulación pendiente (hay una solicitud esperando a otro usuario) · anulada.
 */
export const SITUACIONES_CARGA = ['normal', 'anulacion_pendiente', 'anulada'] as const;
export type SituacionCarga = (typeof SITUACIONES_CARGA)[number];
export const esSituacionCarga = esDe(SITUACIONES_CARGA);
export const ETIQUETA_SITUACION_CARGA: Record<SituacionCarga, string> = {
  normal: 'Normal',
  anulacion_pendiente: 'Anulación pendiente',
  anulada: 'Anulada',
};

/**
 * A dónde fue el combustible: al camión (cualquier tanque), al equipo de frío o al tanque
 * de base. «Mochila (anterior)»: carga registrada con el modelo anterior a la 26; cuenta
 * como carga del camión.
 */
export const DESTINOS_CARGA = ['camion', 'mochila_anterior', 'deposito', 'frio'] as const;
export type DestinoCarga = (typeof DESTINOS_CARGA)[number];
export const ETIQUETA_DESTINO: Record<DestinoCarga, string> = {
  camion: 'Camión',
  mochila_anterior: 'Mochila (registro anterior)',
  deposito: 'Tanque de base',
  frio: 'Equipo de frío',
};

/** Qué viajes abre o cierra un corte de viaje, según fue.v_viaje (no se calcula en el navegador). */
export interface RolEnViaje {
  inicia: boolean;
  termina: boolean;
}

export interface CargaResumen {
  id: CargaId;
  fechaHora: FechaISO;
  camionId: CamionId;
  camionPatente: string | null;
  choferNombre: string | null;
  estacion: string | null;
  litros: number;
  tanqueLleno: boolean;
  esFrontera: boolean;
  destino: DestinoCarga;
  depositoCodigo: string | null;
  /** Litros que le faltaron al camión para quedar lleno en este corte (0 si quedó lleno). */
  faltanteLlenoL: number;
  estadoValidacion: EstadoValidacion;
  situacion: SituacionCarga;
  rolViaje: RolEnViaje;
}

export interface SolicitudPendiente {
  id: SolicitudId;
  motivo: string;
  creadoPor: number | null;
  creadoEn: FechaISO;
}

export interface Carga extends CargaResumen {
  choferId: ChoferId | null;
  estacionId: number | null;
  tipoCombustibleId: number;
  precioUnitario: number;
  moneda: string;
  importeOriginal: number;
  importeMonedaBase: number | null;
  medioPago: string;
  odometroKm: number | null;
  tieneDocumento: boolean;
  origenDato: string;
  motivoObservacion: string | null;
  anulaId: CargaId | null;
  motivoAnulacion: string | null;
  faltanteObservacion: string | null;
  depositoId: DepositoId | null;
  solicitud: SolicitudPendiente | null;
  sustituidaPor: CargaId | null;
  versionFila: number;
  creadoEn: FechaISO;
}

export interface CargaListaParams {
  camionId?: number;
  desde?: string;
  hasta?: string;
  soloFronteras?: boolean;
  situacion?: SituacionCarga;
  pagina: number;
}

export const TAMANO_PAGINA_CARGAS = 50;
