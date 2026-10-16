import { z } from 'zod';
import { decimalTexto, id, idObligatorio, idOpcional, instante, textoObligatorio, textoOpcional, version } from './comun';
import { DECLARANTES, FUENTES_CONTROL, METODOS_MEDICION } from './mochila.types';

/** Formularios de Mochilas y controles. Solo forma; las reglas son de la base. */

export const usoMochilaAltaSchema = z.object({ camionId: id(), paradaDesdeId: id() });
export type UsoMochilaAltaInput = z.input<typeof usoMochilaAltaSchema>;

export const cerrarUsoSchema = z.object({ usoId: id(), versionFila: version(), paradaHastaId: id() });
export type CerrarUsoInput = z.input<typeof cerrarUsoSchema>;

/** Puesta en marcha: uso de mochila (si falta) + depósito + control inicial medido. */
export const puestaEnMarchaFormSchema = z.object({
  paradaDesdeId: idObligatorio('Elegí la parada frontera de puesta en marcha.'),
  codigo: textoObligatorio(40, 'Indicá el código del depósito.'),
  nombre: textoObligatorio(120, 'Indicá el nombre.'),
  capacidadL: decimalTexto(false, 'Capacidad en litros.').refine((v) => v !== null && v > 0, 'La capacidad debe ser mayor que cero.'),
  litrosIniciales: decimalTexto(false, 'Litros medidos con hasta 2 decimales.'),
  metodo: z.enum(METODOS_MEDICION, 'Elegí el método de medición.'),
  observaciones: textoOpcional(500),
});
export type PuestaEnMarchaFormEntrada = z.input<typeof puestaEnMarchaFormSchema>;

export const puestaEnMarchaSchema = z.object({
  camionId: id(),
  tipoCombustibleId: id(),
  paradaDesdeId: id(),
  codigo: z.string().trim().min(1).max(40),
  nombre: z.string().trim().min(1).max(120),
  capacidadL: z.number().positive(),
  litrosIniciales: z.number().min(0),
  metodo: z.enum(METODOS_MEDICION),
  observaciones: z.string().nullable(),
});
export type PuestaEnMarchaInput = z.input<typeof puestaEnMarchaSchema>;
export type PuestaEnMarcha = z.output<typeof puestaEnMarchaSchema>;

export const cerrarVigenciaSchema = z.object({ depositoId: id(), versionFila: version(), paradaHastaId: id() });
export type CerrarVigenciaInput = z.input<typeof cerrarVigenciaSchema>;

/** Formulario de control: de frontera (con parada) o intermedio (con fecha y hora). */
export const controlFormSchema = z.object({
  tipo: z.enum(['llegada', 'intermedio']),
  cargaParadaId: idOpcional(),
  fechaHoraLocal: z.string(),
  litros: decimalTexto(false, 'Litros con hasta 2 decimales.'),
  fuente: z.enum(FUENTES_CONTROL),
  metodo: z.union([z.enum(METODOS_MEDICION), z.literal('')]),
  declaranteTipo: z.union([z.enum(DECLARANTES), z.literal('')]),
  choferId: idOpcional(),
  observaciones: textoOpcional(500),
  motivoReemplazo: textoOpcional(500),
});
export type ControlFormEntrada = z.input<typeof controlFormSchema>;

export const controlAltaSchema = z.object({
  depositoId: id(),
  rol: z.enum(['inicial', 'llegada', 'intermedio']),
  cargaParadaId: id().nullable(),
  /** Solo intermedio; en una frontera la hora la fija la base (parada − 1 µs). */
  fechaHora: instante().nullable(),
  litros: z.number().min(0),
  fuente: z.enum(FUENTES_CONTROL),
  metodo: z.enum(METODOS_MEDICION).nullable(),
  declaranteTipo: z.enum(DECLARANTES).nullable(),
  choferId: id().nullable(),
  observaciones: z.string().nullable(),
  reemplazaId: id().nullable(),
  motivoReemplazo: z.string().nullable(),
});
export type ControlAlta = z.output<typeof controlAltaSchema>;
export type ControlAltaInput = z.input<typeof controlAltaSchema>;
