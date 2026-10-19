import type { FechaDia } from '@/shared/types/dominio';
import { esDe } from './comun';

/** Ticket de la carga (fue.documento_carga, migración 34). El archivo está en Storage (bucket privado «documentos-carga»). */
export const TIPOS_DOCUMENTO = ['ticket', 'factura', 'remito', 'voucher_tarjeta'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const esTipoDocumento = esDe(TIPOS_DOCUMENTO);
export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  ticket: 'Ticket',
  factura: 'Factura',
  remito: 'Remito',
  voucher_tarjeta: 'Voucher de tarjeta',
};

export const BUCKET_DOCUMENTOS = 'documentos-carga';

export interface DocumentoCarga {
  id: number;
  tipo: TipoDocumento;
  numero: string;
  fecha: FechaDia;
  archivo: string | null;
}

/** Ruta del archivo en Storage: cargas/<carga>/<aleatorio>.<ext> (la base exige el prefijo de la carga). */
export function rutaArchivo(cargaId: number, extension: string, aleatorio: string): string {
  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return `cargas/${cargaId}/${aleatorio}.${ext}`;
}

/** Cargas de una bandeja (Combustible > Cargas por validar / Sin documento). */
export const BANDEJAS = ['por_validar', 'observadas', 'sin_documento'] as const;
export type Bandeja = (typeof BANDEJAS)[number];
export const esBandeja = esDe(BANDEJAS);
