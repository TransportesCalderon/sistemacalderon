import { RepoError, rangoPagina, type Db, type Pagina } from '@/shared/repository/types';
import type { CamionId, CargaId, CierreViajeId, FechaISO } from '@/shared/types/dominio';
import { TAMANO_PAGINA_VIAJES, esSituacionViaje, type Viaje, type ViajeListaParams } from '../domain/viaje.types';

/** Viajes: lectura directa de fue.v_viaje (la vista es la verdad del sistema). */
export const viajeRepository = (db: Db) => ({
  async listar(p: ViajeListaParams): Promise<Pagina<Viaje>> {
    const [desde, hasta] = rangoPagina(p.pagina, TAMANO_PAGINA_VIAJES);
    let q = db
      .schema('fue')
      .from('v_viaje')
      .select('camion_id, patente, carga_salida_id, salida_ts, carga_llegada_id, llegada_ts, cierre_id, cierre_numero, situacion', { count: 'exact' });
    if (p.camionId !== undefined) q = q.eq('camion_id', p.camionId);
    if (p.situacion) q = q.eq('situacion', p.situacion);
    const { data, count, error } = await q.order('salida_ts', { ascending: false }).range(desde, hasta);
    if (error) throw new RepoError(error);
    return {
      filas: data.map((v) => ({
        camionId: v.camion_id as CamionId,
        patente: v.patente ?? '',
        cargaSalidaId: v.carga_salida_id as CargaId,
        salidaTs: v.salida_ts as FechaISO,
        cargaLlegadaId: v.carga_llegada_id as CargaId | null,
        llegadaTs: v.llegada_ts as FechaISO | null,
        cierreId: v.cierre_id as CierreViajeId | null,
        cierreNumero: v.cierre_numero,
        situacion: esSituacionViaje(v.situacion) ? v.situacion : 'sin_cierre',
      })),
      total: count,
    };
  },
});
