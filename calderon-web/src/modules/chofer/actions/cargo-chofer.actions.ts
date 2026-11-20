'use server';

import { createAction } from '@/server/actions/create-action';
import { cargoChoferSchema, terminarCargoSchema } from '../domain/cargo-chofer';

/** Migración 289 · Cargos al chofer en cuotas. La base decide quién puede (RRHH, Finanzas, Gerencia, TI) y valida todo. */
export const registrarCargoChofer = createAction({
  permiso: 'rrhh.fondos:editar',
  schema: cargoChoferSchema,
  handler: async (d, { db }) => {
    const { data, error } = await db.schema('fin').rpc('fn_registrar_cargo_chofer', {
      p_datos: {
        chofer_id: d.choferId,
        concepto: d.concepto,
        fecha: d.fecha,
        moneda: d.moneda,
        total: d.total,
        cuotas: d.cuotas,
        desde: `${d.desde}-01`,
        gasto: d.gasto,
        observacion: d.observacion,
      },
    });
    if (error) throw error;
    return { numero: String((data as { numero?: string } | null)?.numero ?? '') };
  },
});

export const terminarCargoChofer = createAction({
  permiso: 'rrhh.fondos:editar',
  schema: terminarCargoSchema,
  handler: async (d, { db }) => {
    const { data, error } = await db.schema('fin').rpc('fn_terminar_cargo_chofer', { p_id: d.id, p_motivo: d.motivo });
    if (error) throw error;
    return { estado: String(data ?? '') };
  },
});
