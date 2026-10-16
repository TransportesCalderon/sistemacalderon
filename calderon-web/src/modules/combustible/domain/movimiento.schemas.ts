import { z } from 'zod';
import { decimalTexto, id, idObligatorio, idOpcional, instante, textoObligatorio, textoOpcional } from './comun';
import { CATEGORIAS_ENTRADA, CATEGORIAS_SALIDA } from './movimiento.types';

/** Formularios de Movimientos del camión. Solo forma; las reglas son de la base. */

export const CLASES_MOVIMIENTO = ['descarga_base', 'descarga_camion', 'salida_motivo', 'entrada_motivo'] as const;
export type ClaseMovimiento = (typeof CLASES_MOVIMIENTO)[number];

/** Valores del formulario (texto, como llegan de los inputs). */
export const movimientoFormSchema = z.object({
  clase: z.enum(CLASES_MOVIMIENTO, 'Elegí qué movimiento es.'),
  camionId: idObligatorio('Elegí el camión.'),
  fechaHoraLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Indicá la fecha y la hora.'),
  litros: decimalTexto(false, 'Litros con hasta 2 decimales.').refine((v) => v !== null && v > 0, 'Los litros deben ser mayores que cero.'),
  depositoBaseId: idOpcional(),
  camionDestinoId: idOpcional(),
  categoria: z.string(),
  choferId: idOpcional(),
  motivo: textoOpcional(500),
  evidencia: textoOpcional(500),
});
export type MovimientoFormEntrada = z.input<typeof movimientoFormSchema>;

export const descargaSchema = z.object({
  camionId: id(),
  litros: z.number().positive(),
  fechaHora: instante(),
  depositoBaseId: id().nullable(),
  camionDestinoId: id().nullable(),
  choferId: id().nullable(),
  motivo: z.string().nullable(),
});
export type Descarga = z.output<typeof descargaSchema>;

export const movimientoConMotivoSchema = z.object({
  camionId: id(),
  categoria: z.enum([...CATEGORIAS_SALIDA, ...CATEGORIAS_ENTRADA]),
  litros: z.number().positive(),
  fechaHora: instante(),
  motivo: textoObligatorio(500, 'Escribí el motivo.'),
  evidencia: z.string().nullable(),
  choferId: id().nullable(),
});
export type MovimientoConMotivo = z.output<typeof movimientoConMotivoSchema>;

export const resolverMovimientoSchema = z
  .object({ movimientoId: id(), aprobar: z.boolean(), motivo: textoOpcional(500) })
  .refine((d) => d.aprobar || d.motivo !== null, { path: ['motivo'], message: 'Escribí el motivo del rechazo.' });

export const solicitarReversoSchema = z.object({
  movimientoId: id(),
  motivo: textoObligatorio(500, 'Escribí el motivo del reverso.'),
});
