import { z } from 'zod';

/** Migración 290 · Cargas de combustible en Chile que Finanzas tiene que habilitar (tarjeta) o transferir (estación). */
export interface PagoCarga {
  id: number;
  medio: 'tarjeta' | 'transferencia';
  estado: 'pendiente' | 'hecho' | 'anulado';
  orden: string;
  ordenEstado: string;
  patente: string | null;
  chofer: string | null;
  estacion: string;
  proveedor: string | null;
  proveedorRut: string | null;
  litros: number | null;
  precio: number | null;
  moneda: string;
  importe: number | null;
  aCargar: string | null;
  autorizadaEn: string | null;
  venceEn: string | null;
  cargadoL: number | null;
  cargadoImporte: number | null;
  ordenPago: string | null;
  pagado: number | null;
  nota: string | null;
  hechoPor: string | null;
  hechoEn: string | null;
}

type O = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const t = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

export function parsearPagosCarga(v: unknown): PagoCarga[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is O => typeof x === 'object' && x !== null)
    .map((x) => ({
      id: Number(x.id),
      medio: x.medio === 'transferencia' ? 'transferencia' : 'tarjeta',
      estado: x.estado === 'hecho' || x.estado === 'anulado' ? x.estado : 'pendiente',
      orden: t(x.orden) ?? '',
      ordenEstado: t(x.orden_estado) ?? '',
      patente: t(x.patente),
      chofer: t(x.chofer),
      estacion: t(x.estacion) ?? '',
      proveedor: t(x.proveedor),
      proveedorRut: t(x.proveedor_rut),
      litros: n(x.litros),
      precio: n(x.precio),
      moneda: t(x.moneda) ?? 'CLP',
      importe: n(x.importe),
      aCargar: t(x.a_cargar),
      autorizadaEn: t(x.autorizada_en),
      venceEn: t(x.vence_en),
      cargadoL: n(x.cargado_l),
      cargadoImporte: n(x.cargado_importe),
      ordenPago: t(x.orden_pago),
      pagado: n(x.pagado),
      nota: t(x.nota),
      hechoPor: t(x.hecho_por),
      hechoEn: t(x.hecho_en),
    }));
}

/** Solo forma (la base valida). Van acá: un archivo «use server» solo admite funciones async. */
const id = z.number().int().positive();
export const pagoCargaTarjetaSchema = z.object({ id, nota: z.string().trim().max(500) });
export const pagoCargaTransferirSchema = z.object({
  id,
  cuentaId: z.number({ message: 'Elegí de qué banco sale.' }).int().positive('Elegí de qué banco sale.'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.'),
  monto: z.number({ message: 'Escribí cuánto se transfirió.' }).positive('Escribí cuánto se transfirió.'),
  montoDeuda: z.number().positive().nullable(),
  observacion: z.string().trim().max(500),
});
export const pagoCargaAnularSchema = z.object({ id, motivo: z.string().trim().min(5, 'Escribí el motivo.').max(500) });
