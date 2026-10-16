import { z } from 'zod';
import { TIPOS_TANQUE } from './tanque.types';

/**
 * Formularios de los tanques del camión. Solo forma (números y fechas bien escritos);
 * las reglas (útil ≤ nominal, un solo principal, vigencias, tanques con cargas) las aplica
 * la base y su mensaje se muestra tal cual.
 */
const id = () => z.number().int().positive();
const version = () => z.number().int().positive();

const litros = (mensaje: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(',', '.'))
    .refine((v) => /^\d{1,6}(\.\d{1,2})?$/.test(v), mensaje)
    .transform(Number);

const dia = (mensaje: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, mensaje);

const descripcion = z
  .string()
  .trim()
  .max(200, 'Máximo 200 caracteres.')
  .transform((v) => (v === '' ? null : v));

export const tanqueAltaSchema = z.object({
  camionId: id(),
  tipo: z.enum(TIPOS_TANQUE, 'Elegí el tipo de tanque.'),
  descripcion,
  capacidadNominalL: litros('Capacidad nominal en litros (hasta 2 decimales).'),
  capacidadUtilL: litros('Capacidad útil en litros (hasta 2 decimales).'),
  vigenteDesde: dia('Indicá desde qué fecha el camión tiene este tanque.'),
});
export type TanqueAltaEntrada = z.input<typeof tanqueAltaSchema>;
export type TanqueAlta = z.output<typeof tanqueAltaSchema>;

export const cambioCapacidadSchema = z.object({
  camionId: id(),
  tanqueId: id(),
  desde: dia('Indicá desde qué fecha rige la capacidad nueva.'),
  capacidadNominalL: litros('Capacidad nominal en litros (hasta 2 decimales).'),
  capacidadUtilL: litros('Capacidad útil en litros (hasta 2 decimales).'),
});
export type CambioCapacidadEntrada = z.input<typeof cambioCapacidadSchema>;
export type CambioCapacidad = z.output<typeof cambioCapacidadSchema>;

export const bajaTanqueSchema = z.object({
  camionId: id(),
  tanqueId: id(),
  versionFila: version(),
  hasta: dia('Indicá desde qué fecha el camión ya no tiene el tanque.'),
});
export type BajaTanque = z.output<typeof bajaTanqueSchema>;

export const eliminarTanqueSchema = z.object({
  camionId: id(),
  tanqueId: id(),
  versionFila: version(),
});
export type EliminarTanque = z.output<typeof eliminarTanqueSchema>;

export const descripcionTanqueSchema = z.object({
  camionId: id(),
  tanqueId: id(),
  versionFila: version(),
  descripcion,
});
export type DescripcionTanque = z.output<typeof descripcionTanqueSchema>;
