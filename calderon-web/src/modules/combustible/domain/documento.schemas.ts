import { z } from 'zod';
import { FECHA_DIA, id, textoObligatorio, textoOpcional } from './comun';
import { TIPOS_DOCUMENTO } from './documento.types';

/** Formularios del ticket y de la validación. Solo forma; las reglas son de la base. */
export const documentoSchema = z.object({
  cargaId: id(),
  tipo: z.enum(TIPOS_DOCUMENTO, 'Elegí el tipo de documento.'),
  numero: textoObligatorio(60, 'Escribí el número del ticket.'),
  fecha: z.string().regex(FECHA_DIA, 'Indicá la fecha del ticket.'),
  archivo: z.string().min(1),
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'No se pudo leer el archivo.'),
  emisorId: id().nullable(),
});
export type DocumentoEntrada = z.input<typeof documentoSchema>;

export const quitarDocumentoSchema = z.object({ documentoId: id(), cargaId: id() });

export const validarCargaSchema = z.object({ cargaId: id(), motivo: textoOpcional(500) });
