import { RepoError, type Db } from '@/shared/repository/types';
import type { CamionId, ChoferId } from '@/shared/types/dominio';

/** Catálogos de apoyo del módulo Combustible (solo lectura, para elegir y mostrar). */
export interface CamionOpcion {
  id: CamionId;
  codigoInterno: string;
  patente: string;
  tipoCombustibleId: number;
}

export interface EstacionOpcion {
  id: number;
  codigo: string;
  nombre: string;
  pais: string;
  esTanquePropio: boolean;
}

export interface ChoferOpcion {
  id: ChoferId;
  nombre: string;
}

export interface MonedaOpcion {
  codigo: string;
  nombre: string;
}

export const catalogoCombustibleRepository = (db: Db) => ({
  async camiones(): Promise<CamionOpcion[]> {
    const { data, error } = await db
      .schema('mae')
      .from('v_camion')
      .select('id, codigo_interno, patente, tipo_combustible_id')
      .in('estado', ['activo', 'taller'])
      .order('codigo_interno');
    if (error) throw new RepoError(error);
    return (data as { id: number; codigo_interno: string; patente: string; tipo_combustible_id: number }[]).map((c) => ({
      id: c.id as CamionId,
      codigoInterno: c.codigo_interno,
      patente: c.patente,
      tipoCombustibleId: c.tipo_combustible_id,
    }));
  },

  async estaciones(): Promise<EstacionOpcion[]> {
    const { data, error } = await db
      .schema('mae')
      .from('estacion_servicio')
      .select('id, codigo, nombre, pais, es_tanque_propio')
      .is('eliminado_en', null)
      .order('nombre');
    if (error) throw new RepoError(error);
    return data.map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre, pais: e.pais.trim(), esTanquePropio: e.es_tanque_propio }));
  },

  async choferes(): Promise<ChoferOpcion[]> {
    const { data, error } = await db
      .schema('mae')
      .from('chofer')
      .select('id, nombre, apellido')
      .is('eliminado_en', null)
      .neq('estado', 'baja')
      .order('apellido');
    if (error) throw new RepoError(error);
    return data.map((c) => ({ id: c.id as ChoferId, nombre: `${c.apellido}, ${c.nombre}` }));
  },

  async monedas(): Promise<MonedaOpcion[]> {
    const { data, error } = await db.schema('ref').from('moneda').select('codigo, nombre').is('eliminado_en', null).order('codigo');
    if (error) throw new RepoError(error);
    return data.map((m) => ({ codigo: m.codigo.trim(), nombre: m.nombre }));
  },
});

/** Mapas id → texto para mostrar nombres en listas (dos o tres lecturas, sin embebidos entre esquemas). */
export async function nombresDe(db: Db, ids: { camiones?: number[]; choferes?: number[]; estaciones?: number[]; depositos?: number[] }) {
  const unicos = (l?: number[]) => [...new Set((l ?? []).filter((x) => Number.isFinite(x)))];
  const c = unicos(ids.camiones);
  const ch = unicos(ids.choferes);
  const e = unicos(ids.estaciones);
  const d = unicos(ids.depositos);
  const vacio = Promise.resolve({ data: [] as never[], error: null });
  const [camiones, choferes, estaciones, depositos] = await Promise.all([
    c.length ? db.schema('mae').from('camion').select('id, patente').in('id', c) : vacio,
    ch.length ? db.schema('mae').from('chofer').select('id, nombre, apellido').in('id', ch) : vacio,
    e.length ? db.schema('mae').from('estacion_servicio').select('id, nombre').in('id', e) : vacio,
    d.length ? db.schema('fue').from('deposito_combustible').select('id, codigo, tipo').in('id', d) : vacio,
  ]);
  for (const r of [camiones, choferes, estaciones, depositos]) if (r.error) throw new RepoError(r.error);
  return {
    patente: new Map((camiones.data as { id: number; patente: string }[]).map((x) => [x.id, x.patente])),
    chofer: new Map((choferes.data as { id: number; nombre: string; apellido: string }[]).map((x) => [x.id, `${x.apellido}, ${x.nombre}`])),
    estacion: new Map((estaciones.data as { id: number; nombre: string }[]).map((x) => [x.id, x.nombre])),
    deposito: new Map((depositos.data as { id: number; codigo: string; tipo: string }[]).map((x) => [x.id, { codigo: x.codigo, tipo: x.tipo }])),
  };
}
