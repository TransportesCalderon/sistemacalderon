import type { Auditable, CamionId, DecimalStr, FechaDia } from '@/shared/types/dominio';

/**
 * Dominio del camión (mae.camion). Las listas de valores reflejan los CHECK del DDL:
 *   ck_camion_estado       estado IN ('activo','taller','inactivo')
 *   ck_camion_propietario  propietario_tipo IN ('propio','tercero','leasing')
 */
export const ESTADOS_CAMION = ['activo', 'taller', 'inactivo'] as const;
export type EstadoCamion = (typeof ESTADOS_CAMION)[number];

export const PROPIETARIOS_CAMION = ['propio', 'tercero', 'leasing'] as const;
export type PropietarioCamion = (typeof PROPIETARIOS_CAMION)[number];

export const ETIQUETA_ESTADO_CAMION: Record<EstadoCamion, string> = {
  activo: 'Activo',
  taller: 'En taller',
  inactivo: 'Inactivo',
};

export const ETIQUETA_PROPIETARIO: Record<PropietarioCamion, string> = {
  propio: 'Propio',
  tercero: 'Tercero',
  leasing: 'Leasing',
};

/** Ficha completa del camión. */
export interface Camion extends Auditable {
  id: CamionId;
  codigoInterno: string;
  patente: string;
  paisPatente: string;
  vin: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  tipoCombustibleId: number;
  fechaAlta: FechaDia;
  fechaBaja: FechaDia | null;
  estado: EstadoCamion;
  propietarioTipo: PropietarioCamion;
  /** numeric(6,2) como texto exacto. */
  consumoReferencia: DecimalStr | null;
  idOptifleet: string | null;
}

/** Fila de la lista (P-MAE-01). */
export type CamionResumen = Pick<
  Camion,
  | 'id'
  | 'codigoInterno'
  | 'patente'
  | 'paisPatente'
  | 'marca'
  | 'modelo'
  | 'anio'
  | 'tipoCombustibleId'
  | 'fechaAlta'
  | 'fechaBaja'
  | 'estado'
  | 'propietarioTipo'
  | 'versionFila'
  | 'eliminadoEn'
>;

export interface CamionFiltros {
  /** Busca en código interno, patente, marca, modelo y VIN. */
  texto?: string;
  estado?: EstadoCamion;
  propietario?: PropietarioCamion;
  pais?: string;
  tipoCombustibleId?: number;
  incluirEliminados?: boolean;
}

export const ORDENES_CAMION = ['codigo_interno', 'patente', 'marca', 'anio', 'estado', 'fecha_alta'] as const;
export type CampoOrdenCamion = (typeof ORDENES_CAMION)[number];

/** Parámetros completos de la lista: forman la clave de React Query y la URL. */
export interface CamionListaParams extends CamionFiltros {
  orden: CampoOrdenCamion;
  dir: 'asc' | 'desc';
  pagina: number;
}

export const TAMANO_PAGINA_CAMIONES = 25;

/** Catálogos que usan la lista, la ficha y el formulario. */
export interface CatalogosFlota {
  tiposCombustible: { id: number; codigo: string; nombre: string }[];
  paises: { iso2: string; nombre: string }[];
}

export function esEstadoCamion(v: unknown): v is EstadoCamion {
  return typeof v === 'string' && (ESTADOS_CAMION as readonly string[]).includes(v);
}

export function esPropietarioCamion(v: unknown): v is PropietarioCamion {
  return typeof v === 'string' && (PROPIETARIOS_CAMION as readonly string[]).includes(v);
}
