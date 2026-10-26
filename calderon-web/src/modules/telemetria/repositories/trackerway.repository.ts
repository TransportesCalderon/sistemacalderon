import { RepoError, type Db } from '@/shared/repository/types';
import { parsearPanelTrackerway } from '../domain/trackerway.types';

/** Equipos GPS de Trackerway (migración 72). Todo lo valida la base; su mensaje se muestra tal cual. */
export const trackerwayRepository = (db: Db) => {
  const tel = () => db.schema('tel');
  return {
    async panel() {
      const { data, error } = await tel().rpc('fn_trackerway_panel');
      if (error) throw new RepoError(error);
      return parsearPanelTrackerway(data);
    },
    async buscar(): Promise<number> {
      const { data, error } = await tel().rpc('fn_trackerway_buscar');
      if (error) throw new RepoError(error);
      return Number((data as { equipos?: number } | null)?.equipos ?? 0);
    },
    async enlazar(imei: string, camionId: number | null) {
      const { error } = await tel().rpc('fn_trackerway_enlazar', { p_imei: imei, p_camion: camionId });
      if (error) throw new RepoError(error);
    },
    async importar(imei: string, importar: boolean) {
      const { error } = await tel().rpc('fn_trackerway_importar', { p_imei: imei, p_importar: importar });
      if (error) throw new RepoError(error);
    },
  };
};
