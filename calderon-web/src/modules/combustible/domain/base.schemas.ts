import { z } from 'zod';
import { CATEGORIAS_BASE, METODOS_MEDICION } from './base.types';
import { decimalTexto, id, idObligatorio, instante, textoObligatorio, textoOpcional, version } from './comun';

/** Formularios de Base Mendoza. Solo forma; las reglas (capacidad, período cerrado, aprobador…) son de la base. */

const litrosPositivos = decimalTexto(false, 'Litros con hasta 2 decimales.').refine(
  (v) => v !== null && v > 0,
  'Los litros deben ser mayores que cero.',
);
const litrosMedidos = decimalTexto(false, 'Litros con hasta 2 decimales.').transform((v) => v ?? 0);
const metodo = z.enum(METODOS_MEDICION, 'Elegí cómo se midió.');

/** Alta o edición del tanque (solo TI: la base solo deja a tc_admin). */
export const tanqueBaseSchema = z.object({
  id: id().nullable(),
  versionFila: version().nullable(),
  codigo: z.string().trim().toUpperCase().min(1, 'Ingresá el código.').max(30, 'Máximo 30 caracteres.'),
  nombre: textoObligatorio(200, 'Ingresá el nombre.'),
  estacionId: idObligatorio('Elegí el surtidor propio.'),
  tipoCombustibleId: idObligatorio('Elegí el combustible.'),
  capacidadL: litrosPositivos,
  observaciones: textoOpcional(500),
});
export type TanqueBaseEntrada = z.input<typeof tanqueBaseSchema>;
export type TanqueBaseDatos = z.output<typeof tanqueBaseSchema>;

/** Medición del tanque. Con reemplazaId corrige un control (motivo obligatorio). */
export const controlBaseSchema = z
  .object({
    depositoId: id(),
    fechaHora: instante(),
    litros: litrosMedidos,
    metodo,
    observaciones: textoOpcional(500),
    reemplazaId: id().nullable(),
    motivoReemplazo: textoOpcional(500),
  })
  .refine((d) => d.reemplazaId === null || d.motivoReemplazo !== null, {
    path: ['motivoReemplazo'],
    message: 'Escribí por qué se corrige.',
  });
export type ControlBaseEntrada = z.input<typeof controlBaseSchema>;
export type ControlBaseDatos = z.output<typeof controlBaseSchema>;

/** Compra a granel, bidón, derrame, robo o drenaje: nace pendiente y la aprueba otro usuario. */
export const movimientoBaseSchema = z.object({
  depositoId: id(),
  categoria: z.enum(CATEGORIAS_BASE, 'Elegí qué movimiento es.'),
  litros: litrosPositivos,
  fechaHora: instante(),
  motivo: textoObligatorio(500, 'Escribí el detalle.'),
  evidencia: textoOpcional(500),
});
export type MovimientoBaseEntrada = z.input<typeof movimientoBaseSchema>;
export type MovimientoBaseDatos = z.output<typeof movimientoBaseSchema>;

export const resolverMovimientoBaseSchema = z
  .object({ movimientoId: id(), aprobar: z.boolean(), motivo: textoOpcional(500) })
  .refine((d) => d.aprobar || d.motivo !== null, { path: ['motivo'], message: 'Escribí el motivo del rechazo.' });

/** Primer responsable del tanque (los siguientes, por traspaso). */
export const responsableSchema = z.object({
  depositoId: id(),
  usuarioId: idObligatorio('Elegí el responsable.'),
  desde: instante(),
});

/** Traspaso: control medido + cierre del saliente + alta del entrante, en el mismo instante. */
export const traspasoSchema = z.object({
  depositoId: id(),
  usuarioId: idObligatorio('Elegí quién recibe la base.'),
  fechaHora: instante(),
  litros: litrosMedidos,
  metodo,
  observaciones: textoOpcional(500),
});

/** Aprobación del segmento que cierra un control. */
export const aprobarSegmentoSchema = z.object({
  controlId: id(),
  justificacion: textoOpcional(1000),
  noImputableL: decimalTexto(true, 'Litros con hasta 2 decimales.').transform((v) => v ?? 0),
  noImputableMotivo: textoOpcional(500),
});

export const anularSegmentoSchema = z.object({
  aprobacionId: id(),
  motivo: textoObligatorio(500, 'Escribí el motivo de la anulación.'),
});
