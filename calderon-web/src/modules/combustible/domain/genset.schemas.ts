import { z } from 'zod';
import { decimalTexto, id, idObligatorio, idOpcional, instante, textoObligatorio, textoOpcional } from './comun';

/** Combustible del genset (migración 48): solo forma. Las reglas (horómetro, cierres, roles) las aplica la base. */

/** Lo que escribe el usuario (texto, admite coma). */
export const registroGensetFormSchema = z.object({
  gensetId: idObligatorio('Elegí el genset.'),
  tipo: z.enum(['carga', 'descarga']),
  fechaHoraLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Indicá la fecha y la hora.'),
  litros: decimalTexto(false, 'Litros con hasta 2 decimales.').refine((v) => v !== null && v > 0, 'Los litros deben ser mayores que cero.'),
  horometroH: decimalTexto(false, 'Horómetro: horas, con hasta 1 decimal.'),
  tanqueLleno: z.boolean(),
  vacio: z.boolean(),
  choferId: idOpcional(),
  camionId: idOpcional(),
  estacionId: idOpcional(),
  precioUnitario: decimalTexto(true, 'Precio con hasta 4 decimales.'),
  moneda: z.string().trim(),
  ticketNumero: textoOpcional(60),
  depositoId: idOpcional(),
  observacion: textoOpcional(1000),
});
export type RegistroGensetFormEntrada = z.input<typeof registroGensetFormSchema>;

/** Lo que recibe la server action (la hora ya en UTC). */
export const registroGensetSchema = z.object({
  gensetId: id(),
  tipo: z.enum(['carga', 'descarga']),
  fechaHora: instante(),
  litros: z.number().positive(),
  horometroH: z.number().min(0),
  tanqueLleno: z.boolean(),
  vacio: z.boolean(),
  choferId: id().nullable(),
  camionId: id().nullable(),
  estacionId: id().nullable(),
  precioUnitario: z.number().min(0).nullable(),
  moneda: z.string().nullable(),
  ticketNumero: z.string().nullable(),
  depositoId: id().nullable(),
  observacion: z.string().nullable(),
});
export type RegistroGenset = z.output<typeof registroGensetSchema>;
export type RegistroGensetInput = z.input<typeof registroGensetSchema>;

export const eliminarRegistroGensetSchema = z.object({
  registroId: id(),
  gensetId: id(),
  motivo: textoObligatorio(500, 'Escribí por qué se elimina.'),
});

export const cerrarGensetSchema = z.object({
  inicioId: id(),
  gensetId: id(),
  choferId: idOpcional(),
  motivoChofer: textoOpcional(500),
  okTolerancia: z.boolean(),
  observacion: textoOpcional(1000),
});
export type CerrarGensetInput = z.input<typeof cerrarGensetSchema>;

export const anularCierreGensetSchema = z.object({
  cierreId: id(),
  gensetId: id(),
  motivo: textoObligatorio(500, 'Escribí por qué se anula.'),
});
