import { z } from 'zod';

/** Forma de los formularios de Ventas. Las reglas las decide la base (los mensajes vienen de ahí). */
const id = z.number().int().positive();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.');
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));
/** «1.234,56», «1234.56» o «1.800» (miles con punto) → número; vacío = null */
export const numeroOpc = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    const t = v.trim().replace(/\s/g, '');
    if (t === '') return null;
    if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
    return Number(t);
  })
  .refine((v) => v === null || Number.isFinite(v), 'Número no válido.');
const motivo = z.string().trim().min(1, 'Escribí el motivo.').max(500);

export const empresaSchema = z.object({
  id: id.nullable(),
  nombre: z.string().trim().min(2, 'Escribí el nombre.').max(150),
  pais: z.string().length(2).nullable(),
  rubro: texto(80),
  origen: texto(30),
  responsableId: id.nullable(),
  notas: texto(2000),
  descartada: z.boolean().optional(),
});
export type EmpresaEntrada = z.infer<typeof empresaSchema>;

export const contactoSchema = z.object({
  id: id.nullable(),
  empresaId: id,
  nombre: z.string().trim().min(2, 'Escribí el nombre.').max(120),
  cargo: texto(80),
  email: texto(160),
  telefono: texto(40),
  principal: z.boolean(),
});
export type ContactoEntrada = z.infer<typeof contactoSchema>;

export const negocioSchema = z.object({
  id: id.nullable(),
  empresaId: id,
  titulo: z.string().trim().min(2, 'Escribí qué negocio es.').max(150),
  lineaId: id.nullable(),
  viajesMes: numeroOpc,
  valorMensualUsd: numeroOpc,
  cierreEstimado: fecha.nullable(),
});
export type NegocioEntrada = z.infer<typeof negocioSchema>;

export const moverSchema = z.object({ id, etapa: z.enum(['nuevo', 'contactado', 'cotizado', 'negociacion', 'ganado', 'perdido']), motivo: texto(500) });

export const actividadSchema = z.object({
  id: id.nullable(),
  empresaId: id,
  tipo: z.enum(['llamada', 'reunion', 'email', 'visita', 'tarea']),
  titulo: z.string().trim().min(2, 'Escribí de qué se trata.').max(200),
  fecha,
  oportunidadId: id.nullable(),
  hecha: z.boolean().optional(),
  resultado: texto(2000),
});
export type ActividadEntrada = z.infer<typeof actividadSchema>;

export const completarSchema = z.object({ id, resultado: texto(2000) });
export const idSchema = z.object({ id });
export const motivoSchema = z.object({ id, motivo });

export const hacerClienteSchema = z.object({
  empresaId: id,
  clienteExistenteId: id.nullable(),
  razonSocial: texto(150),
  identificadorFiscal: texto(40),
  pais: z.string().length(2).nullable(),
  condicionPagoDias: z.number().int().min(0).max(365).nullable(),
});
export type HacerClienteEntrada = z.infer<typeof hacerClienteSchema>;

export const tarifaSchema = z.object({
  lineaId: id,
  clienteId: id.nullable(),
  unidad: z.enum(['viaje', 'tonelada', 'kilo']),
  precioUsd: numeroOpc.refine((v) => v !== null && v > 0, 'Escribí el precio.'),
  desde: fecha,
  tipoContenedor: texto(30),
  observacion: texto(300),
});
export type TarifaEntrada = z.infer<typeof tarifaSchema>;

export const adicionalSchema = z.object({
  codigo: texto(30),
  nombre: z.string().trim().min(2, 'Escribí el nombre.').max(80),
  unidad: z.enum(['fijo', 'por_dia', 'por_hora', 'porcentaje']),
  precioUsd: numeroOpc,
  activo: z.boolean(),
});
export type AdicionalEntrada = z.infer<typeof adicionalSchema>;

export const parametrosSchema = z.object({
  margen: numeroOpc.refine((v) => v !== null, 'Escribí el margen.'),
  validez: z.number().int().min(1).max(365),
  condiciones: texto(3000),
  costoKmManual: numeroOpc,
});
export type ParametrosEntrada = z.infer<typeof parametrosSchema>;

export const renglonCotizacionSchema = z.object({
  tipo: z.enum(['flete', 'adicional']),
  lineaId: id.nullable(),
  adicionalCodigo: z.string().nullable(),
  descripcion: texto(200),
  tipoOperacion: z.enum(['exportacion', 'importacion', 'nacional', 'round_trip']).nullable(),
  tipoContenedor: texto(30),
  unidad: z.string(),
  cantidad: numeroOpc,
  viajes: numeroOpc,
  vueltaVacia: z.boolean(),
  precioUsd: numeroOpc,
});
export type RenglonCotizacionEntrada = z.infer<typeof renglonCotizacionSchema>;

export const cotizacionSchema = z.object({
  id: id.nullable(),
  version: z.number().int().nullable(),
  empresaId: id,
  contactoId: id.nullable(),
  oportunidadId: id.nullable(),
  fecha: fecha.nullable(),
  validezDias: z.number().int().min(1).max(365).nullable(),
  condiciones: texto(3000),
  observacion: texto(1000),
  renglones: z.array(renglonCotizacionSchema).min(1, 'Agregá al menos un flete.').max(40),
});
export type CotizacionEntrada = z.infer<typeof cotizacionSchema>;

export const versionSchema = z.object({ id, version: z.number().int().positive() });
export const responderSchema = z.object({ id, aceptada: z.boolean(), motivo: texto(500), guardarTarifas: z.boolean() });

export const crearFacturaSchema = z.object({ clienteId: id, servicios: z.array(id).min(1, 'Elegí al menos una operación.') });
export const guardarFacturaSchema = z.object({
  id,
  version: z.number().int().positive(),
  observacion: texto(1000),
  renglones: z
    .array(z.object({ servicioId: id.nullable(), descripcion: z.string().trim().max(250), cantidad: numeroOpc, precio: numeroOpc }))
    .min(1),
});
export type GuardarFacturaEntrada = z.infer<typeof guardarFacturaSchema>;
export const emitirSchema = z.object({ id, version: z.number().int().positive(), numeroFiscal: z.string().trim().max(40), fecha });
export const cobrarSchema = z.object({ id, fecha, cuentaId: id.nullable().optional() });
/** Migración 101: el N° de factura se carga después de emitirla. */
export const numeroFacturaSchema = z.object({ id, numeroFiscal: z.string().trim().min(1, 'Escribí el número de la factura.').max(40) });
