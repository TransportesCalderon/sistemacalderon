import { RepoError, type Db } from '@/shared/repository/types';
import { parsearPedidoCompra, parsearPedidosCompra, type PedidoCompra, type PedidoCompraFila } from '../domain/compras';

const ok = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new RepoError(r.error as never);
  return r.data;
};

export interface PedidoCompraEntrada {
  id: number | null;
  version: number | null;
  descripcion: string;
  detalle: string | null;
  camionId: number | null;
  urgente: boolean;
}

export interface CotizacionCompraEntrada {
  id: number | null;
  pedidoId: number;
  proveedorId: number;
  numeroProveedor: string | null;
  fecha: string;
  validaHasta: string | null;
  moneda: string;
  total: number;
  flete: number;
  entregaInmediata: boolean;
  entregaDias: number | null;
  pagoDias: number;
  garantia: string | null;
  observacion: string | null;
  archivoRuta: string | null;
  archivoNombre: string | null;
}

/** Migración 280 · Compras: la base valida todo, compara las cotizaciones y arma la orden de compra. */
export function comprasRepository(db: Db) {
  const fin = () => db.schema('fin');
  return {
    pedidos: async (todos: boolean): Promise<PedidoCompraFila[]> => parsearPedidosCompra(ok(await fin().rpc('fn_pedidos_compra', { p_todos: todos }))),
    pedido: async (id: number): Promise<PedidoCompra> => parsearPedidoCompra(ok(await fin().rpc('fn_pedido_compra', { p_id: id }))),
    guardarPedido: async (p: PedidoCompraEntrada): Promise<number> =>
      ok(
        await fin().rpc('fn_guardar_pedido_compra', {
          p_id: p.id,
          p_version: p.version,
          p_datos: { descripcion: p.descripcion, detalle: p.detalle, camion_id: p.camionId, urgente: p.urgente },
        }),
      ) as number,
    guardarCotizacion: async (c: CotizacionCompraEntrada): Promise<number> =>
      ok(
        await fin().rpc('fn_guardar_cotizacion_compra', {
          p_id: c.id,
          p_datos: {
            pedido_id: c.pedidoId,
            proveedor_id: c.proveedorId,
            numero_proveedor: c.numeroProveedor,
            fecha: c.fecha,
            valida_hasta: c.validaHasta,
            moneda: c.moneda,
            total: c.total,
            flete: c.flete,
            entrega_inmediata: c.entregaInmediata,
            entrega_dias: c.entregaDias,
            pago_dias: c.pagoDias,
            garantia: c.garantia,
            observacion: c.observacion,
            archivo_ruta: c.archivoRuta,
            archivo_nombre: c.archivoNombre,
          },
        }),
      ) as number,
    anularCotizacion: async (id: number, motivo: string) => {
      ok(await fin().rpc('fn_anular_cotizacion_compra', { p_id: id, p_motivo: motivo }));
    },
    elevar: async (pedidoId: number, nota: string | null) => {
      ok(await fin().rpc('fn_elevar_pedido_compra', { p_pedido: pedidoId, p_nota: nota }));
    },
    resolver: async (pedidoId: number, accion: 'aprobar' | 'devolver' | 'rechazar', cotizacionId: number | null, nota: string | null) =>
      ok(await fin().rpc('fn_resolver_pedido_compra', { p_pedido: pedidoId, p_accion: accion, p_cotizacion: cotizacionId, p_nota: nota })),
    anularPedido: async (pedidoId: number, motivo: string) => {
      ok(await fin().rpc('fn_anular_pedido_compra', { p_pedido: pedidoId, p_motivo: motivo }));
    },
  };
}
