import type { CamionId, CargaId, ChoferId, CierreViajeId, ControlSaldoId, DepositoId, FechaISO } from '@/shared/types/dominio';
import { esDe, FECHA_DIA, idDe, leerParam, paginaDe, type EntradaUrl } from './comun';

/**
 * Cierre de viaje (migración 24). Estados del ciclo de vida: borrador, aprobado, anulado.
 * La verificación NO es un estado: es una comprobación reproducible (fue.fn_verificar_cierre)
 * que se muestra aparte como resultado.
 */
export const ESTADOS_CIERRE = ['borrador', 'aprobado', 'anulado'] as const;
export type EstadoCierre = (typeof ESTADOS_CIERRE)[number];
export const esEstadoCierre = esDe(ESTADOS_CIERRE);
export const ETIQUETA_ESTADO_CIERRE: Record<EstadoCierre, string> = { borrador: 'Borrador', aprobado: 'Aprobado', anulado: 'Anulado' };

export const RESULTADOS_TEST_ALCOHOL = ['no_realizado', 'negativo', 'positivo'] as const;
export type ResultadoTestAlcohol = (typeof RESULTADOS_TEST_ALCOHOL)[number];
export const esTestAlcohol = esDe(RESULTADOS_TEST_ALCOHOL);
export const ETIQUETA_TEST_ALCOHOL: Record<ResultadoTestAlcohol, string> = {
  no_realizado: 'No realizado',
  negativo: 'Negativo',
  positivo: 'Positivo',
};

/** Datos que completa el usuario en el borrador (columnas con permiso de escritura). */
export interface DatosBorrador {
  choferResponsableId: ChoferId | null;
  motivoChofer: string | null;
  programadorVelocidadPct: number | null;
  testAlcohol: ResultadoTestAlcohol | null;
  kmManual: number | null;
  consumoPlataformaManualL: number | null;
  motivoAjuste: string | null;
  tractorNoImputableL: number;
  tractorNoImputableRalentiH: number;
  tractorNoImputableMotivo: string | null;
  tractorJustificacion: string | null;
  mochilaNoImputableL: number;
  mochilaNoImputableMotivo: string | null;
  mochilaJustificacion: string | null;
  observaciones: string | null;
}

/** Componente tractor (lo calcula la base: en vivo en el borrador, congelado al aprobar). */
export interface ComponenteTractor {
  litrosCargaSalida: number | null;
  litrosLlenadosL: number | null;
  litrosDesdeMochilaL: number | null;
  /** Lo que dicen los hechos: llenados del viaje + litros pasados desde la mochila. */
  consumoLlenadoL: number | null;
  /** Lo que midió la plataforma (telemetría, resumen diario o manual). */
  consumoPlataformaL: number | null;
  fuenteConsumo: string | null;
  kmRecorridos: number | null;
  fuenteKm: string | null;
  consumoL100km: number | null;
  horasMotor: number | null;
  horasRalenti: number | null;
  diasParado: number | null;
  diferenciaL: number | null;
  toleranciaL: number | null;
  noImputableL: number | null;
  imputableL: number | null;
}

export interface ControlDelCierre {
  id: ControlSaldoId;
  litros: number | null;
  fuente: string | null;
}

/** Componente mochila: ancla + movimientos reales del viaje − físico de llegada. */
export interface ComponenteMochila {
  depositoId: DepositoId | null;
  depositoCodigo: string | null;
  controlAncla: ControlDelCierre | null;
  controlLlegada: ControlDelCierre | null;
  anclaL: number | null;
  entradasL: number | null;
  transferenciasEntradaL: number | null;
  transferenciasSalidaL: number | null;
  aTractorL: number | null;
  conMotivoL: number | null;
  realL: number | null;
  /** Saldo teórico (libro) al llegar = ancla + movimientos reales. */
  teoricoL: number | null;
  /** Físico medido o declarado en el control de llegada. */
  fisicoL: number | null;
  diferenciaL: number | null;
  toleranciaL: number | null;
  noImputableL: number | null;
  imputableL: number | null;
}

export interface Pendiente {
  codigo: string;
  mensaje: string;
}

