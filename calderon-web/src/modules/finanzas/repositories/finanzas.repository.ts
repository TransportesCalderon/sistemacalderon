import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/database.generated';
import {
  parsearAuxiliares,
  parsearCargas,
  parsearCombustible,
  parsearCuentasElegibles,
  parsearMayor,
  parsearPendientes,
  parsearTraza,
  parsearCartola,
  parsearCuentasDinero,
  parsearEstadoResultados,
  parsearFlujoCaja,
  parsearGasto,
  parsearGastos,
  parsearGastosFijos,
  parsearImportacion,
  parsearLibroDiario,
  parsearMovimientos,
  parsearPlan,
  parsearPorCobrar,
  parsearPorPagar,
  parsearTablero,
} from '../domain/finanzas.types';
import type {
  CrearDesdeLineaEntrada,
  CuentaContableEntrada,
  CuentaDineroEntrada,
  GastoEntrada,
  GastoFijoEntrada,
  ImportarCartolaEntrada,
  MedioPagoEntrada,
  MovimientoEntrada,
  ProveedorEntrada,
} from '../domain/finanzas.schemas';

export interface FiltroGastos {
  estado: string | null;
  desde: string | null;
  hasta: string | null;
  texto: string | null;
  cuentaId: number | null;
}

/** Finanzas (migración 73). Todo pasa por funciones de la base; su mensaje se muestra tal cual. */
export const finanzasRepository = (db: Db) => {
  const fin = () => db.schema('fin');
  const leer = async <T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> => {
    const { data, error } = await p;
    if (error) throw new RepoError(error as never);
    return data as T;
  };
  return {
    // Lecturas
    async tablero() {
      return parsearTablero(await leer(fin().rpc('fn_tablero_finanzas')));
    },
    async plan() {
      return parsearPlan(await leer(fin().rpc('fn_plan_cuentas')));
    },
    async cuentasDinero() {
      return parsearCuentasDinero(await leer(fin().rpc('fn_cuentas_dinero')));
    },
    async gastos(f: FiltroGastos) {
      return parsearGastos(
        await leer(fin().rpc('fn_gastos', { p_filtro: { estado: f.estado, desde: f.desde, hasta: f.hasta, texto: f.texto, cuenta_id: f.cuentaId } as Json })),
      );
    },
    async gasto(id: number) {
      return parsearGasto(await leer(fin().rpc('fn_gasto', { p_id: id })));
    },
    async gastosFijos() {
      return parsearGastosFijos(await leer(fin().rpc('fn_gastos_fijos')));
    },
    async movimientos(cuenta: number | null, desde: string | null, hasta: string | null) {
      return parsearMovimientos(await leer(fin().rpc('fn_movimientos', { p_cuenta: cuenta, p_desde: desde, p_hasta: hasta })));
    },
    async porCobrar() {
      return parsearPorCobrar(await leer(fin().rpc('fn_por_cobrar')));
    },
    async porPagar() {
      return parsearPorPagar(await leer(fin().rpc('fn_por_pagar')));
    },
    async cartola(cuenta: number, soloPendientes: boolean) {
      return parsearCartola(await leer(fin().rpc('fn_cartola', { p_cuenta: cuenta, p_solo_pendientes: soloPendientes })));
    },
    async estadoResultados(desde: string, hasta: string) {
      return parsearEstadoResultados(await leer(fin().rpc('fn_estado_resultados', { p_desde: desde, p_hasta: hasta })));
    },
    async flujoCaja(desde: string, hasta: string) {
      return parsearFlujoCaja(await leer(fin().rpc('fn_flujo_caja', { p_desde: desde, p_hasta: hasta })));
    },
    /** Camiones para elegir en un gasto (opcional). */
    async camiones(): Promise<{ id: number; patente: string; codigo: string }[]> {
      const { data, error } = await db.schema('mae').from('camion').select('id, patente, codigo_interno').is('eliminado_en', null).order('patente');
      if (error) throw new RepoError(error);
      return (data ?? []).map((c) => ({ id: c.id, patente: c.patente, codigo: c.codigo_interno }));
    },
    async libroDiario(desde: string, hasta: string) {
      return parsearLibroDiario(await leer(fin().rpc('fn_libro_diario', { p_desde: desde, p_hasta: hasta })));
    },

    // Escrituras
    async guardarCuentaContable(c: CuentaContableEntrada): Promise<number> {
      return leer(fin().rpc('fn_guardar_cuenta_contable', { p_id: c.id, p_datos: { codigo: c.codigo, nombre: c.nombre, activa: c.activa } as Json }));
    },
    async guardarProveedor(p: ProveedorEntrada): Promise<number> {
      return leer(fin().rpc('fn_guardar_proveedor_rapido', { p_razon_social: p.razonSocial, p_rut: p.rut }));
    },
    async guardarCuentaDinero(c: CuentaDineroEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_guardar_cuenta_dinero', {
          p_id: c.id,
          p_datos: {
            nombre: c.nombre,
            tipo: c.tipo,
            banco: c.banco,
            numero: c.numero,
            moneda: c.moneda,
            saldo_inicial: c.saldoInicial ?? 0,
            saldo_inicial_fecha: c.saldoInicialFecha,
            activa: c.activa,
          } as Json,
        }),
      );
    },
    async guardarGasto(g: GastoEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_guardar_gasto', {
          p_id: g.id,
          p_version: g.version,
          p_datos: {
            fecha: g.fecha,
            vence: g.vence,
            proveedor_id: g.proveedorId,
            proveedor_nombre: g.proveedorNombre,
            tipo_documento: g.tipoDocumento,
            numero_documento: g.numeroDocumento,
            descripcion: g.descripcion,
            cuenta_id: g.cuentaId,
            camion_id: g.camionId,
            moneda: g.moneda,
            neto: g.neto,
            exento: g.exento,
            total: g.total,
          } as Json,
        }),
      );
    },
    async anularGasto(id: number, motivo: string) {
      await leer(fin().rpc('fn_anular_gasto', { p_id: id, p_motivo: motivo }));
    },
    async guardarGastoFijo(f: GastoFijoEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_guardar_gasto_fijo', {
          p_id: f.id,
          p_datos: {
            nombre: f.nombre,
            proveedor_id: f.proveedorId,
            cuenta_id: f.cuentaId,
            tipo_documento: f.tipoDocumento,
            moneda: f.moneda,
            monto: f.monto,
            dia_vence: f.diaVence,
            camion_id: f.camionId,
            desde: f.desde,
            hasta: f.hasta,
            activo: f.activo,
            observacion: f.observacion,
          } as Json,
        }),
      );
    },
    async generarGastosFijos(periodo: string): Promise<number> {
      return leer(fin().rpc('fn_generar_gastos_fijos', { p_periodo: periodo }));
    },
    async registrarMovimiento(m: MovimientoEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_registrar_movimiento', {
          p_datos: {
            tipo: m.tipo,
            fecha: m.fecha,
            cuenta_dinero_id: m.cuentaDineroId,
            monto: m.monto,
            factura_id: m.facturaId,
            gasto_id: m.gastoId,
            cuenta_id: m.cuentaId,
            destino_id: m.destinoId,
            monto_destino: m.montoDestino,
            monto_documento: m.montoDocumento,
            descripcion: m.descripcion,
          } as Json,
        }),
      );
    },
    async anularMovimiento(id: number, motivo: string) {
      await leer(fin().rpc('fn_anular_movimiento', { p_id: id, p_motivo: motivo }));
    },
    async importarCartola(c: ImportarCartolaEntrada) {
      return parsearImportacion(await leer(fin().rpc('fn_importar_cartola', { p_cuenta: c.cuentaId, p_filas: c.filas as Json })));
    },
    async conciliar(linea: number, movimiento: number) {
      await leer(fin().rpc('fn_conciliar', { p_linea: linea, p_movimiento: movimiento }));
    },
    async desconciliar(linea: number) {
      await leer(fin().rpc('fn_desconciliar', { p_linea: linea }));
    },
    async ignorarLinea(linea: number, ignorar: boolean) {
      await leer(fin().rpc('fn_ignorar_linea', { p_linea: linea, p_ignorar: ignorar }));
    },
    async crearDesdeLinea(c: CrearDesdeLineaEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_crear_desde_linea', {
          p_linea: c.lineaId,
          p_datos: {
            tipo: c.tipo,
            factura_id: c.facturaId,
            gasto_id: c.gastoId,
            cuenta_id: c.cuentaId,
            destino_id: c.destinoId,
            monto_destino: c.montoDestino,
            descripcion: c.descripcion,
          } as Json,
        }),
      );
    },
    // Migración 74
    async cuentasParaElegir() {
      return parsearCuentasElegibles(await leer(fin().rpc('fn_cuentas_para_elegir')));
    },
    async mayor(cuenta: number, desde: string, hasta: string, terceroTipo: string | null, terceroId: number | null) {
      return parsearMayor(
        await leer(fin().rpc('fn_mayor', { p_cuenta: cuenta, p_desde: desde, p_hasta: hasta, p_tercero_tipo: terceroTipo, p_tercero_id: terceroId })),
      );
    },
    async auxiliares(hasta: string | null) {
      return parsearAuxiliares(await leer(fin().rpc('fn_auxiliares', { p_hasta: hasta })));
    },
    async traza(origen: string, id: number) {
      return parsearTraza(await leer(fin().rpc('fn_traza', { p_origen: origen, p_id: id })));
    },
    async combustible() {
      return parsearCombustible(await leer(fin().rpc('fn_combustible_finanzas')));
    },
    async cargasPorFacturar(proveedor: number, gasto: number | null) {
      return parsearCargas(await leer(fin().rpc('fn_cargas_por_facturar', { p_proveedor: proveedor, p_gasto: gasto })));
    },
    async pendientes() {
      return parsearPendientes(await leer(fin().rpc('fn_pendientes_contables')));
    },
    async guardarMedioPago(m: MedioPagoEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_guardar_medio_pago', {
          p_id: m.id,
          p_datos: { nombre: m.nombre, medio: m.medio, tipo: m.tipo, proveedor_id: m.proveedorId, cuenta_dinero_id: m.cuentaDineroId, activo: m.activo } as Json,
        }),
      );
    },
    async vincularCargas(gasto: number, cargas: number[]): Promise<number> {
      return leer(fin().rpc('fn_vincular_cargas', { p_gasto: gasto, p_cargas: cargas }));
    },
    async recontabilizar() {
      return leer(fin().rpc('fn_recontabilizar_todo'));
    },
  };
};
