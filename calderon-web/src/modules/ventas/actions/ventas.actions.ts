'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import {
  actividadSchema,
  adicionalSchema,
  cobrarSchema,
  completarSchema,
  contactoSchema,
  cotizacionSchema,
  crearFacturaLibreSchema,
  crearFacturaSchema,
  emitirSchema,
  empresaSchema,
  guardarFacturaSchema,
  hacerClienteSchema,
  idSchema,
  motivoSchema,
  numeroFacturaSchema,
  moverSchema,
  negocioSchema,
  parametrosSchema,
  responderSchema,
  tarifaSchema,
  versionSchema,
} from '../domain/ventas.schemas';
import { comprobanteCobroSchema, rearmarDetalleSchema } from '../domain/detalle';
import { clienteSiiSchema, emitirSiiSchema, glosaSiiSchema, notaCreditoSiiSchema, resolverDteSchema } from '../domain/sii';
import { ventasRepository } from '../repositories/ventas.repository';

/**
 * Escrituras de Ventas (migración 67). El permiso de la pantalla es el primer filtro;
 * la base vuelve a exigir el rol (Ventas o TI; la facturación, Finanzas o TI).
 */
const rutas = () => ({ paths: ['/ventas', '/operacion/operaciones'] });
const repo = ventasRepository;

// Seguimiento
export const guardarEmpresa = createAction({ permiso: 'ventas.empresas:editar', schema: empresaSchema, handler: (d, { db }) => repo(db).guardarEmpresa(d), invalida: rutas });
export const guardarContacto = createAction({ permiso: 'ventas.empresas:editar', schema: contactoSchema, handler: (d, { db }) => repo(db).guardarContacto(d), invalida: rutas });
export const quitarContacto = createAction({ permiso: 'ventas.empresas:editar', schema: idSchema, handler: (d, { db }) => repo(db).quitarContacto(d.id), invalida: rutas });
export const guardarNegocio = createAction({ permiso: 'ventas.empresas:editar', schema: negocioSchema, handler: (d, { db }) => repo(db).guardarNegocio(d), invalida: rutas });
export const moverNegocio = createAction({
  permiso: 'ventas.empresas:editar',
  schema: moverSchema,
  handler: (d, { db }) => repo(db).moverNegocio(d.id, d.etapa, d.motivo),
  invalida: rutas,
});
export const guardarActividad = createAction({ permiso: 'ventas.empresas:editar', schema: actividadSchema, handler: (d, { db }) => repo(db).guardarActividad(d), invalida: rutas });
export const completarActividad = createAction({
  permiso: 'ventas.empresas:editar',
  schema: completarSchema,
  handler: (d, { db }) => repo(db).completarActividad(d.id, d.resultado),
  invalida: rutas,
});
export const quitarActividad = createAction({ permiso: 'ventas.empresas:editar', schema: idSchema, handler: (d, { db }) => repo(db).quitarActividad(d.id), invalida: rutas });
export const hacerCliente = createAction({ permiso: 'ventas.empresas:editar', schema: hacerClienteSchema, handler: (d, { db }) => repo(db).hacerCliente(d), invalida: rutas });

// Tarifario
export const guardarTarifa = createAction({ permiso: 'ventas.tarifas:editar', schema: tarifaSchema, handler: (d, { db }) => repo(db).guardarTarifa(d), invalida: rutas });
export const quitarTarifa = createAction({ permiso: 'ventas.tarifas:editar', schema: idSchema, handler: (d, { db }) => repo(db).quitarTarifa(d.id), invalida: rutas });
export const guardarAdicional = createAction({ permiso: 'ventas.tarifas:editar', schema: adicionalSchema, handler: (d, { db }) => repo(db).guardarAdicional(d), invalida: rutas });
export const guardarParametros = createAction({ permiso: 'ventas.tarifas:editar', schema: parametrosSchema, handler: (d, { db }) => repo(db).guardarParametros(d), invalida: rutas });
export const recalcularCostoKm = createAction({ permiso: 'ventas.tarifas:editar', schema: versionSchema.pick({}), handler: (_d, { db }) => repo(db).recalcularCostoKm(), invalida: rutas });

