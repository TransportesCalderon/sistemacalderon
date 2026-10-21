import { z } from 'zod';
import { id, idOpcional, textoObligatorio } from '@/modules/combustible/domain/comun';

/** Solo forma: quién puede revisar, el largo de la explicación y el descuento los decide la base. */
export const tomarAlertaSchema = z.object({ alertaId: id() });

export const resolverAlertaSchema = z.object({
  alertaId: id(),
  decision: z.enum(['justificada', 'descartada', 'confirmada', 'a_descontar']),
  justificacion: textoObligatorio(1000, 'Escribí la explicación.'),
  choferId: idOpcional(),
  litros: z.number().positive().nullable(),
});
export type ResolverAlerta = z.output<typeof resolverAlertaSchema>;

export const reabrirAlertaSchema = z.object({ alertaId: id(), justificacion: textoObligatorio(1000, 'Escribí por qué se reabre.') });
export const comentarAlertaSchema = z.object({ alertaId: id(), texto: textoObligatorio(2000, 'Escribí el comentario.') });

export const cambiarUmbralesSchema = z.object({
  codigo: z.string().min(1),
  parametros: z.record(z.string(), z.number()),
  activa: z.boolean(),
});
