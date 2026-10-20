import { z } from 'zod';
import { decimalTexto, id, idObligatorio, idOpcional, instante, textoObligatorio, textoOpcional } from './comun';
import { MEDIOS_PAGO } from './carga.types';

/**
 * Formularios de Combustible > Cargas. Solo validan la forma (obligatorios, números):
 * las reglas (corte de viaje, faltante, período cerrado…) las aplica la base.
 */

/** Valores del formulario de alta (todo texto, como llega de los inputs). */
export const cargaFormSchema = z.object({
  camionId: idObligatorio('Elegí el camión.'),
  choferId: idOpcional(),
  estacionId: idObligatorio('Elegí la estación.'),
  fechaHoraLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Indicá la fecha y la hora.'),
  litros: decimalTexto(false, 'Litros con hasta 2 decimales.').refine((v) => v !== null && v > 0, 'Los litros deben ser mayores que cero.'),
  precioUnitario: decimalTexto(false, 'Precio con hasta 4 decimales.'),
  moneda: z.string().trim().length(3, 'Elegí la moneda.'),
  medioPago: z.enum(MEDIOS_PAGO, 'Elegí el medio de pago.'),
  odometroKm: decimalTexto(true, 'Odómetro con hasta 1 decimal.'),
  tanqueLleno: z.boolean(),
  esFrontera: z.boolean(),
  faltanteLlenoL: decimalTexto(true, 'Litros con hasta 2 decimales.').transform((v) => v ?? 0),
  faltanteObservacion: textoOpcional(500),
});
export type CargaFormEntrada = z.input<typeof cargaFormSchema>;

/** Lo que recibe la server action (la hora ya convertida a UTC con la zona del usuario). */
export const cargaAltaSchema = z.object({
  camionId: id(),
  choferId: id().nullable(),
  estacionId: id(),
  fechaHora: instante(),
  tipoCombustibleId: id(),
  litros: z.number().positive(),
  precioUnitario: z.number().min(0),
  moneda: z.string().length(3),
  /** Migración 44: lo recalcula la base (litros × precio); se envía el mismo cálculo. */
  importeOriginal: z.number().min(0),
  medioPago: z.enum(MEDIOS_PAGO),
  odometroKm: z.number().min(0).nullable(),
  tanqueLleno: z.boolean(),
  esFrontera: z.boolean(),
  faltanteLlenoL: z.number().min(0),
  faltanteObservacion: z.string().nullable(),
  anulaId: id().nullable(),
});
export type CargaAlta = z.output<typeof cargaAltaSchema>;
export type CargaAltaInput = z.input<typeof cargaAltaSchema>;

/** Migración 47: corregir una carga en el lugar. El camión no cambia; las reglas las aplica la base. */
export const cargaEdicionSchema = cargaAltaSchema
  .omit({ camionId: true, tipoCombustibleId: true, importeOriginal: true, anulaId: true })
  .extend({ cargaId: id(), versionFila: z.number().int(), motivo: z.string().nullable() });
export type CargaEdicion = z.output<typeof cargaEdicionSchema>;
export type CargaEdicionInput = z.input<typeof cargaEdicionSchema>;

export const solicitarAnulacionSchema = z.object({
  cargaId: id(),
  motivo: textoObligatorio(500, 'Escribí el motivo de la anulación.'),
});
export type SolicitarAnulacionInput = z.input<typeof solicitarAnulacionSchema>;

/** Migración 44: eliminar del todo una carga cargada por error. */
export const eliminarCargaSchema = z.object({
  cargaId: id(),
  motivo: textoObligatorio(500, 'Escribí por qué se elimina.'),
});

export const resolverSolicitudSchema = z
  .object({
    solicitudId: id(),
    aprobar: z.boolean(),
    motivo: textoOpcional(500),
  })
  .refine((d) => d.aprobar || d.motivo !== null, { path: ['motivo'], message: 'Escribí el motivo del rechazo.' });
export type ResolverSolicitudInput = z.input<typeof resolverSolicitudSchema>;

export const retirarSolicitudSchema = z.object({ solicitudId: id() });

