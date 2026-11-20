import { z } from 'zod';

/**
 * Migración 286 · Horario de manejo (5:30 a 22:00, hora de Mendoza). Fuera de horario, al chofer que circula y a
 * Telemetría les llega un aviso; una hora después, si sigue, a Gerencia. Solo quienes tienen la marca «Habilita fuera
 * de horario» pueden dar permiso a un tractor por una noche.
 */
export const VERSION_HORARIO = 286;

export interface CirculandoFueraHorario {
  id: number;
  camionId: number;
  patente: string;
  chofer: string | null;
  desde: string;
  ultimoTs: string;
  velocidadKmh: number | null;
  avisadoEn: string | null;
  escaladoEn: string | null;
  detenidoEn: string | null;
  veces: number;
  habilitado: boolean;
}

export interface HabilitacionHorario {
  id: number;
  camionId: number;
  patente: string;
  chofer: string | null;
  noche: string;
  motivo: string;
  por: string | null;
}

export interface FueraHorario {
  activo: boolean;
  desde: string;
  hasta: string;
  enHorario: boolean;
  /** La noche que se muestra (la de ahora o, de día, la que pasó). */
  noche: string;
  /** La noche que se habilita (la de ahora o, de día, la de hoy). */
  proxima: string;
  puedeHabilitar: boolean;
  circulando: CirculandoFueraHorario[];
  habilitados: HabilitacionHorario[];
  tractores: { id: number; patente: string; chofer: string | null }[];
}

type J = Record<string, unknown>;
const esObj = (x: unknown): x is J => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);
const lista = (x: unknown): J[] => (Array.isArray(x) ? x.filter(esObj) : []);

export function parsearFueraHorario(crudo: unknown): FueraHorario {
  const j = esObj(crudo) ? crudo : {};
  return {
    activo: j.activo === true,
    desde: txt(j.desde) ?? '5:30',
    hasta: txt(j.hasta) ?? '22:00',
    enHorario: j.en_horario === true,
    noche: txt(j.noche) ?? '',
    proxima: txt(j.proxima) ?? '',
    puedeHabilitar: j.puede_habilitar === true,
    circulando: lista(j.circulando)
      .filter((c) => num(c.id) !== null)
      .map((c) => ({
        id: Number(c.id),
        camionId: Number(c.camion_id),
        patente: txt(c.patente) ?? '',
        chofer: txt(c.chofer),
        desde: txt(c.desde) ?? '',
        ultimoTs: txt(c.ultimo_ts) ?? '',
        velocidadKmh: num(c.velocidad_kmh),
        avisadoEn: txt(c.avisado_en),
        escaladoEn: txt(c.escalado_en),
        detenidoEn: txt(c.detenido_en),
        veces: num(c.veces) ?? 1,
        habilitado: c.habilitado === true,
      })),
    habilitados: lista(j.habilitados)
      .filter((h) => num(h.id) !== null)
      .map((h) => ({
        id: Number(h.id),
        camionId: Number(h.camion_id),
        patente: txt(h.patente) ?? '',
        chofer: txt(h.chofer),
        noche: txt(h.noche) ?? '',
        motivo: txt(h.motivo) ?? '',
        por: txt(h.por),
      })),
    tractores: lista(j.tractores)
      .filter((t) => num(t.id) !== null)
      .map((t) => ({ id: Number(t.id), patente: txt(t.patente) ?? '', chofer: txt(t.chofer) })),
  };
}

/** En qué está cada tractor que circuló fuera de horario. */
export function estadoFueraHorario(c: CirculandoFueraHorario): { texto: string; tono: 'exito' | 'alerta' | 'error' | 'neutro' } {
  if (c.habilitado) return { texto: 'Habilitado', tono: 'exito' };
  if (c.detenidoEn) return { texto: 'Se detuvo', tono: 'neutro' };
  if (c.escaladoEn) return { texto: 'Avisado a Gerencia', tono: 'error' };
  return { texto: c.veces > 1 ? 'Volvió a circular' : 'Avisado', tono: 'alerta' };
}

export const habilitarHorarioSchema = z.object({
  camionId: z.number().int().positive(),
  motivo: z.string().trim().min(5, 'Escribí el motivo').max(300, 'Hasta 300 letras'),
});
export const anularHabilitacionSchema = z.object({ id: z.number().int().positive(), motivo: z.string().trim().max(300).nullable() });
