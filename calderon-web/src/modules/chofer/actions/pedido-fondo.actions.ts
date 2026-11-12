'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';

/**
 * Migración 256 · Pedidos de FF Chofer (el dinero del viaje). Toda regla está en la base: quién pide (Operaciones,
 * Telemetría), quién aprueba (marca de TI), el bloqueo por cierres sin aprobar o sin firmar y quién deposita.
 */
const PERMISO = 'rrhh.fondos:ver' as const;

export const pedirFondo = createAction({
  permiso: PERMISO,
  schema: z.object({
    choferId: z.number().int().positive({ message: 'Elegí el chofer.' }),
    moneda: z.string().trim().length(3, 'Elegí la moneda.'),
    importe: z.number({ message: 'Escribí el importe.' }).positive('El importe tiene que ser mayor que cero.'),
    detalle: z.string().trim().max(500, 'Máximo 500 caracteres.'),
  }),
  handler: async (d, { db }) => {
    const { data, error } = await db
      .schema('fin')
      .rpc('fn_pedir_fondo', { p_chofer: d.choferId, p_moneda: d.moneda, p_importe: d.importe, p_detalle: d.detalle });
    if (error) throw error;
    const r = data as { numero?: string; cierres?: unknown[] } | null;
    return { numero: String(r?.numero ?? ''), cierresPendientes: Array.isArray(r?.cierres) ? r.cierres.length : 0 };
  },
});

export const resolverPedidoFondo = createAction({
  permiso: PERMISO,
  schema: z.object({ pedidoId: z.number().int().positive(), aprobar: z.boolean(), motivo: z.string().max(500).nullable() }),
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_resolver_pedido_fondo', { p_pedido: d.pedidoId, p_aprobar: d.aprobar, p_motivo: d.motivo });
    if (error) throw error;
    return null;
  },
});

export const depositarPedidoFondo = createAction({
  permiso: PERMISO,
  schema: z.object({
    pedidoId: z.number().int().positive(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha del depósito.'),
    ruta: z.string().max(300).nullable(),
    nombre: z.string().max(200).nullable(),
  }),
  handler: async (d, { db }) => {
    const { error } = await db
      .schema('fin')
      .rpc('fn_depositar_pedido_fondo', { p_pedido: d.pedidoId, p_fecha: d.fecha, p_ruta: d.ruta, p_nombre: d.nombre });
    if (error) throw error;
    return null;
  },
});

export const anularPedidoFondo = createAction({
  permiso: PERMISO,
  schema: z.object({ pedidoId: z.number().int().positive(), motivo: z.string().max(500) }),
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_anular_pedido_fondo', { p_pedido: d.pedidoId, p_motivo: d.motivo });
    if (error) throw error;
    return null;
  },
});
