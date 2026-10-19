import { z } from 'zod';
import { TIPOS_PROVEEDOR, TIPOS_UBICACION } from './catalogos.types';

/** Formularios de catálogos: solo forma. Las reglas las aplica la base. */
const id = () => z.number().int().positive();
const version = () => z.number().int().positive();
const texto = (max: number, mensaje: string) => z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres.`);
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));
const codigo = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Ingresá el código.')
  .max(30, 'Máximo 30 caracteres.');
const pais = z.string().regex(/^[A-Z]{2}$/, 'Elegí el país.');

export const proveedorSchema = z.object({
  id: id().nullable(),
  versionFila: version().nullable(),
  codigo,
  razonSocial: texto(200, 'Ingresá la razón social.'),
  identificadorFiscal: opcional(30),
  pais,
  tipo: z.enum(TIPOS_PROVEEDOR, 'Elegí el tipo.'),
  monedaDefecto: z
    .string()
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || /^[A-Z]{3}$/.test(v), 'Elegí una moneda.'),
});
export type ProveedorEntrada = z.input<typeof proveedorSchema>;
export type ProveedorDatos = z.output<typeof proveedorSchema>;

export const estacionSchema = z.object({
  id: id().nullable(),
  versionFila: version().nullable(),
  codigo,
  nombre: texto(200, 'Ingresá el nombre.'),
  proveedorId: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), 'Elegí un proveedor.'),
  pais,
  esTanquePropio: z.boolean(),
});
export type EstacionEntrada = z.input<typeof estacionSchema>;
export type EstacionDatos = z.output<typeof estacionSchema>;

/**
 * Número escrito por una persona: con coma decimal ("7.300,50"), los puntos son de miles;
 * sin coma, el punto es decimal ("5.42"). El formulario muestra cómo se va a guardar.
 */
export function normalizarDecimal(v: string): string {
  const t = v.replace(/\s/g, '');
  return t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
}

/**
 * Cotización tal como la escribe la persona, en el sentido que elija:
 *  directa: "1 ARS = 0,64 CLP" (unidades de la moneda base por 1 de la moneda)
 *  inversa: "1 USD = 950 CLP" con base USD (unidades de la moneda por 1 de la base)
 */
export const tipoCambioSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indicá la fecha.'),
  moneda: z.string().regex(/^[A-Z]{3}$/, 'Elegí la moneda.'),
  sentido: z.enum(['directa', 'inversa']),
  valor: z
    .string()
    .trim()
    .transform(normalizarDecimal)
    .refine((v) => /^\d{1,9}(\.\d{1,8})?$/.test(v) && Number(v) > 0, 'Escribí la cotización (por ejemplo 984,09 o 0,64).')
    .transform(Number),
  fuente: opcional(100),
});
export type TipoCambioEntrada = z.input<typeof tipoCambioSchema>;
export type TipoCambioDatos = z.output<typeof tipoCambioSchema>;

export const eliminarSchema = z.object({ id: id(), versionFila: version() });
export type Eliminar = z.output<typeof eliminarSchema>;

/** El valor viaja como JSON (número, texto, sí/no o lista); la base controla que no cambie de tipo. */
export const parametroSchema = z.object({
  codigo: z.string().regex(/^[a-z0-9_.]+$/),
  versionFila: version(),
  valor: z.unknown(),
  descripcion: texto(1000, 'La descripción no puede quedar vacía.'),
});
export type ParametroDatos = z.output<typeof parametroSchema>;

const coordenada = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), `Número entre ${min} y ${max}.`);

export const ubicacionSchema = z
  .object({
    id: id().nullable(),
    versionFila: version().nullable(),
    codigo,
    nombre: texto(200, 'Ingresá el nombre.'),
    tipo: z.enum(TIPOS_UBICACION, 'Elegí el tipo.'),
    pais,
    latitud: coordenada(-90, 90),
    longitud: coordenada(-180, 180),
    radioM: z
      .string()
      .trim()
      .transform((v) => (v === '' ? null : Number(v)))
      .refine((v) => v === null || (Number.isInteger(v) && v > 0), 'Metros, entero mayor que cero.'),
  })
  .refine((d) => (d.latitud === null) === (d.longitud === null), { path: ['longitud'], message: 'Cargá latitud y longitud, o ninguna.' });
export type UbicacionEntrada = z.input<typeof ubicacionSchema>;
export type UbicacionDatos = z.output<typeof ubicacionSchema>;