/** Lo que muestra la ficha: misma forma para el borrador (en vivo) y para el aprobado (congelado). */
export interface ResultadoCierre {
  tractor: ComponenteTractor;
  usaMochila: boolean | null;
  mochila: ComponenteMochila | null;
  imputableTotalL: number | null;
  lineaViaje: string | null;
  choferResponsableId: ChoferId | null;
  choferPropuestoId: ChoferId | null;
  cargaLlegadaId: CargaId | null;
  pendientes: Pendiente[];
  avisos: string[];
  calculadoEn: FechaISO | null;
}

export interface CierreViaje {
  id: CierreViajeId;
  numero: string;
  camionId: CamionId;
  cargaSalidaId: CargaId;
  cargaLlegadaId: CargaId;
  salidaTs: FechaISO;
  llegadaTs: FechaISO;
  estado: EstadoCierre;
  datos: DatosBorrador;
  /** Resultado congelado al aprobar (null si nunca se aprobó). */
  congelado: ResultadoCierre | null;
  huella: string | null;
  aprobadoPor: number | null;
  aprobadoEn: FechaISO | null;
  motivoAnulacion: string | null;
  anuladoPor: number | null;
  anuladoEn: FechaISO | null;
  creadoEn: FechaISO;
  versionFila: number;
  eliminadoEn: FechaISO | null;
}

/** Resultado de fue.fn_verificar_cierre. */
export interface Verificacion {
  ok: boolean;
  defectos: string[];
  avisos: string[];
  verificadoEn: FechaISO | null;
}

export type ResultadoVerificacion = 'verificado' | 'con_diferencias' | 'con_avisos';
export const ETIQUETA_VERIFICACION: Record<ResultadoVerificacion, string> = {
  verificado: 'Verificado',
  con_diferencias: 'Con diferencias',
  con_avisos: 'Con avisos',
};

/** Cómo se muestra la verificación (sin interpretar: diferencias en los hechos pesan más que los avisos). */
export function resultadoVerificacion(v: Verificacion): ResultadoVerificacion {
  if (!v.ok || v.defectos.length > 0) return 'con_diferencias';
  return v.avisos.length > 0 ? 'con_avisos' : 'verificado';
}

export interface CierreResumen {
  id: CierreViajeId;
  numero: string;
  camionId: CamionId;
  camionPatente: string | null;
  choferNombre: string | null;
  salidaTs: FechaISO;
  llegadaTs: FechaISO;
  estado: EstadoCierre;
  lineaViaje: string | null;
  tractorDiferenciaL: number | null;
  mochilaDiferenciaL: number | null;
  imputableTotalL: number | null;
}

export interface CierreListaParams {
  camionId?: number;
  estado?: EstadoCierre;
  desde?: string;
  hasta?: string;
  conImputable?: boolean;
  pagina: number;
}

export const TAMANO_PAGINA_CIERRES = 50;

export function parsearListaCierres(e: EntradaUrl): CierreListaParams {
  const p: CierreListaParams = { pagina: paginaDe(e) };
  const camion = idDe(e, 'camion');
  if (camion) p.camionId = camion;
  const estado = leerParam(e, 'estado');
  if (esEstadoCierre(estado)) p.estado = estado;
  const desde = leerParam(e, 'desde');
  if (desde && FECHA_DIA.test(desde)) p.desde = desde;
  const hasta = leerParam(e, 'hasta');
  if (hasta && FECHA_DIA.test(hasta)) p.hasta = hasta;
  if (leerParam(e, 'imputable') === '1') p.conImputable = true;
  return p;
}

export function serializarListaCierres(p: CierreListaParams): string {
  const u = new URLSearchParams();
  if (p.camionId !== undefined) u.set('camion', String(p.camionId));
  if (p.estado) u.set('estado', p.estado);
  if (p.desde) u.set('desde', p.desde);
  if (p.hasta) u.set('hasta', p.hasta);
  if (p.conImputable) u.set('imputable', '1');
  if (p.pagina > 1) u.set('pagina', String(p.pagina));
  return u.toString();
}
