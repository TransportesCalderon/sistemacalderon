import { RepoError, type Db } from '@/shared/repository/types';
import {
  parsearCuenta,
  parsearDocumentos,
  parsearGastosPorRevisar,
  parsearMiFondo,
  parsearMisCargas,
  parsearResumen,
  parsearSaldos,
  parsearSeguimiento,
  type FondoDeChofer,
} from '../domain/chofer.types';
import type { Entrega, GastoOficina, PosicionEntrada, SubirDocumento, SubirGasto } from '../domain/chofer.schemas';

/**
 * Módulo del chofer (migraciones 60 y 61). Todo pasa por funciones de la base, que deciden
 * quién puede qué (el chofer, solo lo suyo). El mensaje de la base se muestra tal cual.
 */
export const choferRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  const fin = () => db.schema('fin');
  const tel = () => db.schema('tel');
  const leer = async <T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> => {
    const { data, error } = await p;
    if (error) throw new RepoError(error as never);
    return data as T;
  };
  return {
    /* --------------------------- Mi carga --------------------------- */
    async misCargas() {
      return parsearMisCargas(await leer(ops().rpc('fn_mis_cargas')));
    },
    async documentos(servicioId: number) {
      return parsearDocumentos(await leer(ops().rpc('fn_documentos_operacion', { p_servicio: servicioId })));
    },
    async subirDocumento(d: SubirDocumento): Promise<number> {
      return leer(
        ops().rpc('fn_subir_documento_operacion', {
          p_servicio: d.servicioId,
          p_tipo: d.tipo,
          p_archivo: d.archivo,
          p_hash: d.hash,
          p_nombre_archivo: d.nombreArchivo,
          p_nota: d.nota,
          p_latitud: d.latitud,
          p_longitud: d.longitud,
        }),
      );
    },
    async quitarDocumento(documentoId: number): Promise<string> {
      return leer(ops().rpc('fn_quitar_documento_operacion', { p_documento: documentoId }));
    },
    async registrarPosicion(p: PosicionEntrada) {
      const r = (await leer(
        tel().rpc('fn_registrar_posicion_celular', {
          p_latitud: p.latitud,
          p_longitud: p.longitud,
          p_precision_m: p.precisionM,
          p_velocidad_kmh: p.velocidadKmh,
          p_rumbo: p.rumbo,
          p_ts: p.ts,
        }),
      )) as { guardada?: boolean; motivo?: string } | null;
      return { guardada: r?.guardada === true, motivo: r?.motivo ?? null };
    },
    async seguimiento(servicioId: number) {
      return parsearSeguimiento(await leer(ops().rpc('fn_seguimiento_operacion', { p_servicio: servicioId })));
    },
    async celularesEnVivo() {
      const filas = await leer(tel().rpc('fn_celulares_en_vivo', { p_horas: 12 }));
      return (filas ?? []).map((f) => ({
        choferId: f.chofer_id,
        chofer: f.chofer,
        numeroOperacion: f.numero_operacion,
        patente: f.patente,
        ts: f.ts,
        latitud: Number(f.latitud),
        longitud: Number(f.longitud),
        velocidadKmh: f.velocidad_kmh === null ? null : Number(f.velocidad_kmh),
      }));
    },

    /* --------------------------- Mis gastos --------------------------- */
    async miFondo() {
      return parsearMiFondo(await leer(fin().rpc('fn_mi_fondo')));
    },
    async subirGasto(g: SubirGasto): Promise<number> {
      return leer(
        fin().rpc('fn_subir_gasto', {
          p_categoria: g.categoria,
          p_moneda: g.moneda,
          p_importe: g.importe,
          p_fecha: g.fecha,
          p_comprobante: g.comprobante,
          p_hash: g.hash,
          p_nombre_archivo: g.nombreArchivo,
          p_detalle: g.detalle,
          p_lugar: g.lugar,
          p_latitud: g.latitud,
          p_longitud: g.longitud,
        }),
      );
    },
    async retirarGasto(gastoId: number) {
      return leer(fin().rpc('fn_retirar_gasto', { p_gasto: gastoId }));
    },

    /* --------------------------- Administración --------------------------- */
    async fondos(): Promise<FondoDeChofer[]> {
      const filas = await leer(fin().rpc('fn_fondos_choferes'));
      return (filas ?? []).map((f) => ({
        choferId: f.chofer_id,
        chofer: f.chofer,
        legajo: f.legajo,
        saldos: parsearSaldos(f.saldos),
        porRevisar: f.por_revisar,
        ultimoMovimiento: f.ultimo_movimiento,
        ultimoCierre: f.ultimo_cierre,
      }));
    },
    async cuenta(choferId: number) {
      return parsearCuenta(await leer(fin().rpc('fn_fondo_chofer', { p_chofer: choferId })));
    },
    async gastosPorRevisar() {
      return parsearGastosPorRevisar(await leer(fin().rpc('fn_gastos_por_revisar')));
    },
    async registrarEntrega(e: Entrega): Promise<number> {
      return e.tipo === 'entrega'
        ? leer(fin().rpc('fn_entregar_fondo', { p_chofer: e.choferId, p_moneda: e.moneda, p_importe: e.importe, p_fecha: e.fecha, p_detalle: e.detalle }))
        : leer(fin().rpc('fn_registrar_devolucion', { p_chofer: e.choferId, p_moneda: e.moneda, p_importe: e.importe, p_fecha: e.fecha, p_detalle: e.detalle }));
    },
    async cargarGasto(g: GastoOficina) {
      const r = (await leer(
        fin().rpc('fn_cargar_gasto_chofer', {
          p_chofer: g.choferId,
          p_categoria: g.categoria,
          p_moneda: g.moneda,
          p_importe: g.importe,
          p_fecha: g.fecha,
          p_detalle: g.detalle,
          p_comprobante: g.comprobante,
          p_hash: g.hash,
          p_nombre_archivo: g.nombreArchivo,
        }),
      )) as { aviso?: string | null } | null;
      return { aviso: r?.aviso ?? null };
    },
    async revisarGasto(gastoId: number, aprobar: boolean, motivo: string | null) {
      const r = (await leer(fin().rpc('fn_revisar_gasto', { p_gasto: gastoId, p_aprobar: aprobar, p_motivo: motivo }))) as {
        aviso?: string | null;
      } | null;
      return { aviso: r?.aviso ?? null };
    },
    async anularMovimiento(movimientoId: number, motivo: string) {
      await leer(fin().rpc('fn_anular_movimiento_fondo', { p_movimiento: movimientoId, p_motivo: motivo }));
    },
    async cerrarFondo(choferId: number, periodo: string) {
      await leer(fin().rpc('fn_cerrar_fondo', { p_chofer: choferId, p_periodo: periodo }));
    },
    async reabrirFondo(choferId: number, periodo: string, motivo: string) {
      await leer(fin().rpc('fn_reabrir_fondo', { p_chofer: choferId, p_periodo: periodo, p_motivo: motivo }));
    },
    async resumen(periodo: string | null) {
      return parsearResumen(await leer(fin().rpc('fn_resumen_liquidacion', { p_periodo: periodo })));
    },
    /** Período de liquidación de una fecha (con el día de corte de la base). */
    async periodoDe(fecha: string): Promise<string> {
      return leer(fin().rpc('fn_periodo_de', { p_fecha: fecha }));
    },
    async categorias() {
      return leer(fin().rpc('fn_categorias_gasto_chofer'));
    },
  };
};
