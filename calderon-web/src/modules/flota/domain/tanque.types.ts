import type { CamionId, FechaDia, TanqueId } from '@/shared/types/dominio';

/**
 * Tanques del camión (mae.tanque_combustible, migración 27). Documentan la configuración real
 * del vehículo y dan su capacidad total. No se controla el combustible por tanque: el camión
 * es un solo volumen (migración 26).
 */
export const TIPOS_TANQUE = ['principal', 'secundario', 'mochila', 'otro'] as const;
export type TipoTanque = (typeof TIPOS_TANQUE)[number];
export const esTipoTanque = (v: unknown): v is TipoTanque => typeof v === 'string' && (TIPOS_TANQUE as readonly string[]).includes(v);
export const ETIQUETA_TIPO_TANQUE: Record<TipoTanque, string> = {
  principal: 'Principal',
  secundario: 'Secundario',
  mochila: 'Mochila',
  otro: 'Otro',
};

export interface Tanque {
  id: TanqueId;
  camionId: CamionId;
  numero: number;
  tipo: TipoTanque;
  descripcion: string | null;
  capacidadNominalL: number;
  capacidadUtilL: number;
  vigenteDesde: FechaDia;
  /** Fin de vigencia exclusivo (desde ese día ya no está). null = sin fecha de baja. */
  vigenteHasta: FechaDia | null;
  versionFila: number;
}

/** Capacidad del camión hoy, según la base (mae.v_capacidad_camion). */
export interface CapacidadCamion {
  tanques: number;
  /** null = el camión no tiene tanques vigentes cargados. */
  capacidadUtilL: number | null;
  capacidadNominalL: number | null;
}

export interface TanquesDelCamion {
  tanques: Tanque[];
  capacidad: CapacidadCamion;
}
