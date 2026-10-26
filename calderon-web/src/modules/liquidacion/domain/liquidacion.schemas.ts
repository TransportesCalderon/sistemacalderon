import { z } from 'zod';

/** Forma de los datos de los formularios. Las reglas (quién, cuándo, cuánto) las decide la base. */
const id = z.number().int().positive();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.');
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));
/** Número escrito por el usuario: admite «1.234,56» y «1234.56»; vacío = null. */
const numeroOpc = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    const t = v.trim();
    if (t === '') return null;
    return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  })
  .refine((v) => v === null || Number.isFinite(v), 'Número no válido.');
const motivo = z.string().trim().min(1, 'Escribí el motivo.').max(500);

export const tarifaSchema = z.object({
  choferId: id.nullable(),
  desde: fecha,
  sueldoFijo: numeroOpc,
  precioKm: numeroOpc,
  observacion: texto(300),
});
export type TarifaEntrada = z.infer<typeof tarifaSchema>;

export const conceptoSchema = z.object({
  id: id.nullable(),
  codigo: z.string().trim().min(2, 'Escribí el código.').max(30),
  nombre: z.string().trim().min(2, 'Escribí el nombre.').max(80),
  tipo: z.enum(['remunerativo', 'no_remunerativo', 'descuento']),
  calculo: z.enum(['manual', 'fijo', 'porcentaje']),
  valor: numeroOpc,
  base: z.enum(['remunerativo', 'bruto']).nullable(),
  automatico: z.boolean(),
  activo: z.boolean(),
  orden: z.number().int().min(0).max(999),
});
export type ConceptoEntrada = z.infer<typeof conceptoSchema>;

export const prepararSchema = z.object({ choferId: id, periodo: fecha });
export const prepararTodasSchema = z.object({ periodo: fecha });
export const renglonSchema = z.object({
  liquidacionId: id,
  tipo: z.enum(['remunerativo', 'no_remunerativo', 'descuento']).nullable(),
  descripcion: texto(200),
  importe: numeroOpc.refine((v) => v !== null && v > 0, 'Escribí el importe.'),
  conceptoId: id.nullable(),
});
export type RenglonEntrada = z.infer<typeof renglonSchema>;
export const idSchema = z.object({ id });
export const aprobarSchema = z.object({ id, version: z.number().int().positive() });
export const pagarSchema = z.object({ id, fecha, forma: texto(120), banco: texto(80), numero: texto(40), cuentaId: id.nullable().optional() });

// Migración 66: datos para la liquidación de sueldo de Chile
export const empresaSchema = z.object({
  razonSocial: z.string().trim().min(3, 'Escribí la razón social.').max(120),
  rut: z.string().trim().min(3, 'Escribí el RUT.').max(15),
  direccion: texto(150),
  comuna: texto(80),
});
export type EmpresaEntrada = z.infer<typeof empresaSchema>;
export const indicadoresSchema = z.object({
  periodo: fecha,
  uf: numeroOpc.refine((v) => v !== null && v > 0, 'Escribí la UF.'),
  utm: numeroOpc.refine((v) => v !== null && v > 0, 'Escribí la UTM.'),
  topeImponibleUf: numeroOpc.refine((v) => v !== null && v > 0, 'Escribí el tope.'),
  topeCesantiaUf: numeroOpc.refine((v) => v !== null && v > 0, 'Escribí el tope.'),
});
export type IndicadoresEntrada = z.infer<typeof indicadoresSchema>;
export const fichaSchema = z.object({
  choferId: id,
  rut: z.string().trim().min(3, 'Escribí el RUT.').max(15),
  extranjero: z.boolean(),
  cargo: z.string().trim().min(2, 'Escribí el cargo.').max(80),
  afp: z.string().trim().min(2, 'Escribí la AFP.').max(40),
  afpComisionPct: numeroOpc.refine((v) => v !== null, 'Escribí la comisión.'),
  salud: z.enum(['fonasa', 'isapre']),
  isapre: texto(60),
  isaprePlanUf: numeroOpc,
  contrato: z.enum(['indefinido', 'plazo_fijo']),
  contratoFirmado: z.boolean(),
  observacion: texto(500),
});
export type FichaEntrada = z.infer<typeof fichaSchema>;
export const legalSchema = z.object({
  liquidacionId: id,
  diasLicencia: z.number().int().min(0).max(31),
  diasSinLicencia: z.number().int().min(0).max(31),
  diasVacaciones: z.number().int().min(0).max(31),
  haberes: z.array(z.object({ codigo: z.string().regex(/^[A-Z_]{3,30}$/), importe: numeroOpc })).max(30),
});
export type LegalEntrada = z.infer<typeof legalSchema>;
export const firmadaSchema = z.object({ id, ruta: z.string().min(5).max(300) });
export const motivoSchema = z.object({ id, motivo });
