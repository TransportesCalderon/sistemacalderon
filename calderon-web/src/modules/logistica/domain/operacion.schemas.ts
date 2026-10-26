import { z } from 'zod';
import { PASOS_OPERACION, TIPOS_HITO, TIPOS_OPERACION } from './operacion.types';

/** Formularios de Operaciones: solo forma. Las reglas (estado, lugares, fechas, equipo…) las aplica la base. */
const id = (mensaje: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? NaN : Number(v)))
    .refine((v) => Number.isInteger(v) && v > 0, mensaje);
const idOpcional = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === '' || v === null ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), 'Elegí una opción.');
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));
const instante = z
  .string()
  .nullable()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), 'Fecha y hora no válidas.');
const numero = (mensaje: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(/\./g, '').replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), mensaje);
const entero = (mensaje: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), mensaje);
const dia = z
  .string()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Fecha no válida.');
const servicio = z.number().int().positive();
const version = z.number().int().nullable();

export const operacionSchema = z.object({
  servicioId: servicio.nullable(),
  versionFila: version,
  sinConfirmar: z.boolean(),
  tipoOperacion: z.enum(TIPOS_OPERACION, { message: 'Elegí el tipo de operación.' }),
  fechaOperacion: dia,
  clienteId: id('Elegí el cliente.'),
  lineaId: idOpcional,
  lugarRetiroId: idOpcional,
  origenId: idOpcional,
  lugarAduanaId: idOpcional,
  destinoId: idOpcional,
  fechaPresentacion: instante,
  fechaEntrega: instante,
  producto: texto(200),
  pesoKg: numero('Kilos, número de 0 en adelante.'),
  tipoContenedor: texto(30),
  contenedor: texto(20),
  precinto: texto(60),
  taraMaxDias: entero('Días, entero mayor que cero.'),
  booking: texto(60),
  referenciaCliente: texto(60),
  buque: texto(100),
  crt: texto(60),
  mic: texto(60),
  observacion: texto(2000),
});
export type OperacionEntrada = z.input<typeof operacionSchema>;
export type OperacionDatos = z.output<typeof operacionSchema>;

/** Alta en un paso (migración 42): cantidad de operaciones iguales y, con una sola, el equipo. */
const idVacio = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === '' || v === null ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), 'Elegí una opción.');
export const altaSchema = operacionSchema.extend({
  cantidad: z
    .string()
    .trim()
    .transform((v) => (v === '' ? 1 : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 50, 'De 1 a 50.'),
  semiId: idVacio,
  camionId: idVacio,
  choferId: idVacio,
});
export type AltaEntrada = z.input<typeof altaSchema>;
export type AltaDatos = z.output<typeof altaSchema>;

export const avanzarSchema = z.object({
  servicioId: z.number().int().positive(),
  paso: z.enum(PASOS_OPERACION),
  momento: z
    .string()
    .nullable()
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), 'Fecha y hora no válidas.'),
  odometroKm: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(/\./g, '').replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), 'Kilómetros, número de 0 en adelante.'),
  detalle: z
    .string()
    .trim()
    .max(500, 'Máximo 500 caracteres.')
    .transform((v) => (v === '' ? null : v)),
});
export type AvanzarDatos = z.output<typeof avanzarSchema>;

export const servicioSchema = z.object({ servicioId: servicio });

export const equipoSchema = z.object({
  servicioId: servicio,
  semiId: id('Elegí el semi.'),
  camionId: id('Elegí el tractor.'),
  choferId: id('Elegí el chofer.'),
  observacion: texto(500),
});
export type EquipoDatos = z.output<typeof equipoSchema>;

export const terceroSchema = z.object({
  servicioId: servicio,
  transportistaId: idOpcional,
  chofer: texto(120),
  tractor: texto(20),
  semi: texto(20),
});
export type TerceroDatos = z.output<typeof terceroSchema>;

export const hitoSchema = z.object({
  servicioId: servicio,
  tipo: z.enum(TIPOS_HITO),
  momento: instante,
  detalle: texto(500),
});
export type HitoDatos = z.output<typeof hitoSchema>;

export const terminarDemoraSchema = z.object({ servicioId: servicio, hasta: instante });
export const anularHitoSchema = z.object({ hitoId: z.number().int().positive() });
export const quitarEquipoSchema = z.object({ servicioId: servicio, motivo: texto(500) });
export const cancelarOperacionSchema = z.object({ servicioId: servicio, motivo: z.string().trim().min(1, 'Indicá el motivo.').max(500) });

export const lineaSchema = z.object({
  id: z.number().int().positive().nullable(),
  versionFila: version,
  codigo: z.string().trim().min(1, 'Indicá el código (por ejemplo SAI-BSAS).').max(30, 'Máximo 30 caracteres.'),
  lugarRetiroId: id('Elegí el lugar de retiro.'),
  lugarEntregaId: id('Elegí el lugar de entrega.'),
  lugarAduanaId: idOpcional,
  distanciaKm: numero('Kilómetros, número de 0 en adelante.'),
  cruzaFrontera: z.boolean(),
  transitHoras: entero('Horas, entero mayor que cero.'),
  consumoObjetivo: numero('Litros cada 100 km, por ejemplo 33,5.'),
  activa: z.boolean(),
  canonChofer: numero('Importe, número de 0 en adelante.'),
  canonMoneda: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v)),
});
export type LineaDatos = z.output<typeof lineaSchema>;

export const transportistaSchema = z.object({
  id: z.number().int().positive().nullable(),
  versionFila: version,
  razonSocial: z.string().trim().min(1, 'Indicá la razón social.').max(200, 'Máximo 200 caracteres.'),
  cuit: texto(13),
  telefono: texto(40),
  observaciones: texto(1000),
  activo: z.boolean(),
});
export type TransportistaDatos = z.output<typeof transportistaSchema>;

export const eliminarSchema = z.object({ id: z.number().int().positive(), versionFila: z.number().int() });
export type EliminarDatos = z.output<typeof eliminarSchema>;
