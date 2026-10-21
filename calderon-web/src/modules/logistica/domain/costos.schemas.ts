import { z } from 'zod';
import { decimalTexto, id, textoObligatorio, textoOpcional } from '@/modules/combustible/domain/comun';

/** Gasto a mano del viaje (migración 51): solo forma. Qué gasto, la fecha y quién los controla la base. */
export const gastoViajeFormSchema = z.object({
  categoria: z.string().min(1, 'Elegí qué gasto es.'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indicá la fecha.'),
  importe: decimalTexto(false, 'Importe con hasta 2 decimales.'),
  moneda: z.string().min(1, 'Elegí la moneda.'),
  documento: textoOpcional(100),
  observacion: textoOpcional(1000),
});
export type GastoViajeFormEntrada = z.input<typeof gastoViajeFormSchema>;

export const agregarGastoSchema = z.object({
  viajeId: id(),
  categoria: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  importe: z.number().positive(),
  moneda: z.string().min(1),
  documento: z.string().nullable(),
  observacion: z.string().nullable(),
});
export type AgregarGasto = z.output<typeof agregarGastoSchema>;

export const anularGastoSchema = z.object({ gastoId: id(), viajeId: id(), motivo: textoObligatorio(500, 'Escribí por qué se anula.') });
