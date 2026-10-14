import type { Auditable, ChoferId, FechaDia } from '@/shared/types/dominio';

/**
 * Dominio del chofer (mae.chofer). Las listas de valores reflejan los CHECK del DDL:
 *   ck_chofer_estado          estado IN ('activo','licencia','baja')
 *   ck_chofer_documento_tipo  documento_tipo IN ('DNI','CUIL','RUT','PASAPORTE','OTRO')
 *
 * El documento es un dato personal (especificación §9, P-MAE-03): no forma parte de
 * Chofer ni de ChoferResumen. Solo se obtiene con la acción "Mostrar documento", que
 * registra el acceso en aud.acceso_sensible.
 */
export const ESTADOS_CHOFER = ['activo', 'licencia', 'baja'] as const;
export type EstadoChofer = (typeof ESTADOS_CHOFER)[number];

export const ETIQUETA_ESTADO_CHOFER: Record<EstadoChofer, string> = {
  activo: 'Activo',
  licencia: 'Con licencia',
  baja: 'Baja',
};

export const TIPOS_DOCUMENTO = ['DNI', 'CUIL', 'RUT', 'PASAPORTE', 'OTRO'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  DNI: 'DNI',
  CUIL: 'CUIL',
  RUT: 'RUT',
  PASAPORTE: 'Pasaporte',
  OTRO: 'Otro',
};

/** Ficha del chofer, sin documento. */
export interface Chofer extends Auditable {
  id: ChoferId;
  legajo: string;
  nombre: string;
  apellido: string;
  paisResidencia: string;
  baseUbicacionId: number | null;
  categoriaLiquidacion: string | null;
  fechaIngreso: FechaDia;
  fechaEgreso: FechaDia | null;
  estado: EstadoChofer;
  idConductorOptifleet: string | null;
}

/** Fila de la lista (P-MAE-03): sin documento visible. */
export type ChoferResumen = Pick<
  Chofer,
  | 'id'
  | 'legajo'
  | 'nombre'
  | 'apellido'
  | 'paisResidencia'
  | 'baseUbicacionId'
  | 'categoriaLiquidacion'
  | 'fechaIngreso'
  | 'fechaEgreso'
  | 'estado'
  | 'versionFila'
  | 'eliminadoEn'
>;

/** Documento revelado por la acción "Mostrar documento". Nunca se guarda en la caché. */
export interface DocumentoChofer {
  tipo: TipoDocumento;
  numero: string;
}

export interface ChoferFiltros {
  /** Busca en legajo, nombre, apellido e identificador Optifleet (nunca en el documento). */
  texto?: string;
  estado?: EstadoChofer;
  pais?: string;
  baseId?: number;
  incluirEliminados?: boolean;
}

export const ORDENES_CHOFER = ['apellido', 'legajo', 'fecha_ingreso', 'estado'] as const;
export type CampoOrdenChofer = (typeof ORDENES_CHOFER)[number];

export interface ChoferListaParams extends ChoferFiltros {
  orden: CampoOrdenChofer;
  dir: 'asc' | 'desc';
  pagina: number;
}

export const TAMANO_PAGINA_CHOFERES = 25;

/** Base operativa (mae.ubicacion de tipo 'base') para el select y para mostrar el nombre. */
export interface BaseOperativa {
  id: number;
  codigo: string;
  nombre: string;
}

export function esEstadoChofer(v: unknown): v is EstadoChofer {
  return typeof v === 'string' && (ESTADOS_CHOFER as readonly string[]).includes(v);
}

export function esTipoDocumento(v: unknown): v is TipoDocumento {
  return typeof v === 'string' && (TIPOS_DOCUMENTO as readonly string[]).includes(v);
}

export function nombreCompleto(c: Pick<Chofer, 'nombre' | 'apellido'>): string {
  return `${c.apellido}, ${c.nombre}`;
}
