import type { FechaISO } from '@/shared/types/dominio';

/**
 * Viajes de chofer (migración 46): aparte de la operación de Logística. Van de una carga a
 * tanque lleno (corte de viaje) del tractor a la siguiente. La situación, los pendientes, el
 * canon y los km los calcula la base; acá solo se muestran.
 */
export const SITUACIONES_TRACTOR = ['disponible', 'en_viaje', 'sin_chofer', 'taller'] as const;
export type SituacionTractor = (typeof SITUACIONES_TRACTOR)[number];
export const esSituacionTractor = (v: unknown): v is SituacionTractor => (SITUACIONES_TRACTOR as readonly unknown[]).includes(v);
export const ETIQUETA_SITUACION_TRACTOR: Record<SituacionTractor, string> = {
  disponible: 'Disponible',
  en_viaje: 'En viaje',
  sin_chofer: 'Sin chofer',
  taller: 'En taller',
};

export const SITUACIONES_VIAJE_CHOFER = ['en_viaje', 'por_cerrar', 'cerrado', 'anulado'] as const;
export type SituacionViajeChofer = (typeof SITUACIONES_VIAJE_CHOFER)[number];
export const esSituacionViajeChofer = (v: unknown): v is SituacionViajeChofer => (SITUACIONES_VIAJE_CHOFER as readonly unknown[]).includes(v);
export const ETIQUETA_SITUACION_VIAJE_CHOFER: Record<SituacionViajeChofer, string> = {
  en_viaje: 'En viaje',
  por_cerrar: 'Llegó: falta cerrar',
  cerrado: 'Cerrado',
  anulado: 'Anulado',
};

export interface Tractor {
  camionId: number;
  codigoInterno: string;
  patente: string;
  choferId: number | null;
  chofer: string | null;
  choferEstado: string | null;
  licenciaVencimiento: string | null;
  asignadoDesde: string | null;
  viajeId: number | null;
  viajeNumero: string | null;
  viajeSalida: FechaISO | null;
  viajeChofer: string | null;
  situacion: SituacionTractor;
  corteDisponibleId: number | null;
  corteDisponible: FechaISO | null;
}

export interface ViajeChoferResumen {
  id: number;
  numero: string;
  camionId: number;
  patente: string;
  choferId: number;
  chofer: string;
  salida: FechaISO;
  llegada: FechaISO | null;
  situacion: SituacionViajeChofer;
  operaciones: string | null;
  km: number | null;
  canon: string | null;
  relevo: boolean;
  cierreId: number | null;
  cierreEstado: string | null;
}

export interface CargaDelViaje {
  id: number;
  fechaHora: FechaISO;
  litros: number;
  estacion: string | null;
  tanqueLleno: boolean;
  odometroKm: number | null;
  equipoFrio: boolean;
  momento: 'salida' | 'viaje' | 'llegada';
}

export interface ItemViaje {
  id: number;
  servicioId: number | null;
  numeroOperacion: number | null;
  tipoOperacion: string | null;
  cliente: string | null;
  contenedor: string | null;
  lineaId: number;
  linea: string;
  canon: number | null;
  canonMoneda: string | null;
  km: number | null;
  canonLinea: number | null;
  canonMonedaLinea: string | null;
  kmLinea: number | null;
  motivoAjuste: string | null;
  relevo: { viajeId: number; numero: string; chofer: string }[];
}

export interface ViajeChofer {
  id: number;
  numero: string;
  estado: 'abierto' | 'cerrado' | 'anulado';
  situacion: SituacionViajeChofer;
  versionFila: number;
  observacion: string | null;
  motivoAnulacion: string | null;
  cerradoEn: FechaISO | null;
  /** Migración 51: sin usuario = lo cerró la tarea automática. */
  cerradoPor: number | null;
  camion: { id: number; codigoInterno: string; patente: string };
  chofer: { id: number; nombre: string };
  salida: FechaISO;
  llegada: FechaISO | null;
  cargas: CargaDelViaje[];
  items: ItemViaje[];
  canonTotal: { moneda: string; total: number }[];
  kmTotal: number | null;
  cierre: { id: number; numero: string; estado: string } | null;
  pendientes: string[];
}

type J = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const t = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** jsonb de ops.fn_viaje_chofer → ViajeChofer (solo traduce nombres; no calcula nada). */
export function parsearViajeChofer(d: J): ViajeChofer {
  const camion = (d.camion ?? {}) as J;
  const chofer = (d.chofer ?? {}) as J;
  const cierre = d.cierre as J | null;
  const estado = d.estado === 'cerrado' || d.estado === 'anulado' ? d.estado : 'abierto';
  return {
    id: Number(d.id),
    numero: String(d.numero),
    estado,
    situacion: esSituacionViajeChofer(d.situacion) ? d.situacion : 'en_viaje',
    versionFila: Number(d.version_fila),
    observacion: t(d.observacion),
    motivoAnulacion: t(d.motivo_anulacion),
    cerradoEn: t(d.cerrado_en) as FechaISO | null,
    cerradoPor: n(d.cerrado_por),
    camion: { id: Number(camion.id), codigoInterno: String(camion.codigo_interno ?? ''), patente: String(camion.patente ?? '') },
    chofer: { id: Number(chofer.id), nombre: String(chofer.nombre ?? '') },
    salida: String(d.salida_ts) as FechaISO,
    llegada: t(d.llegada_ts) as FechaISO | null,
    cargas: ((d.cargas ?? []) as J[]).map((c) => ({
      id: Number(c.id),
      fechaHora: String(c.fecha_hora) as FechaISO,
      litros: Number(c.litros),
      estacion: t(c.estacion),
      tanqueLleno: Boolean(c.tanque_lleno),
      odometroKm: n(c.odometro_km),
      equipoFrio: Boolean(c.equipo_frio),
      momento: c.momento === 'salida' || c.momento === 'llegada' ? c.momento : 'viaje',
    })),
    items: ((d.items ?? []) as J[]).map((i) => ({
      id: Number(i.id),
      servicioId: n(i.servicio_id),
      numeroOperacion: n(i.numero_operacion),
      tipoOperacion: t(i.tipo_operacion),
      cliente: t(i.cliente),
      contenedor: t(i.contenedor),
      lineaId: Number(i.linea_id),
      linea: String(i.linea ?? ''),
      canon: n(i.canon),
      canonMoneda: t(i.canon_moneda)?.trim() ?? null,
      km: n(i.km),
      canonLinea: n(i.canon_linea),
      canonMonedaLinea: t(i.canon_moneda_linea)?.trim() ?? null,
      kmLinea: n(i.km_linea),
      motivoAjuste: t(i.motivo_ajuste),
      relevo: ((i.relevo ?? []) as J[]).map((r) => ({ viajeId: Number(r.viaje_id), numero: String(r.numero), chofer: String(r.chofer ?? '') })),
    })),
    canonTotal: ((d.canon_total ?? []) as J[]).map((c) => ({ moneda: String(c.moneda).trim(), total: Number(c.total) })),
    kmTotal: n(d.km_total),
    cierre: cierre ? { id: Number(cierre.id), numero: String(cierre.numero), estado: String(cierre.estado) } : null,
    pendientes: ((d.pendientes ?? []) as unknown[]).map(String),
  };
}
