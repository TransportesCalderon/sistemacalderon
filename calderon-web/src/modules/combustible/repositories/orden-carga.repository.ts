import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/db';
import {
  parsearCreada,
  parsearGensetsOrden,
  parsearPreparadoGenset,
  type GensetOpcion,
  type PreparadoGenset,
  parsearEstadoMail,
  parsearMisOrdenes,
  parsearOrdenPublica,
  parsearOrdenes,
  parsearPreparado,
  type CreadaOrden,
  type DetalleOrden,
  type EstadoMail,
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
    crear: async (d: { camionId: number | null; estacionId: number | null; modo: ModoOrden; litros: number | null; importe: number | null; moneda: string | null; choferId: number | null; observacion: string | null; detalle?: DetalleOrden | null }): Promise<CreadaOrden> =>
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
            ...(d.detalle ? { p_detalle: d.detalle as unknown as Json } : {}),
          }),
        ),
      ),
    anular: async (id: number, motivo: string) => void ok(await fue().rpc('fn_anular_orden_carga', { p_id: id, p_motivo: motivo })),
    revisar: async (id: number) => void ok(await fue().rpc('fn_revisar_orden_carga', { p_id: id })),
    // Migración 243: las del chofer van por «ops» (el usuario del chofer no puede usar el esquema «fue»)
    misOrdenes: async (): Promise<MiOrden[]> => parsearMisOrdenes(ok(await db.schema('ops').rpc('fn_mis_ordenes_carga'))),
    // Migración 252: órdenes para gensets
    gensets: async (): Promise<GensetOpcion[]> => parsearGensetsOrden(ok(await fue().rpc('fn_gensets_para_orden'))),
    prepararGenset: async (gensetId: number, estacionId: number | null): Promise<PreparadoGenset> =>
      parsearPreparadoGenset(ok(await fue().rpc('fn_preparar_orden_genset', { p_genset: gensetId, p_estacion: estacionId }))),
    crearGenset: async (d: { gensetId: number; estacionId: number | null; modo: 'lleno' | 'litros'; litros: number | null; choferId: number | null; observacion: string | null }) =>
      parsearCreada(
        ok(
          await fue().rpc('fn_crear_orden_genset', {
            p_genset: d.gensetId,
            p_estacion: d.estacionId as number,
            p_modo: d.modo,
            p_litros: d.litros,
            p_chofer: d.choferId,
            p_observacion: d.observacion,
          }),
        ),
      ),
    terminar: async (id: number, fotos: { ruta: string; hash: string }[], lecturas: number[], litros: number | null, horometro: number | null = null) =>
      ok(
        await db.schema('ops').rpc('fn_terminar_orden_carga', {
          p_id: id,
          p_fotos: fotos as unknown as Json,
          p_lecturas: lecturas,
          p_litros: litros,
          ...(horometro !== null ? { p_horometro: horometro } : {}),
        }),
      ),
    // Migración 236: la cuenta de mail (Hotmail con permiso de Microsoft)
    estadoMail: async (): Promise<EstadoMail> => parsearEstadoMail(ok(await db.schema('ops').rpc('fn_estado_mail'))),
    urlPermisoMail: async (volver: string): Promise<string> => String(ok(await db.schema('ops').rpc('fn_mail_url_permiso', { p_volver: volver }))),
    conectarMail: async (codigo: string, estado: string, volver: string) =>
      ok(await db.schema('ops').rpc('fn_mail_conectar', { p_codigo: codigo, p_estado: estado, p_volver: volver })) as { ok: boolean; cuenta: string | null },
    probarMail: async () => ok(await db.schema('ops').rpc('fn_mail_probar')) as { enviado: boolean; error: string | null; para: string },
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
