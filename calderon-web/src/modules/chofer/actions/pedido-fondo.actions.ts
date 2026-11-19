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

// Migración 278 · El chofer pide desde su perfil, Operaciones revisa y Gerencia autoriza y deja pagado
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.');
const medio = z.enum(['transferencia', 'deposito', 'efectivo'], 'Elegí el medio de pago.');
const pago = {
  cuentaId: z.number({ message: 'Elegí de qué cuenta sale la plata.' }).int().positive('Elegí de qué cuenta sale la plata.'),
  medio,
  fecha,
  montoCuenta: z.number().positive('El monto que salió de la cuenta tiene que ser mayor que cero.').nullable(),
  ruta: z.string().max(300).nullable(),
  nombre: z.string().max(200).nullable(),
};

export const pedirFondoChofer = createAction({
  permiso: 'chofer.mis_gastos:editar',
  schema: z.object({
    moneda: z.string().trim().length(3, 'Elegí la moneda.'),
    importe: z.number({ message: 'Escribí el importe.' }).positive('El importe tiene que ser mayor que cero.'),
    detalle: z.string().trim().max(500, 'Máximo 500 caracteres.'),
  }),
  handler: async (d, { db }) => {
    const { data, error } = await db.schema('fin').rpc('fn_pedir_fondo_chofer', { p_moneda: d.moneda, p_importe: d.importe, p_detalle: d.detalle });
    if (error) throw error;
    return { numero: String((data as { numero?: string } | null)?.numero ?? '') };
  },
});

export const anularMiPedidoFondo = createAction({
  permiso: 'chofer.mis_gastos:editar',
  schema: z.object({ pedidoId: z.number().int().positive(), motivo: z.string().max(500) }),
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_anular_pedido_fondo', { p_pedido: d.pedidoId, p_motivo: d.motivo });
    if (error) throw error;
    return null;
  },
});

export const revisarPedidoFondo = createAction({
  permiso: PERMISO,
  schema: z.object({ pedidoId: z.number().int().positive(), elevar: z.boolean(), nota: z.string().max(500).nullable() }),
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_revisar_pedido_fondo', { p_pedido: d.pedidoId, p_elevar: d.elevar, p_nota: d.nota });
    if (error) throw error;
    return null;
  },
});

export const autorizarPedidoFondo = createAction({
  permiso: PERMISO,
  schema: z.object({
    pedidoId: z.number().int().positive(),
    importe: z.number({ message: 'Escribí el monto que se autoriza.' }).positive('El monto tiene que ser mayor que cero.'),
    nota: z.string().max(500).nullable(),
    ...pago,
  }),
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_autorizar_pedido_fondo', {
      p_pedido: d.pedidoId,
      p_importe: d.importe,
      p_cuenta: d.cuentaId,
      p_medio: d.medio,
      p_fecha: d.fecha,
      p_monto_cuenta: d.montoCuenta,
      p_nota: d.nota,
      p_ruta: d.ruta,
      p_nombre: d.nombre,
    });
    if (error) throw error;
    return null;
  },
});

export const pagarPedidoFondo = createAction({
  permiso: PERMISO,
  schema: z.object({ pedidoId: z.number().int().positive(), ...pago }),
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_pagar_pedido_fondo', {
      p_pedido: d.pedidoId,
      p_cuenta: d.cuentaId,
      p_medio: d.medio,
      p_fecha: d.fecha,
      p_monto_cuenta: d.montoCuenta,
      p_ruta: d.ruta,
      p_nombre: d.nombre,
    });
    if (error) throw error;
    return null;
  },
});
