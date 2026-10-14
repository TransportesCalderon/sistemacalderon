import { RepoError, type Db } from '@/shared/repository/types';
import type { CatalogosFlota } from '../domain/camion.types';

/**
 * Catálogos de referencia (ref.*) que usa Flota: tipos de combustible y países.
 * Solo lectura; se editan en Configuración.
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
});
