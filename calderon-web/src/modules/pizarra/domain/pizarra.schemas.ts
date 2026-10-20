import { z } from 'zod';
import { ESTADOS_SEMI, TIPOS_SEMI } from './pizarra.types';

/** Formularios de la Pizarra y sus catálogos: solo forma. Las reglas las aplica la base. */
const id = () => z.number().int().positive();
const version = () => z.number().int().positive();
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));
const idOpcional = (mensaje: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), mensaje);
const dia = z
  .string()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Fecha no válida.');

/** Número decimal opcional (admite coma); vacío = null. */
const decimal = (mensaje: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .transform((v) => (v === null || v === '' ? null : Number(String(v).trim().replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), mensaje);

/** Cantidad escrita en la celda: vacío = sin dato (null), si no un entero de 0 en adelante. */
const cantidad = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === null || v === '' ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 999), 'Cantidad entera de 0 a 999.');

/** Lo que se edita desde la Pizarra: lugar en playa, observación y accesorios. */
export const edicionPizarraSchema = z.object({
  semiId: id(),
  versionFila: version(),
  lugarId: idOpcional('Elegí un lugar.'),
  observacion: opcional(500),
  accesorios: z.record(z.string().regex(/^\d+$/), cantidad),
});
export type EdicionPizarraEntrada = z.input<typeof edicionPizarraSchema>;
export type EdicionPizarraDatos = z.output<typeof edicionPizarraSchema>;

export const semiSchema = z.object({
  id: id().nullable(),
  versionFila: version().nullable(),
  codigoInterno: z.string().trim().toUpperCase().min(1, 'Ingresá el código interno.').max(30, 'Máximo 30 caracteres.'),
  patente: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .refine((v) => v.length > 0, 'Ingresá la patente.'),
  paisPatente: z.string().regex(/^[A-Z]{2}$/, 'Elegí el país.'),
  tipo: z.enum(TIPOS_SEMI, 'Elegí el tipo.'),
  capacidadKg: z
    .union([z.string(), z.number()])
    .transform((v) => Number(String(v).replace(/\./g, '')))
    .refine((v) => Number.isInteger(v) && v > 0, 'Capacidad en kg, mayor que cero.'),
  tieneEquipoFrio: z.boolean(),
  estado: z.enum(ESTADOS_SEMI),
  taraFecha: dia,
});
export type SemiEntrada = z.input<typeof semiSchema>;
export type SemiDatos = z.output<typeof semiSchema>;

export const tipoAccesorioSchema = z.object({
  id: id().nullable(),
  versionFila: version().nullable(),
  nombre: z.string().trim().min(1, 'Ingresá el nombre.').max(60, 'Máximo 60 caracteres.'),
  sigla: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, 'De 1 a 6 letras o números, sin espacios.'),
  orden: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? 100 : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= 0 && v <= 999, 'Número de 0 a 999.'),
  activo: z.boolean(),
});
export type TipoAccesorioEntrada = z.input<typeof tipoAccesorioSchema>;
export type TipoAccesorioDatos = z.output<typeof tipoAccesorioSchema>;

export const gensetSchema = z.object({
  id: id().nullable(),
  versionFila: version().nullable(),
  codigo: z.string().trim().toUpperCase().min(1, 'Ingresá el código.').max(30, 'Máximo 30 caracteres.'),
  marca: opcional(60),
  modelo: opcional(60),
  numeroSerie: opcional(60),
  estado: z.enum(['activo', 'baja']),
  observaciones: opcional(500),
  capacidadL: decimal('Litros, número mayor que cero.'),
  consumoLh: decimal('Litros por hora, número mayor que cero.'),
});
export type GensetEntrada = z.input<typeof gensetSchema>;
export type GensetDatos = z.output<typeof gensetSchema>;

export const instalarGensetSchema = z.object({
  gensetId: id(),
  semiId: idOpcional('Elegí el semi.').refine((v) => v !== null, 'Elegí el semi.'),
});
export type InstalarGensetDatos = z.output<typeof instalarGensetSchema>;

export const retirarGensetSchema = z.object({ semiId: id() });
export const eliminarSchema = z.object({ id: id(), versionFila: version() });
export type Eliminar = z.output<typeof eliminarSchema>;
