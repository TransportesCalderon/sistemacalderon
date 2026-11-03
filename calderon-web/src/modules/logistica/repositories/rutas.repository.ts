import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/database.generated';
import {
  parsearAvisosDesvio,
  parsearChoferesRutas,
  parsearMiRuta,
  parsearOperacionesRuta,
  parsearPuntos,
  type AvisoDesvio,
  type ChoferRutas,
  type MiRuta,
  type OperacionRuta,
  type PuntoRuta,
} from '../domain/rutas';

/** Migración 136: la ruta para el chofer de cada operación. La base valida todo. */
export interface RutaOperacion {
  id: number;
  notas: string | null;
  puntos: PuntoRuta[];
  linkOriginal: string | null;
  version: number;
}

/** Migración 158: una de las rutas de la operación, con su estado. */
export interface RutaTramo extends RutaOperacion {
  orden: number;
  estado: 'hecha' | 'en_curso' | 'pendiente';
  llegadaEn: string | null;
  llegadaPor: 'gps' | 'chofer' | 'oficina' | null;
  /** Migración 161: la operación de la ruta (null: movimiento sin operación). */
  servicioId: number | null;
  numero: number | null;
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

export const parsearRutasTramo = (v: unknown): RutaTramo[] =>
  (Array.isArray(v) ? v : []).flatMap((x) => {
    const base = parsearRutaOperacion(x);
    if (!base) return [];
    const o = x as Record<string, unknown>;
    const estado = o.estado === 'hecha' || o.estado === 'en_curso' ? o.estado : 'pendiente';
    const por = o.llegada_por === 'gps' || o.llegada_por === 'chofer' || o.llegada_por === 'oficina' ? o.llegada_por : null;
    const num = (k: string) => (o[k] === null || o[k] === undefined ? null : Number(o[k]));
    return [
      {
        ...base,
        orden: Number(o.orden ?? 1),
        estado,
        llegadaEn: typeof o.llegada_en === 'string' ? o.llegada_en : null,
        llegadaPor: por,
        servicioId: num('servicio_id'),
        numero: num('numero'),
      },
    ];
  });

const datosRuta = (d: Pick<RutaDatos, 'notas' | 'linkOriginal' | 'puntos'>) =>
  ({
    notas: d.notas,
    link_original: d.linkOriginal,
    puntos: d.puntos.map((p) => ({ nombre: p.nombre, lat: p.lat, lng: p.lng })),
  }) as unknown as Json;

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
    /** Migración 158: todas las rutas de la operación, en orden. */
    async todas(servicioId: number): Promise<RutaTramo[]> {
      const { data, error } = await ops().rpc('fn_rutas_de_servicio', { p_servicio: servicioId });
      if (error) throw new RepoError(error);
      return parsearRutasTramo(data);
    },
    async guardarTramo(d: RutaDatos & { id: number | null }): Promise<number> {
      const { data, error } = await ops().rpc('fn_guardar_ruta_tramo', {
        p_servicio: d.servicioId,
        p_id: d.id,
        p_version: d.version,
        p_datos: datosRuta(d),
      });
      if (error) throw new RepoError(error);
      return Number(data);
    },
    async quitarTramo(id: number, version: number): Promise<void> {
      const { error } = await ops().rpc('fn_quitar_ruta_tramo', { p_id: id, p_version: version });
      if (error) throw new RepoError(error);
    },
    async moverTramo(id: number, dir: -1 | 1): Promise<void> {
      const { error } = await ops().rpc('fn_mover_ruta_tramo', { p_id: id, p_dir: dir });
      if (error) throw new RepoError(error);
    },
    async llegada(servicioId: number, llego: boolean): Promise<void> {
      const { error } = await ops().rpc('fn_llegada_ruta', { p_servicio: servicioId, p_llego: llego });
      if (error) throw new RepoError(error);
    },
    async llegueDestino(servicioId: number): Promise<void> {
      const { error } = await ops().rpc('fn_llegue_destino', { p_servicio: servicioId });
      if (error) throw new RepoError(error);
    },
    /** Migración 161: rutas por chofer. */
    async choferes(): Promise<ChoferRutas[]> {
      const { data, error } = await ops().rpc('fn_rutas_choferes');
      if (error) throw new RepoError(error);
      return parsearChoferesRutas(data);
    },
    async deChofer(choferId: number): Promise<RutaTramo[]> {
      const { data, error } = await ops().rpc('fn_rutas_de_chofer', { p_chofer: choferId });
      if (error) throw new RepoError(error);
      return parsearRutasTramo(data);
    },
    async guardarChofer(d: Omit<RutaDatos, 'servicioId'> & { choferId: number; id: number | null; servicioId: number | null }): Promise<number> {
      const { data, error } = await ops().rpc('fn_guardar_ruta_chofer', {
        p_chofer: d.choferId,
        p_id: d.id,
        p_version: d.version,
        p_servicio: d.servicioId,
        p_datos: datosRuta(d),
      });
      if (error) throw new RepoError(error);
      return Number(data);
    },
    async quitarChofer(choferId: number, id: number, version: number): Promise<void> {
      const { error } = await ops().rpc('fn_quitar_ruta_chofer', { p_chofer: choferId, p_id: id, p_version: version });
      if (error) throw new RepoError(error);
    },
    async moverChofer(choferId: number, id: number, dir: -1 | 1): Promise<void> {
      const { error } = await ops().rpc('fn_mover_ruta_chofer', { p_chofer: choferId, p_id: id, p_dir: dir });
      if (error) throw new RepoError(error);
    },
    async llegadaChofer(choferId: number, llego: boolean): Promise<void> {
      const { error } = await ops().rpc('fn_llegada_ruta_chofer', { p_chofer: choferId, p_llego: llego });
      if (error) throw new RepoError(error);
    },
    /** El chofer: su ruta en curso y «Llegué al destino». */
    async miRuta(): Promise<MiRuta | null> {
      const { data, error } = await ops().rpc('fn_mi_ruta');
      if (error) throw new RepoError(error);
      return parsearMiRuta(data);
    },
    async llegueMiDestino(): Promise<void> {
      const { error } = await ops().rpc('fn_llegue_mi_destino');
      if (error) throw new RepoError(error);
    },
    /** Migración 156: operaciones abiertas con su ruta (o sin ruta) y si hay un desvío. */
    async operaciones(): Promise<OperacionRuta[]> {
      const { data, error } = await ops().rpc('fn_rutas_operaciones');
      if (error) throw new RepoError(error);
      return parsearOperacionesRuta(data);
    },
    /** Migración 156: desvíos para la ventana emergente del usuario. */
    async avisosDesvio(): Promise<AvisoDesvio[]> {
      const { data, error } = await db.schema('tel').rpc('fn_avisos_desvio');
      if (error) throw new RepoError(error);
      return parsearAvisosDesvio(data);
    },
    async desvioVisto(id: number): Promise<void> {
      const { error } = await db.schema('tel').rpc('fn_desvio_visto', { p_desvio: id });
      if (error) throw new RepoError(error);
    },
    async quitar(servicioId: number, version: number): Promise<void> {
      const { error } = await ops().rpc('fn_quitar_ruta_operacion', { p_servicio: servicioId, p_version: version });
      if (error) throw new RepoError(error);
    },
  };
};
