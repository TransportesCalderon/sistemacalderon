import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/database.generated';
import { parsearPuntos, type PuntoRuta } from '../domain/rutas';

/** Migración 136: la ruta para el chofer de cada operación. La base valida todo. */
export interface RutaOperacion {
  id: number;
  notas: string | null;
  puntos: PuntoRuta[];
  linkOriginal: string | null;
  version: number;
}

export interface RutaDatos {
  servicioId: number;
  version: number | null;
  notas: string;
  puntos: PuntoRuta[];
  linkOriginal: string | null;
}

export const parsearRutaOperacion = (v: unknown): RutaOperacion | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return {
    id: Number(o.id),
    notas: typeof o.notas === 'string' && o.notas ? o.notas : null,
    puntos: parsearPuntos(o.puntos),
    linkOriginal: typeof o.link_original === 'string' && o.link_original ? o.link_original : null,
    version: Number(o.version ?? 1),
  };
};

export const rutasRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  return {
    async deOperacion(servicioId: number): Promise<RutaOperacion | null> {
      const { data, error } = await ops().rpc('fn_ruta_de_servicio', { p_servicio: servicioId });
      if (error) throw new RepoError(error);
      return parsearRutaOperacion(data);
    },
    async guardar(d: RutaDatos): Promise<void> {
      const { error } = await ops().rpc('fn_guardar_ruta_operacion', {
        p_servicio: d.servicioId,
        p_version: d.version,
        p_datos: {
          notas: d.notas,
          link_original: d.linkOriginal,
          puntos: d.puntos.map((p) => ({ nombre: p.nombre, lat: p.lat, lng: p.lng })),
        } as unknown as Json,
      });
      if (error) throw new RepoError(error);
    },
    async quitar(servicioId: number, version: number): Promise<void> {
      const { error } = await ops().rpc('fn_quitar_ruta_operacion', { p_servicio: servicioId, p_version: version });
      if (error) throw new RepoError(error);
    },
  };
};
