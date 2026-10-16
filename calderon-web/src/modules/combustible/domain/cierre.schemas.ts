import { z } from 'zod';
import { decimalTexto, id, idOpcional, textoObligatorio, textoOpcional, version } from './comun';
import { RESULTADOS_TEST_ALCOHOL, type DatosBorrador, type ResultadoTestAlcohol } from './cierre.types';

/**
 * Formularios del cierre de viaje. Solo forma: qué justificación hace falta, qué tolerancia
 * aplica o si el chofer figura en los tramos lo decide la base (pendientes de fn_resultado_cierre).
 */

/** Datos del borrador tal como los escribe el usuario (texto, admite coma decimal). */
export const borradorFormSchema = z.object({
  choferResponsableId: idOpcional(),
  motivoChofer: textoOpcional(500),
  programadorVelocidadPct: decimalTexto(true),
  testAlcohol: z
    .string()
    .refine((v) => v === '' || (RESULTADOS_TEST_ALCOHOL as readonly string[]).includes(v), 'Resultado no válido.')
    .transform((v) => (v === '' ? null : (v as ResultadoTestAlcohol))),
  kmManual: decimalTexto(true),
  consumoPlataformaManualL: decimalTexto(true),
  motivoAjuste: textoOpcional(500),
  noImputableL: decimalTexto(true).transform((v) => v ?? 0),
  noImputableRalentiH: decimalTexto(true).transform((v) => v ?? 0),
  noImputableMotivo: textoOpcional(500),
  justificacion: textoOpcional(2000),
  observaciones: textoOpcional(2000),
});
export type BorradorFormEntrada = z.input<typeof borradorFormSchema>;

/** DatosBorrador → valores iniciales del formulario. */
export function aFormularioBorrador(d: DatosBorrador): BorradorFormEntrada {
  const t = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
  return {
    choferResponsableId: d.choferResponsableId === null ? '' : String(d.choferResponsableId),
    motivoChofer: d.motivoChofer ?? '',
    programadorVelocidadPct: t(d.programadorVelocidadPct),
    testAlcohol: d.testAlcohol ?? '',
    kmManual: t(d.kmManual),
    consumoPlataformaManualL: t(d.consumoPlataformaManualL),
    motivoAjuste: d.motivoAjuste ?? '',
    noImputableL: d.noImputableL ? t(d.noImputableL) : '',
    noImputableRalentiH: d.noImputableRalentiH ? t(d.noImputableRalentiH) : '',
    noImputableMotivo: d.noImputableMotivo ?? '',
    justificacion: d.justificacion ?? '',
    observaciones: d.observaciones ?? '',
  };
}

const datosBorrador = z.object({
  choferResponsableId: id().nullable(),
  motivoChofer: z.string().nullable(),
  programadorVelocidadPct: z.number().nullable(),
  testAlcohol: z.enum(RESULTADOS_TEST_ALCOHOL).nullable(),
  kmManual: z.number().nullable(),
  consumoPlataformaManualL: z.number().nullable(),
  motivoAjuste: z.string().nullable(),
  noImputableL: z.number(),
  noImputableRalentiH: z.number(),
  noImputableMotivo: z.string().nullable(),
  justificacion: z.string().nullable(),
  observaciones: z.string().nullable(),
});

/** Crear el borrador de un viaje: el cierre no elige la llegada (la toma la base de las fronteras). */
export const crearBorradorSchema = z.object({ camionId: id(), cargaSalidaId: id() });
export type CrearBorradorInput = z.input<typeof crearBorradorSchema>;

export const guardarBorradorSchema = datosBorrador.extend({ id: id(), versionFila: version() });
export type GuardarBorradorInput = z.input<typeof guardarBorradorSchema>;

/** Vuelve a guardar el borrador para que la base tome el corte de llegada vigente. */
export const actualizarLimitesSchema = z.object({ id: id(), versionFila: version() });
export type ActualizarLimitesInput = z.input<typeof actualizarLimitesSchema>;

export const aprobarCierreSchema = z.object({ id: id(), versionFila: version() });
export type AprobarCierreInput = z.input<typeof aprobarCierreSchema>;

export const anularCierreSchema = z.object({
  id: id(),
  versionFila: version(),
  motivo: textoObligatorio(500, 'Escribí el motivo de la anulación.'),
});
export type AnularCierreInput = z.input<typeof anularCierreSchema>;
