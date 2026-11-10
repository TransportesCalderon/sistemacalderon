import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/db';
import {
  parsearCreada,
  parsearMisOrdenes,
  parsearOrdenPublica,
  parsearOrdenes,
  parsearPreparado,
  type CreadaOrden,
  type MiOrden,
  type ModoOrden,
  type OrdenCarga,
  type OrdenPublica,
  type PreparadoOrden,
} from '../domain/orden-carga.types';

const ok = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new RepoError(r.error as never);
  return r.data;
};

/** Migración 234 · Órdenes de carga de combustible. */
export const ordenCargaRepository = (db: Db) => {
  const fue = () => db.schema('fue');
  return {
    preparar: async (camionId: number, estacionId: number | null): Promise<PreparadoOrden> =>
      parsearPreparado(ok(await fue().rpc('fn_preparar_orden_carga', { p_camion: camionId, p_estacion: estacionId }))),
    lista: async (dias: number): Promise<OrdenCarga[]> => parsearOrdenes(ok(await fue().rpc('fn_ordenes_carga', { p_dias: dias }))),
    crear: async (d: { camionId: number | null; estacionId: number | null; modo: ModoOrden; litros: number | null; importe: number | null; moneda: string | null; choferId: number | null; observacion: string | null }): Promise<CreadaOrden> =>
      parsearCreada(
        ok(
          await fue().rpc('fn_crear_orden_carga', {
            p_camion: d.camionId as number,
            p_estacion: d.estacionId as number,
            p_modo: d.modo,
            p_litros: d.litros,
            p_importe: d.importe,
            p_moneda: d.moneda,
            p_chofer: d.choferId,
            p_observacion: d.observacion,
          }),
        ),
      ),
    anular: async (id: number, motivo: string) => void ok(await fue().rpc('fn_anular_orden_carga', { p_id: id, p_motivo: motivo })),
    revisar: async (id: number) => void ok(await fue().rpc('fn_revisar_orden_carga', { p_id: id })),
    misOrdenes: async (): Promise<MiOrden[]> => parsearMisOrdenes(ok(await fue().rpc('fn_mis_ordenes_carga'))),
    terminar: async (id: number, fotos: { ruta: string; hash: string }[], lecturas: number[], litros: number | null) =>
      ok(await fue().rpc('fn_terminar_orden_carga', { p_id: id, p_fotos: fotos as unknown as Json, p_lecturas: lecturas, p_litros: litros })),
    correoEstacion: async (estacionId: number, correo: string) =>
      void ok(await db.schema('mae').rpc('fn_estacion_correo', { p_estacion: estacionId, p_correo: correo })),
    // Playero, sin usuario
    publica: async (token: string): Promise<OrdenPublica> => parsearOrdenPublica(ok(await db.schema('public').rpc('fn_orden_carga_qr', { p_token: token }))),
    autorizar: async (token: string, palabra: string, dispositivo: string) =>
      ok(await db.schema('public').rpc('fn_orden_carga_autorizar', { p_token: token, p_palabra: palabra, p_dispositivo: dispositivo })) as {
        ok: boolean;
        mensaje: string;
        autorizado?: string;
      },
  };
};
