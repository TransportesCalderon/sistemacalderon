import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaISO } from '@/shared/types/dominio';
import { IDS_PANTALLA, type PantallaId } from '@/modules/core/permissions/matriz';

/**
 * Mis pendientes (fue.fn_mis_pendientes, migración 34). La base decide qué le toca a cada
 * usuario: aprobar (lo registró otro y tiene rol aprobador), esperando (lo registró él) y
 * revisar (totales de bandejas).
 */
export const GRUPOS = ['aprobar', 'esperando', 'revisar'] as const;
export type Grupo = (typeof GRUPOS)[number];
export const ETIQUETA_GRUPO: Record<Grupo, { titulo: string; ayuda: string }> = {
  aprobar: { titulo: 'Para aprobar', ayuda: 'Lo registró otro usuario y tu rol puede aprobarlo.' },
  esperando: { titulo: 'Esperando a otro usuario', ayuda: 'Lo registraste vos: lo aprueba otro usuario con rol aprobador.' },
  revisar: { titulo: 'Para revisar', ayuda: 'Bandejas con trabajo pendiente.' },
};

export interface Pendiente {
  grupo: Grupo;
  tipo: string;
  refId: number | null;
  fecha: FechaISO | null;
  titulo: string;
  detalle: string | null;
  ruta: string;
  pantalla: PantallaId | null;
  cantidad: number;
}

const esGrupo = (v: string): v is Grupo => (GRUPOS as readonly string[]).includes(v);
const esPantalla = (v: string): v is PantallaId => (IDS_PANTALLA as string[]).includes(v);

export async function misPendientes(db: Db): Promise<Pendiente[]> {
  const { data, error } = await db.schema('fue').rpc('fn_mis_pendientes');
  if (error) throw new RepoError(error);
  return (data ?? []).map((p) => ({
    grupo: esGrupo(p.grupo) ? p.grupo : 'revisar',
    tipo: p.tipo,
    refId: p.ref_id,
    fecha: p.fecha as FechaISO | null,
    titulo: p.titulo,
    detalle: p.detalle,
    ruta: p.ruta,
    pantalla: esPantalla(p.pantalla) ? p.pantalla : null,
    cantidad: p.cantidad,
  }));
}

export const pendientesQuery = (db: Db) =>
  queryOptions({ queryKey: ['pendientes'] as const, queryFn: () => misPendientes(db), staleTime: FRESCURA.bandeja });
