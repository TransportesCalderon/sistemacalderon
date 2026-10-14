import { RepoError, type Db } from '@/shared/repository/types';
import type { CatalogosComercial } from '../domain/cliente.types';

/**
 * Catálogos de referencia que usa Comercial, solo lectura (se editan en Configuración):
 * países con su moneda por defecto (ref.pais) y monedas (ref.moneda).
 */
export const catalogoComercialRepository = (db: Db) => ({
  async obtener(): Promise<CatalogosComercial> {
    const [paises, monedas] = await Promise.all([
      db.schema('ref').from('pais').select('iso2, nombre, moneda_defecto').is('eliminado_en', null).order('nombre'),
      db.schema('ref').from('moneda').select('codigo, nombre, simbolo').is('eliminado_en', null).order('codigo'),
    ]);
    if (paises.error) throw new RepoError(paises.error);
    if (monedas.error) throw new RepoError(monedas.error);
    return {
      // char(n): se recorta por si el driver devuelve relleno
      paises: paises.data.map((p) => ({ iso2: p.iso2.trim(), nombre: p.nombre, monedaDefecto: p.moneda_defecto.trim() })),
      monedas: monedas.data.map((m) => ({ codigo: m.codigo.trim(), nombre: m.nombre, simbolo: m.simbolo })),
    };
  },
});
