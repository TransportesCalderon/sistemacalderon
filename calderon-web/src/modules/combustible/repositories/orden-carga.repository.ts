import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/db';
import {
  parsearCreada,
  parsearGensetsOrden,
  parsearPorRegistrar,
  type PorRegistrar,
  parsearPreparadoGenset,
  type GensetOpcion,
  type PreparadoGenset,
  parsearEstadoMail,
  parsearMisOrdenes,
  parsearOrdenPublica,
  parsearOrdenes,
  parsearPreparado,
  parsearSolicitudes,
  parsearOpcionesCargaTarjeta,
  parsearCargaTarjetaInformada,
  parsearVencidasSinTicket,
  type VencidasSinTicket,
  type OpcionesCargaTarjeta,
  type CargaTarjetaInformada,
  type SolicitudCarga,
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

/** Códigos con los que PostgREST o Postgres dicen que la función todavía no existe (base sin el cambio 360). */
const FUNCION_INEXISTENTE = new Set(['PGRST202', '42883']);

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
    // Migración 259: solicitudes de carga pedidas desde Seguimiento de viaje
    solicitudes: async (): Promise<SolicitudCarga[]> => parsearSolicitudes(ok(await fue().rpc('fn_solicitudes_carga'))),
    /** Sin `cambios` aprueba lo pedido; con `cambios` (Editar) aprueba lo que quedó en el formulario. */
    aprobarSolicitud: async (
      id: number,
      cambios?: { estacionId: number | null; detalle: DetalleOrden | null; choferId: number | null; observacion: string | null } | null,
    ): Promise<CreadaOrden> =>
      parsearCreada(
        ok(
          await fue().rpc('fn_aprobar_solicitud_carga', {
            p_id: id,
            ...(cambios
              ? {
                  p_estacion: cambios.estacionId,
                  p_detalle: cambios.detalle as unknown as Json,
                  p_chofer: cambios.choferId,
                  p_observacion: cambios.observacion,
                }
              : {}),
          }),
        ),
      ),
    rechazarSolicitud: async (id: number, motivo: string) => void ok(await fue().rpc('fn_rechazar_solicitud_carga', { p_id: id, p_motivo: motivo })),
    // Migración 253: cargas de órdenes terminadas, para dar el OK
    porRegistrar: async (): Promise<PorRegistrar[]> => parsearPorRegistrar(ok(await fue().rpc('fn_ordenes_por_registrar'))),
    // Cambio 360: órdenes de Chile vencidas sin ticket (null si la base todavía no tiene el cambio)
    vencidasSinTicket: async (): Promise<VencidasSinTicket | null> => {
      const r = await fue().rpc('fn_ordenes_vencidas_sin_ticket');
      if (r.error && FUNCION_INEXISTENTE.has(r.error.code)) return null;
      return parsearVencidasSinTicket(ok(r));
    },
    registrarCarga: async (ordenId: number, iniciaViaje: boolean, ajustes: Record<string, unknown>) =>
      ok(await fue().rpc('fn_registrar_carga_orden', { p_orden: ordenId, p_inicia_viaje: iniciaViaje, p_ajustes: ajustes as Json })) as { carga_id: number },
    // Migración 252: órdenes para gensets
    gensets: async (): Promise<GensetOpcion[]> => parsearGensetsOrden(ok(await fue().rpc('fn_gensets_para_orden'))),
    prepararGenset: async (gensetId: number, estacionId: number | null): Promise<PreparadoGenset> =>
      parsearPreparadoGenset(ok(await fue().rpc('fn_preparar_orden_genset', { p_genset: gensetId, p_estacion: estacionId }))),
    crearGenset: async (d: {
      gensetId: number;
      estacionId: number | null;
      modo: 'lleno' | 'litros';
      litros: number | null;
      choferId: number | null;
      observacion: string | null;
      medioPago?: 'tarjeta' | 'transferencia' | null;
    }) =>
      parsearCreada(
        ok(
          await fue().rpc('fn_crear_orden_genset', {
            p_genset: d.gensetId,
            p_estacion: d.estacionId as number,
            p_modo: d.modo,
            p_litros: d.litros,
            p_chofer: d.choferId,
            p_observacion: d.observacion,
            // Migración 357: solo se manda en Chile (con una base anterior la función no lo conoce)
            ...(d.medioPago ? { p_medio_pago: d.medioPago } : {}),
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
    // Cambio 360: el chofer avisa que no cargó con una orden de Chile vencida sin ticket (va por «ops»)
    noCargue: async (id: number) => ok(await db.schema('ops').rpc('fn_no_cargue_orden', { p_id: id })) as { numero: string },
    // Migración 304: Chile, la carga con tarjeta de flota que avisa el chofer (va por «ops», como las del chofer)
    opcionesCargaTarjeta: async (): Promise<OpcionesCargaTarjeta> =>
      parsearOpcionesCargaTarjeta(ok(await db.schema('ops').rpc('fn_opciones_carga_tarjeta'))),
    informarCargaTarjeta: async (d: {
      camionId: number | null;
      estacionId: number | null;
      lleno: boolean | null;
      fotos: { ruta: string; hash: string }[];
      lecturas: number[];
      litros: number | null;
    }): Promise<CargaTarjetaInformada> =>
      parsearCargaTarjetaInformada(
        ok(
          await db.schema('ops').rpc('fn_informar_carga_tarjeta', {
            p_camion: d.camionId as number,
            p_estacion: d.estacionId as number,
            p_lleno: d.lleno as boolean,
            p_fotos: d.fotos as unknown as Json,
            p_lecturas: d.lecturas,
            p_litros: d.litros,
          }),
        ),
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
