import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaISO } from '@/shared/types/dominio';

/** Migración 235 · Registro de actividad: qué se hizo, cuándo y quién (lee la auditoría de la base). */
export const VERSION_ACTIVIDAD = 235;

export const GRUPOS_ACTIVIDAD = [
  { valor: '', etiqueta: 'Todo' },
  { valor: 'cierres', etiqueta: 'Cierres de viaje' },
  { valor: 'combustible', etiqueta: 'Combustible' },
  { valor: 'operaciones', etiqueta: 'Operaciones' },
  { valor: 'mantenimiento', etiqueta: 'Mantenimiento' },
  { valor: 'liquidaciones', etiqueta: 'Liquidaciones' },
  { valor: 'finanzas', etiqueta: 'Finanzas' },
  { valor: 'ventas', etiqueta: 'Ventas' },
  { valor: 'datos', etiqueta: 'Datos' },
] as const;

/** Quién ve el registro completo (la base vuelve a controlarlo). */
export const VEN_ACTIVIDAD = ['gerencia', 'ti', 'auditor'] as const;

export interface Actividad {
  id: number;
  en: FechaISO;
  usuarioId: number | null;
  usuario: string | null;
  tipo: string;
  grupo: string;
  registro: string | null;
  que: string;
  motivo: string | null;
  ruta: string | null;
}

type J = Record<string, unknown>;
const t = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export const parsearActividad = (d: unknown): Actividad[] =>
  (Array.isArray(d) ? (d as J[]) : []).map((x) => ({
    id: Number(x.id),
    en: (t(x.en) ?? '') as FechaISO,
    usuarioId: x.usuario_id === null || x.usuario_id === undefined ? null : Number(x.usuario_id),
    usuario: t(x.usuario),
    tipo: t(x.tipo) ?? '',
    grupo: t(x.grupo) ?? 'otros',
    registro: t(x.registro),
    que: t(x.que) ?? '',
    motivo: t(x.motivo),
    ruta: t(x.ruta),
  }));

export const actividadRepository = (db: Db) => ({
  async lista(p: { desde?: string | null; hasta?: string | null; tabla?: string | null; fila?: number | null; usuario?: number | null; grupo?: string | null }) {
    const { data, error } = await db.schema('aud').rpc('fn_actividad', {
      p_desde: p.desde ?? null,
      p_hasta: p.hasta ?? null,
      p_tabla: p.tabla ?? null,
      p_fila: p.fila ?? null,
      p_usuario: p.usuario ?? null,
      p_grupo: p.grupo || null,
      p_limite: 500,
    });
    if (error) throw new RepoError(error);
    return parsearActividad(data);
  },
  async usuarios(): Promise<{ id: number; nombre: string }[]> {
    const { data, error } = await db.schema('aud').rpc('fn_actividad_usuarios');
    if (error) throw new RepoError(error);
    return (Array.isArray(data) ? (data as J[]) : []).map((x) => ({ id: Number(x.id), nombre: t(x.nombre) ?? '' }));
  },
});
