import { z } from 'zod';
import { decimalTexto, id, idObligatorio, idOpcional, instante, textoObligatorio, textoOpcional, version } from './comun';
import { MEDIOS_PAGO } from './carga.types';

/**
 * Formularios de Combustible > Cargas. Solo validan la forma (obligatorios, números):
 * las reglas (frontera, parada, mochila vigente, período cerrado…) las aplica la base.
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
  importeOriginal: decimalTexto(false, 'Importe con hasta 2 decimales.'),
  medioPago: z.enum(MEDIOS_PAGO, 'Elegí el medio de pago.'),
  odometroKm: decimalTexto(true, 'Odómetro con hasta 1 decimal.'),
  destino: z.enum(['tractor', 'mochila'], 'Elegí el destino.'),
  tanqueLleno: z.boolean(),
  esFrontera: z.boolean(),
  depositoId: idOpcional(),
  cargaPrincipalId: idOpcional(),
  mismoTicket: z.boolean(),
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
  importeOriginal: z.number().min(0),
  medioPago: z.enum(MEDIOS_PAGO),
  odometroKm: z.number().min(0).nullable(),
  destino: z.enum(['tractor', 'mochila']),
  tanqueLleno: z.boolean(),
  esFrontera: z.boolean(),
  depositoId: id().nullable(),
  cargaPrincipalId: id().nullable(),
  mismoTicket: z.boolean(),
  anulaId: id().nullable(),
});
export type CargaAlta = z.output<typeof cargaAltaSchema>;
export type CargaAltaInput = z.input<typeof cargaAltaSchema>;

export const solicitarAnulacionSchema = z.object({
  cargaId: id(),
  motivo: textoObligatorio(500, 'Escribí el motivo de la anulación.'),
});
export type SolicitarAnulacionInput = z.input<typeof solicitarAnulacionSchema>;

export const resolverSolicitudSchema = z
  .object({
    solicitudId: id(),
    aprobar: z.boolean(),
    motivo: textoOpcional(500),
  })
  .refine((d) => d.aprobar || d.motivo !== null, { path: ['motivo'], message: 'Escribí el motivo del rechazo.' });
export type ResolverSolicitudInput = z.input<typeof resolverSolicitudSchema>;

export const retirarSolicitudSchema = z.object({ solicitudId: id() });

export const confirmarAparteSchema = z.object({ cargaId: id(), versionFila: version() });
export type ConfirmarAparteInput = z.input<typeof confirmarAparteSchema>;
