/**
 * Migración 153: lo que hizo cada chofer (tramos asignados en Operaciones, con relevos) y quién llevó
 * cada operación. Lo arma la base; acá solo se lee.
 */
import type { FechaISO } from '@/shared/types/dominio';

/** Base de la versión con estos datos. */
export const VERSION_HISTORIAL = 153;

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

/** Un tramo que el chofer tenía asignado en el período del viaje. */
export interface TramoDelViaje {
  tramoId: number;
  servicioId: number;
  numero: number | null;
  cliente: string | null;
  origen: string | null;
  destino: string | null;
  desde: FechaISO | null;
  hasta: FechaISO | null;
  tractor: string | null;
  mismoTractor: boolean;
  relevo: boolean;
  lineaId: number | null;
  linea: string | null;
  yaCargado: boolean;
}

export const parsearTramosDelViaje = (v: unknown): TramoDelViaje[] =>
  arr(v).map((t) => ({
    tramoId: Number(t.tramo_id),
    servicioId: Number(t.servicio_id),
    numero: num(t.numero),
    cliente: str(t.cliente),
    origen: str(t.origen),
    destino: str(t.destino),
    desde: str(t.desde) as FechaISO | null,
    hasta: str(t.hasta) as FechaISO | null,
    tractor: str(t.tractor),
    mismoTractor: t.mismo_tractor === true,
    relevo: t.relevo === true,
    lineaId: num(t.linea_id),
    linea: str(t.linea),
    yaCargado: t.ya_cargado === true,
  }));

/** Un movimiento: quién llevó qué, con qué equipo, de dónde a dónde y cuándo. */
export interface Movimiento {
  tramoId: number;
  servicioId: number | null;
  numero: number | null;
  cliente: string | null;
  choferId: number | null;
  chofer: string | null;
  tractor: string | null;
  semi: string | null;
  origen: string | null;
  destino: string | null;
  desde: FechaISO | null;
  hasta: FechaISO | null;
  estado: string;
  conCarga: boolean;
  relevo: boolean;
  viaje: string | null;
  observacion: string | null;
}

export const parsearMovimientos = (v: unknown): Movimiento[] =>
  arr(v).map((t) => ({
    tramoId: Number(t.tramo_id),
    servicioId: num(t.servicio_id),
    numero: num(t.numero),
    cliente: str(t.cliente),
    choferId: num(t.chofer_id),
    chofer: str(t.chofer),
    tractor: str(t.tractor),
    semi: str(t.semi),
    origen: str(t.origen),
    destino: str(t.destino),
    desde: str(t.desde) as FechaISO | null,
    hasta: str(t.hasta) as FechaISO | null,
    estado: str(t.estado) ?? 'planificado',
    conCarga: t.con_carga !== false,
    relevo: t.relevo === true,
    viaje: str(t.viaje),
    observacion: str(t.observacion),
  }));

export const ETIQUETA_ESTADO_TRAMO: Record<string, string> = {
  planificado: 'Programado',
  en_curso: 'En viaje',
  cerrado: 'Terminado',
};
