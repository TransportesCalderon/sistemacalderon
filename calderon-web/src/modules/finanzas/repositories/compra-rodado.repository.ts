import { RepoError, type Db } from '@/shared/repository/types';
import { parsearComprasRodados, type ComprasRodados } from '../domain/compra-rodado';

const ok = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new RepoError(r.error as never);
  return r.data;
};

export interface CompraRodadoEntrada {
  camionId: number | null;
  semiId: number | null;
  /** Camioneta, auto u otro vehículo que no es de la flota: qué vehículo es. */
  descripcion: string | null;
  fecha: string;
  proveedorId: number | null;
  valorNeto: number;
  iva: number;
  pie: number;
  piePagadoAntes: boolean;
  documentos: number;
  montoDocumento: number;
  primerVencimiento: string | null;
  documentosPrevios: number;
  vidaUtilMeses: number;
  valorResidual: number;
  observacion: string | null;
}

/** Finanzas › Compra de vehículos con documentos: la base arma el activo, la deuda y la depreciación, y valida todo. */
export function compraRodadoRepository(db: Db) {
  const fin = () => db.schema('fin');
  return {
    listar: async (): Promise<ComprasRodados> => parsearComprasRodados(ok(await fin().rpc('fn_compras_rodados'))),
    registrar: async (c: CompraRodadoEntrada): Promise<number> =>
      ok(
        await fin().rpc('fn_registrar_compra_rodado', {
          p_datos: {
            camion_id: c.camionId,
            semi_id: c.semiId,
            descripcion: c.descripcion,
            fecha: c.fecha,
            proveedor_id: c.proveedorId,
            valor_neto: c.valorNeto,
            iva: c.iva,
            pie: c.pie,
            pie_pagado_antes: c.piePagadoAntes,
            documentos: c.documentos,
            monto_documento: c.montoDocumento,
            primer_vencimiento: c.primerVencimiento,
            documentos_previos: c.documentosPrevios,
            vida_util_meses: c.vidaUtilMeses,
            valor_residual: c.valorResidual,
            observacion: c.observacion,
          },
        }),
      ) as number,
    anular: async (id: number, motivo: string) => {
      ok(await fin().rpc('fn_anular_compra_rodado', { p_id: id, p_motivo: motivo }));
    },
  };
}
