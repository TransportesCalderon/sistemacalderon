import { z } from 'zod';

/** Formularios de Tractores y viajes (migración 46): solo forma. Las reglas las aplica la base. */
const id = (mensaje: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? NaN : Number(v)))
    .refine((v) => Number.isInteger(v) && v > 0, mensaje);
const idOpcional = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === '' || v === null ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), 'Elegí una opción.');
const numero = (mensaje: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(/\./g, '').replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), mensaje);
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));
const dia = z
  .string()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Fecha no válida.');

export const asignarTractorSchema = z.object({
  camionId: id('Elegí el tractor.'),
  choferId: idOpcional,
  desde: dia,
});
export type AsignarTractorDatos = z.output<typeof asignarTractorSchema>;

/** Algo que lleva el viaje: una operación o una vuelta vacía por línea. */
const itemSchema = z.object({ servicioId: idOpcional, lineaId: idOpcional });

export const iniciarViajeSchema = z.object({
  camionId: id('Elegí el tractor.'),
  choferId: idOpcional,
  items: z.array(itemSchema).max(20, 'Hasta 20 operaciones por viaje.'),
  observacion: texto(2000),
});
export type IniciarViajeDatos = z.output<typeof iniciarViajeSchema>;

export const agregarItemSchema = z.object({ viajeId: id('Falta el viaje.'), servicioId: idOpcional, lineaId: idOpcional });
export type AgregarItemDatos = z.output<typeof agregarItemSchema>;

export const ajustarItemSchema = z.object({
  itemId: id('Falta la operación.'),
  canon: numero('Importe, número de 0 en adelante.'),
  moneda: texto(3),
  km: numero('Kilómetros, número de 0 en adelante.'),
  motivo: texto(500),
});
export type AjustarItemDatos = z.output<typeof ajustarItemSchema>;

export const itemIdSchema = z.object({ itemId: id('Falta la operación.') });
export const cambiarChoferViajeSchema = z.object({ viajeId: id('Falta el viaje.'), choferId: id('Elegí el chofer.') });
export const cerrarViajeSchema = z.object({ viajeId: id('Falta el viaje.'), versionFila: z.number().int() });
export const viajeIdSchema = z.object({ viajeId: id('Falta el viaje.') });
export const viajeConMotivoSchema = z.object({
  viajeId: id('Falta el viaje.'),
  motivo: z.string().trim().min(1, 'Escribí el motivo.').max(500, 'Máximo 500 caracteres.'),
});
