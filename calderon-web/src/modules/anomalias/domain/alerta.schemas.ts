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

// Migración 189: gestión (solo forma; largos mínimos, quién puede y plazos los decide la base)
export const avanceAlertaSchema = z.object({ alertaId: id(), hecho: textoObligatorio(2000, 'Contá qué se hizo.'), falta: z.string().max(2000).nullable() });
export const reasignarAlertaSchema = z.object({
  alertaId: id(),
  rol: z.string().min(1, 'Elegí el equipo.'),
  usuarioId: idOpcional(),
  motivo: textoObligatorio(1000, 'Contá por qué se reasigna.'),
});
export const pedirProrrogaSchema = z.object({ alertaId: id(), horas: z.number().int(), motivo: textoObligatorio(1000, 'Contá por qué hace falta más plazo.') });
export const resolverProrrogaSchema = z.object({ prorrogaId: id(), aprobar: z.boolean(), motivo: z.string().max(1000).nullable() });
export const escalamientoVistoSchema = z.object({ alertaId: id() });
export const cambiarResponsableSchema = z.object({ codigo: z.string().min(1), rol: z.string().min(1), usuarioId: idOpcional() });
