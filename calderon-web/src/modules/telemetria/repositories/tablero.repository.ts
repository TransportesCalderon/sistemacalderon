import type { Json } from '@/shared/types/database.generated';
import { RepoError, type Db } from '@/shared/repository/types';
import {
  parsearAvisos,
  parsearCombinado,
  parsearContexto,
  parsearSugerido,
  parsearTableros,
  parsearInterpretacion,
  parsearPendientesTablero,
  parsearTablerosCarga,
  type DatosTablero,
} from '../domain/tablero.types';

/** Tablero del camión, avisos y litros sugeridos (migraciones 88 y 89). Todo lo decide la base. */
export const tableroRepository = (db: Db) => {
  const tel = () => db.schema('tel');
  const fue = () => db.schema('fue');
  return {
    async contexto() {
      const { data, error } = await tel().rpc('fn_tablero_contexto');
      if (error) throw new RepoError(error);
      return parsearContexto(data);
    },
    async lista(camionId: number | null, dias = 60) {
      const { data, error } = await tel().rpc('fn_tableros', { p_camion: camionId, p_dias: dias });
      if (error) throw new RepoError(error);
      return parsearTableros(data);
    },
    async combinar(lecturas: number[], camionId: number) {
      const { data, error } = await tel().rpc('fn_tablero_combinar', { p_lecturas: lecturas, p_camion: camionId });
      if (error) throw new RepoError(error);
      return parsearCombinado(data);
    },
    async guardar(d: { camionId: number; datos: DatosTablero; lecturas: number[]; fotos: { ruta: string; hash: string }[] }) {
      const { data, error } = await tel().rpc('fn_guardar_tablero', {
        p_camion: d.camionId,
        p_datos: d.datos as Json,
        p_lecturas: d.lecturas,
        p_fotos: d.fotos as Json,
      });
      if (error) throw new RepoError(error);
      return data;
    },
    /** Migración 224: fotos de una carga (llenado de corte) con su interpretación. */
    async deCarga(cargaId: number) {
      const { data, error } = await tel().rpc('fn_tableros_carga', { p_carga: cargaId });
      if (error) throw new RepoError(error);
      return parsearTablerosCarga(data);
    },
    async guardarDeCarga(d: { cargaId: number; datos: DatosTablero; lecturas: number[]; fotos: { ruta: string; hash: string }[] }) {
      const { data, error } = await tel().rpc('fn_guardar_tablero_carga', {
        p_carga: d.cargaId,
        p_datos: d.datos as Json,
        p_lecturas: d.lecturas,
        p_fotos: d.fotos as Json,
      });
      if (error) throw new RepoError(error);
      const x = (data ?? {}) as { id?: number; interpretacion?: unknown };
      return { id: Number(x.id ?? 0), interpretacion: parsearInterpretacion(x.interpretacion) };
    },
    async pendientesChofer() {
      const { data, error } = await tel().rpc('fn_tablero_pendiente_chofer');
      if (error) throw new RepoError(error);
      return parsearPendientesTablero(data);
    },
    async anular(id: number) {
      const { error } = await tel().rpc('fn_anular_tablero', { p_id: id });
      if (error) throw new RepoError(error);
    },
    async sugeridos(camionId: number, hasta: string | null) {
      const { data, error } = await fue().rpc('fn_litros_sugeridos', { p_camion: camionId, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return parsearSugerido(data);
    },
    async misAvisos() {
      const { data, error } = await fue().rpc('fn_mis_avisos_carga');
      if (error) throw new RepoError(error);
      return parsearAvisos(data);
    },
    async avisoVisto(id: number) {
      const { error } = await fue().rpc('fn_aviso_carga_visto', { p_id: id });
      if (error) throw new RepoError(error);
    },
    async avisos(horas = 12) {
      const { data, error } = await fue().rpc('fn_avisos_carga', { p_horas: horas });
      if (error) throw new RepoError(error);
      return parsearAvisos(data);
    },
  };
};
