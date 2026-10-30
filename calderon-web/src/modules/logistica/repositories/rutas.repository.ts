import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/database.generated';
import { parsearRutaChofer, parsearRutas, type PuntoRuta, type Ruta, type RutaChofer } from '../domain/rutas';

/** Migración 135: rutas para los choferes (por línea). La base valida todo. */
export interface RutaDatos {
  id: number | null;
  version: number | null;
  lineaId: number;
  nombre: string;
  notas: string;
  puntos: PuntoRuta[];
  linkOriginal: string | null;
  predeterminada: boolean;
}

export const rutasRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  return {
    async lista(lineaId: number | null = null): Promise<Ruta[]> {
      const { data, error } = await ops().rpc('fn_rutas', lineaId === null ? {} : { p_linea: lineaId });
      if (error) throw new RepoError(error);
      return parsearRutas(data);
    },
    async guardar(d: RutaDatos): Promise<number> {
      const { data, error } = await ops().rpc('fn_guardar_ruta', {
        p_id: d.id,
        p_version: d.version,
        p_datos: {
          linea_id: d.lineaId,
          nombre: d.nombre,
          notas: d.notas,
          predeterminada: d.predeterminada,
          link_original: d.linkOriginal,
          puntos: d.puntos.map((p) => ({ nombre: p.nombre, lat: p.lat, lng: p.lng })),
        } as unknown as Json,
      });
      if (error) throw new RepoError(error);
      return Number(data);
    },
    async quitar(id: number, version: number): Promise<void> {
      const { error } = await ops().rpc('fn_quitar_ruta', { p_id: id, p_version: version });
      if (error) throw new RepoError(error);
    },
    async deOperacion(servicioId: number): Promise<RutaChofer & { elegida: boolean } | null> {
      const { data, error } = await ops().rpc('fn_ruta_de_servicio', { p_servicio: servicioId });
      if (error) throw new RepoError(error);
      const r = parsearRutaChofer(data);
      return r ? { ...r, elegida: (data as { elegida?: boolean } | null)?.elegida === true } : null;
    },
    async elegir(servicioId: number, rutaId: number | null): Promise<void> {
      const { error } = await ops().rpc('fn_elegir_ruta', { p_servicio: servicioId, p_ruta: rutaId });
      if (error) throw new RepoError(error);
    },
  };
};
