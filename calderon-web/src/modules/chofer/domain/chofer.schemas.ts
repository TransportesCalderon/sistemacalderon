import { z } from 'zod';
import { TIPOS_DOCUMENTO_OPERACION } from './chofer.types';

/** Forma de los datos de los formularios. Las reglas (a quién, cuándo, cuánto) las decide la base. */
const id = z.number().int().positive();
const textoOpc = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));
const ruta = z.string().regex(/^[A-Za-z0-9/_.-]{3,300}$/, 'Archivo no válido.');
const hash = z.string().regex(/^[0-9a-f]{32,128}$/).nullish().transform((v) => v ?? null);
const coord = z.number().min(-180).max(180).nullish().transform((v) => v ?? null);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.');
const importe = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === 'number') return v;
    const t = String(v).trim();
    // «1.234,56» (coma decimal) o «1234.56»
    return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  })
  .refine((v) => Number.isFinite(v) && v > 0, 'Escribí el importe.');
const moneda = z.string().trim().length(3, 'Elegí la moneda.');

export const subirDocumentoSchema = z.object({
  servicioId: id,
  tipo: z.enum(TIPOS_DOCUMENTO_OPERACION, { message: 'Elegí qué documento es.' }),
  archivo: ruta,
  hash,
  nombreArchivo: textoOpc(200),
  nota: textoOpc(500),
  latitud: coord,
  longitud: coord,
});
export type SubirDocumento = z.infer<typeof subirDocumentoSchema>;

export const quitarDocumentoSchema = z.object({ documentoId: id });

export const posicionSchema = z.object({
  latitud: z.number().min(-90).max(90),
  longitud: z.number().min(-180).max(180),
  precisionM: z.number().min(0).nullish().transform((v) => v ?? null),
  velocidadKmh: z.number().min(0).nullish().transform((v) => v ?? null),
  rumbo: z.number().min(0).max(360).nullish().transform((v) => v ?? null),
  ts: z.string().nullish().transform((v) => v ?? null),
});
export type PosicionEntrada = z.infer<typeof posicionSchema>;

export const subirGastoSchema = z.object({
  categoria: z.string().trim().min(1, 'Elegí qué gasto es.'),
  moneda,
  importe,
  fecha,
  comprobante: ruta.nullish().transform((v) => v ?? null),
  hash,
  nombreArchivo: textoOpc(200),
  detalle: textoOpc(500),
  lugar: textoOpc(120),
  latitud: coord,
  longitud: coord,
});
export type SubirGasto = z.infer<typeof subirGastoSchema>;

export const retirarGastoSchema = z.object({ gastoId: id });

export const entregaSchema = z.object({
  tipo: z.enum(['entrega', 'devolucion']),
  choferId: id,
  moneda,
  importe,
  fecha,
  detalle: textoOpc(500),
});
export type Entrega = z.infer<typeof entregaSchema>;

export const gastoOficinaSchema = z.object({
  choferId: id,
  categoria: z.string().trim().min(1, 'Elegí qué gasto es.'),
  moneda,
  importe,
  fecha,
  detalle: textoOpc(500),
  comprobante: ruta.nullish().transform((v) => v ?? null),
  hash,
  nombreArchivo: textoOpc(200),
});
export type GastoOficina = z.infer<typeof gastoOficinaSchema>;

export const revisarGastoSchema = z.object({ gastoId: id, aprobar: z.boolean(), motivo: textoOpc(500) });
export const anularMovimientoSchema = z.object({ movimientoId: id, motivo: z.string().trim().min(1, 'Escribí el motivo.').max(500) });
export const cerrarFondoSchema = z.object({ choferId: id, periodo: fecha });
export const reabrirFondoSchema = z.object({ choferId: id, periodo: fecha, motivo: z.string().trim().min(1, 'Escribí el motivo.').max(500) });
