import { RepoError, type Db } from '@/shared/repository/types';
import type { CatalogosFlota } from '../domain/camion.types';
import type { BaseOperativa } from '../domain/chofer.types';

/**
 * Catálogos que usa Flota, solo lectura: tipos de combustible y países (ref.*, se editan
 * en Configuración) y bases operativas (mae.ubicacion de tipo 'base', se editan en Comercial).
 */
export const catalogoFlotaRepository = (db: Db) => ({
  async obtener(): Promise<CatalogosFlota> {
    const [tipos, paises] = await Promise.all([
      db.schema('ref').from('tipo_combustible').select('id, codigo, nombre').is('eliminado_en', null).order('nombre'),
      db.schema('ref').from('pais').select('iso2, nombre').is('eliminado_en', null).order('nombre'),
    ]);
    if (tipos.error) throw new RepoError(tipos.error);
    if (paises.error) throw new RepoError(paises.error);
    return {
      tiposCombustible: tipos.data.map((t) => ({ id: t.id, codigo: t.codigo, nombre: t.nombre })),
      // char(2): se recorta por si el driver devuelve relleno
      paises: paises.data.map((p) => ({ iso2: p.iso2.trim(), nombre: p.nombre })),
    };
  },

  /** Bases operativas para el chofer (mae.ubicacion de tipo 'base', no eliminadas). */
  async bases(): Promise<BaseOperativa[]> {
    const { data, error } = await db
      .schema('mae')
      .from('ubicacion')
      .select('id, codigo, nombre')
      .eq('tipo', 'base')
      .is('eliminado_en', null)
      .order('nombre');
    if (error) throw new RepoError(error);
    return data.map((u) => ({ id: u.id, codigo: u.codigo, nombre: u.nombre }));
  },
});
