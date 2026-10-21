import { z } from 'zod';
import { id, textoObligatorio, textoOpcional } from './comun';

/** Solo forma: el mes terminado, el motivo y el precio los controla la base. */
export const cerrarRalentiSchema = z.object({
  choferId: id(),
  mes: z.string().regex(/^\d{4}-\d{2}-01$/, 'Elegí el mes.'),
  justificadoL: z.number().min(0),
  motivoJustificado: textoOpcional(1000),
  precioLitro: z.number().positive().nullable(),
  observacion: textoOpcional(1000),
});
export type CerrarRalenti = z.output<typeof cerrarRalentiSchema>;

export const anularCierreRalentiSchema = z.object({ cierreId: id(), motivo: textoObligatorio(500, 'Escribí por qué se anula.') });