// Cotizaciones
export const guardarCotizacion = createAction({ permiso: 'ventas.cotizaciones:editar', schema: cotizacionSchema, handler: (d, { db }) => repo(db).guardarCotizacion(d), invalida: rutas });
export const enviarCotizacion = createAction({
  permiso: 'ventas.cotizaciones:transicionar',
  schema: versionSchema,
  handler: (d, { db }) => repo(db).enviarCotizacion(d.id, d.version),
  invalida: rutas,
});
export const responderCotizacion = createAction({
  permiso: 'ventas.cotizaciones:transicionar',
  schema: responderSchema,
  handler: (d, { db }) => repo(db).responderCotizacion(d.id, d.aceptada, d.motivo, d.guardarTarifas),
  invalida: rutas,
});
export const anularCotizacion = createAction({
  permiso: 'ventas.cotizaciones:transicionar',
  schema: motivoSchema,
  handler: (d, { db }) => repo(db).anularCotizacion(d.id, d.motivo),
  invalida: rutas,
});
export const duplicarCotizacion = createAction({ permiso: 'ventas.cotizaciones:editar', schema: idSchema, handler: (d, { db }) => repo(db).duplicarCotizacion(d.id), invalida: rutas });

// Facturación
export const crearFactura = createAction({
  permiso: 'ventas.facturacion:editar',
  schema: crearFacturaSchema,
  handler: (d, { db }) => repo(db).crearFactura(d.clienteId, d.servicios, d.campos),
  invalida: rutas,
});
// Migración 144: factura sin operación (gastos extra)
export const crearFacturaLibre = createAction({
  permiso: 'ventas.facturacion:editar',
  schema: crearFacturaLibreSchema,
  handler: (d, { db }) => repo(db).crearFacturaLibre(d),
  invalida: rutas,
});
export const guardarFactura = createAction({ permiso: 'ventas.facturacion:editar', schema: guardarFacturaSchema, handler: (d, { db }) => repo(db).guardarFactura(d), invalida: rutas });
export const emitirFactura = createAction({
  permiso: 'ventas.facturacion:transicionar',
  schema: emitirSchema,
  handler: (d, { db }) => repo(db).emitirFactura(d.id, d.version, d.numeroFiscal, d.fecha),
  invalida: rutas,
});
export const cobrarFactura = createAction({
  permiso: 'ventas.facturacion:transicionar',
  schema: cobrarSchema,
  handler: (d, { db }) => repo(db).cobrarFactura(d.id, d.fecha, d.cuentaId ?? null),
  invalida: rutas,
});
export const numeroFactura = createAction({
  permiso: 'ventas.facturacion:transicionar',
  schema: numeroFacturaSchema,
  handler: (d, { db }) => repo(db).numeroFactura(d.id, d.numeroFiscal),
  invalida: rutas,
});
export const anularFactura = createAction({
  permiso: 'ventas.facturacion:transicionar',
  schema: motivoSchema,
  handler: (d, { db }) => repo(db).anularFactura(d.id, d.motivo),
  invalida: rutas,
});

// Migración 124: facturación electrónica (Facturacion.cl). Envía la base; acá solo se llama.
export const guardarClienteSii = createAction({
  permiso: 'ventas.facturacion:editar',
  schema: clienteSiiSchema,
  handler: (d, { db }) => repo(db).guardarClienteSii(d),
  invalida: rutas,
});
export const emitirSii = createAction({
  permiso: 'ventas.facturacion:transicionar',
  schema: emitirSiiSchema,
  handler: (d, { db }) => repo(db).emitirSii(d.id, d.version, d.fecha),
  invalida: rutas,
});
/** Migración 138: la leyenda de la factura electrónica (null = la automática; '' = sin leyenda). */
export const guardarGlosaSii = createAction({
  permiso: 'ventas.facturacion:transicionar',
  schema: glosaSiiSchema,
  handler: (d, { db }) => repo(db).guardarGlosaSii(d.id, d.glosa),
  invalida: rutas,
});
export const notaCreditoSii = createAction({
  permiso: 'ventas.facturacion:transicionar',
  schema: notaCreditoSiiSchema,
  handler: (d, { db }) => repo(db).notaCreditoSii(d.dteId, d.motivo),
  invalida: rutas,
});
export const resolverDte = createAction({
  permiso: 'ventas.facturacion:transicionar',
  schema: resolverDteSchema,
  handler: (d, { db }) => repo(db).resolverDte(d.dteId, d.folio),
  invalida: rutas,
});
export const probarSii = createAction({
  permiso: 'ventas.facturacion:transicionar',
  schema: z.object({}),
  handler: (_d, { db }) => repo(db).siiProbar(),
});

// Migración 125: detalle de la factura por cliente y comprobante del cobro
export const rearmarDetalle = createAction({
  permiso: 'ventas.facturacion:editar',
  schema: rearmarDetalleSchema,
  handler: (d, { db }) => repo(db).rearmarDetalle(d.facturaId, d.campos),
  invalida: rutas,
});
export const guardarComprobanteCobro = createAction({
  permiso: 'ventas.facturacion:transicionar',
  schema: comprobanteCobroSchema,
  handler: (d, { db }) => repo(db).guardarComprobanteCobro(d.id, d.ruta, d.nombre),
  invalida: rutas,
});
