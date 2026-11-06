import { RepoError, type Db } from '@/shared/repository/types';
import { parsearDatosSalida, parsearLibro, type DatosSalida, type LibroSalidas } from '../domain/salidas.types';

export interface GuardarSalidaDatos {
  id: number | null;
  camionId: number;
  fecha: string;
  hora: string | null;
  choferId: number | null;
  semiId: number | null;
  gensetId: number | null;
  producto: string | null;
  destino: string | null;
  observacion: string | null;
}

/** Migración 196: libro de salidas de la base. Todo lo decide la base; su mensaje se muestra tal cual. */
export const salidasRepository = (db: Db) => ({
  async libro(desde: string, hasta: string): Promise<LibroSalidas> {
    const { data, error } = await db.schema('ops').rpc('fn_libro_salidas', { p_desde: desde, p_hasta: hasta });
    if (error) throw new RepoError(error);
    return parsearLibro(data);
  },
  async datos(camionId: number): Promise<DatosSalida> {
    const { data, error } = await db.schema('ops').rpc('fn_datos_salida', { p_camion: camionId });
    if (error) throw new RepoError(error);
    return parsearDatosSalida(data);
  },
  async guardar(d: GuardarSalidaDatos): Promise<number> {
    const { data, error } = await db.schema('ops').rpc('fn_guardar_salida', {
      p_id: d.id,
      p_camion: d.camionId,
      p_fecha: d.fecha,
      p_hora: d.hora,
      p_chofer: d.choferId,
      p_semi: d.semiId,
      p_genset: d.gensetId,
      p_producto: d.producto,
      p_destino: d.destino,
      p_observacion: d.observacion,
    });
    if (error) throw new RepoError(error);
    return Number(data);
  },
  async descartar(id: number, motivo: string): Promise<void> {
    const { error } = await db.schema('ops').rpc('fn_descartar_salida', { p_id: id, p_motivo: motivo });
    if (error) throw new RepoError(error);
  },
});
