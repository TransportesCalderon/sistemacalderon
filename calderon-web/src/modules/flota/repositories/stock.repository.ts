import { RepoError, type Db } from '@/shared/repository/types';
import {
  parsearCuadre,
  parsearFacturasInsumos,
  parsearInsumosOt,
  parsearKardex,
  parsearStock,
  type Categoria,
  type Cuadre,
  type FacturaInsumos,
  type InsumosOt,
  type MovimientoKardex,
  type Stock,
  type Unidad,
} from '../domain/stock.types';

export interface DatosInsumo {
  id: number | null;
  codigo: string;
  nombre: string;
  unidad: Unidad;
  categoria: Categoria;
  stockMinimo: number;
  observacion: string | null;
  activo: boolean;
}
export interface RenglonCompra {
  insumoId: number;
  panolId: number;
  cantidad: number;
  neto: number;
}

/** Migración 216: stock de insumos. La base valida todo (roles, stock, importes); su mensaje se muestra tal cual. */
export const stockRepository = (db: Db) => {
  const mae = () => db.schema('mae');
  const ok = <T>(r: { data: T; error: unknown }): T => {
    if (r.error) throw new RepoError(r.error as ConstructorParameters<typeof RepoError>[0]);
    return r.data;
  };
  return {
    stock: async (): Promise<Stock> => parsearStock(ok(await mae().rpc('fn_stock_insumos'))),
    kardex: async (insumo: number, panol: number | null): Promise<MovimientoKardex[]> =>
      parsearKardex(ok(await mae().rpc('fn_kardex_insumo', { p_insumo: insumo, p_panol: panol, p_limite: 200 }))),
    facturas: async (soloPendientes: boolean): Promise<FacturaInsumos[]> =>
      parsearFacturasInsumos(ok(await mae().rpc('fn_facturas_insumos', { p_solo_pendientes: soloPendientes }))),
    insumosOt: async (ot: number): Promise<InsumosOt> => parsearInsumosOt(ok(await mae().rpc('fn_insumos_ot', { p_ot: ot }))),
    cuadre: async (): Promise<Cuadre> => parsearCuadre(ok(await mae().rpc('fn_cuadre_insumos'))),
    guardarPanol: async (id: number | null, nombre: string, ubicacion: string | null, activo: boolean): Promise<number> =>
      Number(ok(await mae().rpc('fn_guardar_panol', { p_id: id, p_nombre: nombre, p_ubicacion: ubicacion, p_activo: activo }))),
    guardarInsumo: async (d: DatosInsumo): Promise<number> =>
      Number(
        ok(
          await mae().rpc('fn_guardar_insumo', {
            p_id: d.id,
            p_codigo: d.codigo,
            p_nombre: d.nombre,
            p_unidad: d.unidad,
            p_categoria: d.categoria,
            p_stock_minimo: d.stockMinimo,
            p_observacion: d.observacion,
            p_activo: d.activo,
          }),
        ),
      ),
    ingreso: async (insumo: number, panol: number, cantidad: number, costo: number, motivo: string) =>
      void ok(await mae().rpc('fn_ingreso_insumo', { p_insumo: insumo, p_panol: panol, p_cantidad: cantidad, p_costo_unitario: costo, p_motivo: motivo })),
    compra: async (gasto: number, renglones: RenglonCompra[]) =>
      void ok(
        await mae().rpc('fn_ingreso_compra', {
          p_gasto: gasto,
          p_renglones: renglones.map((r) => ({ insumo_id: r.insumoId, panol_id: r.panolId, cantidad: r.cantidad, neto: r.neto })),
        }),
      ),
    consumir: async (ot: number, insumo: number, panol: number, cantidad: number) =>
      void ok(await mae().rpc('fn_consumir_insumo', { p_ot: ot, p_insumo: insumo, p_panol: panol, p_cantidad: cantidad })),
    devolver: async (consumo: number, cantidad: number) => void ok(await mae().rpc('fn_devolver_insumo', { p_consumo: consumo, p_cantidad: cantidad })),
    traspasar: async (insumo: number, desde: number, hasta: number, cantidad: number, motivo: string | null) =>
      void ok(await mae().rpc('fn_traspasar_insumo', { p_insumo: insumo, p_desde: desde, p_hasta: hasta, p_cantidad: cantidad, p_motivo: motivo })),
    ajustar: async (insumo: number, panol: number, contado: number, motivo: string, costo: number | null) =>
      void ok(await mae().rpc('fn_ajustar_insumo', { p_insumo: insumo, p_panol: panol, p_contado: contado, p_motivo: motivo, p_costo_unitario: costo })),
  };
};
