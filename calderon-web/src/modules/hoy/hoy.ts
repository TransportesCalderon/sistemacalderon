import { queryOptions } from '@tanstack/react-query';
import { esTipoFicha, type TipoFicha } from '@/modules/core/fichas/ficha-url';
import { IDS_PANTALLA, type PantallaId } from '@/modules/core/permissions/matriz';
import { alcanceDe } from '@/modules/core/permissions/resolver';
import type { MapaPermisos } from '@/modules/core/permissions/types';
import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaISO } from '@/shared/types/dominio';

/**
 * Sprint 3 · «Hoy» (seg.fn_lo_mio_de_hoy, migración 116): lo que le toca a cada uno en una sola
 * lista. La base decide qué entra y en qué grupo; acá solo se ordena y se filtra por pantalla.
 * Cada renglón abre su ficha en el panel (carga, cierre, viaje) o lleva a su lista.
 */
export const VERSION_HOY = 116;

export const GRUPOS_HOY = ['aprobar', 'revisar', 'esperando'] as const;
export type GrupoHoy = (typeof GRUPOS_HOY)[number];
export const ETIQUETA_GRUPO_HOY: Record<GrupoHoy, { titulo: string; ayuda: string }> = {
  aprobar: { titulo: 'Para aprobar', ayuda: 'Lo registró otro usuario y tu rol puede aprobarlo.' },
  revisar: { titulo: 'Para hacer', ayuda: 'Trabajo pendiente que te toca.' },
  esperando: { titulo: 'Esperando a otro usuario', ayuda: 'Lo registraste vos: lo aprueba otro usuario.' },
};

export interface Tarea {
  grupo: GrupoHoy;
  tipo: string;
  /** La ficha que se abre en el panel; null si la tarea lleva a una lista. */
  objeto: { tipo: TipoFicha; id: number } | null;
  ruta: string | null;
  fecha: FechaISO | null;
  titulo: string;
  detalle: string | null;
  pantalla: PantallaId | null;
  cantidad: number;
}

const esGrupo = (v: unknown): v is GrupoHoy => (GRUPOS_HOY as readonly unknown[]).includes(v);
const esPantalla = (v: unknown): v is PantallaId => typeof v === 'string' && (IDS_PANTALLA as readonly string[]).includes(v);

/** Filas de la base → tareas válidas (lo que no tiene a dónde ir se descarta). */
export function parsearTareas(filas: unknown): Tarea[] {
  if (!Array.isArray(filas)) return [];
  const lista: Tarea[] = [];
  for (const f of filas as Record<string, unknown>[]) {
    const tipoObjeto = typeof f?.objeto_tipo === 'string' ? f.objeto_tipo : '';
    const idObjeto = Number(f?.objeto_id);
    const objeto = esTipoFicha(tipoObjeto) && Number.isSafeInteger(idObjeto) && idObjeto > 0 ? { tipo: tipoObjeto, id: idObjeto } : null;
    const ruta = typeof f?.ruta === 'string' && f.ruta.startsWith('/') ? f.ruta : null;
    if (!objeto && !ruta) continue;
    lista.push({
      grupo: esGrupo(f.grupo) ? f.grupo : 'revisar',
      tipo: String(f.tipo ?? ''),
      objeto,
      ruta,
      fecha: (typeof f.fecha === 'string' ? f.fecha : null) as FechaISO | null,
      titulo: String(f.titulo ?? ''),
      detalle: f.detalle == null ? null : String(f.detalle),
      pantalla: esPantalla(f.pantalla) ? f.pantalla : null,
      cantidad: Number(f.cantidad ?? 1) || 1,
    });
  }
  return lista;
}

/** Solo las tareas cuya pantalla el rol puede ver (la base ya filtró por persona y rol). */
export function tareasVisibles(tareas: readonly Tarea[], permisos: MapaPermisos): Tarea[] {
  return tareas.filter((t) => t.pantalla === null || alcanceDe(permisos, `${t.pantalla}:ver`) !== null);
}

/** Agrupadas en el orden de GRUPOS_HOY; dentro de cada grupo, lo más viejo primero. */
export function agruparTareas(tareas: readonly Tarea[]): { grupo: GrupoHoy; tareas: Tarea[] }[] {
  return GRUPOS_HOY.map((grupo) => ({
    grupo,
    tareas: tareas
      .filter((t) => t.grupo === grupo)
      .sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999')),
  })).filter((g) => g.tareas.length > 0);
}

/** Lo que muestra el contador de la barra: lo que espera una acción tuya (no lo que esperás de otro). */
export function contarPendientes(tareas: readonly Tarea[]): number {
  return tareas.filter((t) => t.grupo !== 'esperando').reduce((n, t) => n + t.cantidad, 0);
}

/** Texto del botón de cada renglón. */
export function accionDe(t: Tarea): string {
  if (t.tipo === 'carga_sin_ticket') return 'Adjuntar ticket';
  if (t.grupo === 'aprobar') return 'Revisar';
  return t.objeto ? 'Abrir' : 'Ir';
}

async function loMioDeHoy(db: Db): Promise<Tarea[]> {
  const { data, error } = await db.schema('seg').rpc('fn_lo_mio_de_hoy');
  if (error) throw new RepoError(error);
  return parsearTareas(data);
}

/** Una sola consulta para la lista y para el contador de la barra (clave bajo «pendientes»). */
export const hoyQuery = (db: Db) =>
  queryOptions({ queryKey: ['pendientes', 'hoy'] as const, queryFn: () => loMioDeHoy(db), staleTime: 30_000 });
