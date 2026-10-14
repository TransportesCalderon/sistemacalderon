/**
 * Tipos de dominio compartidos (arquitectura §11, capa 3).
 * Todos son serializables: cruzan la frontera servidor → cliente (hidratación de
 * React Query y respuestas de server actions) sin transformación.
 */

/** Identificador con marca: impide pasar el id de un camión donde se espera el de una carga. */
export type Id<Marca extends string> = number & { readonly __marca: Marca };
export type CamionId = Id<'Camion'>;
export type ChoferId = Id<'Chofer'>;

/** numeric de PostgreSQL como texto exacto. Nunca se convierte a number para operar. */
export type DecimalStr = string & { readonly __decimal: true };
/** timestamptz en UTC (ISO 8601). Solo shared/lib/fechas lo formatea en la zona del usuario. */
export type FechaISO = string & { readonly __fechaIso: true };
/** date de PostgreSQL ('AAAA-MM-DD'): un día calendario, sin zona horaria. */
export type FechaDia = string & { readonly __fechaDia: true };

/** Columnas de control comunes (aud.fn_columnas_control / aud.fn_soft_delete). */
export interface Auditable {
  creadoEn: FechaISO;
  creadoPor: number | null;
  actualizadoEn: FechaISO;
  actualizadoPor: number | null;
  versionFila: number;
  eliminadoEn: FechaISO | null;
}

/** Opción de un catálogo (ref.*) para selects y para resolver nombres en listas y fichas. */
export interface OpcionCatalogo<V extends string | number = number> {
  valor: V;
  etiqueta: string;
}
