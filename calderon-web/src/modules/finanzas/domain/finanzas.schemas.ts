import { z } from 'zod';
import { numeroOpc } from '@/modules/ventas/domain/ventas.schemas';

/** Forma de los formularios de Finanzas. Las reglas las decide la base (los mensajes vienen de ahí). */
const id = z.number().int().positive();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.');
const fechaOpc = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Fecha no válida.');
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));
const motivo = z.string().trim().min(1, 'Escribí el motivo.').max(500);
const moneda = z.string().length(3);

export const cuentaContableSchema = z.object({
  id: id.nullable(),
  codigo: texto(20),
  nombre: z.string().trim().min(2, 'Escribí el nombre.').max(120),
  activa: z.boolean(),
});
export type CuentaContableEntrada = z.infer<typeof cuentaContableSchema>;

export const proveedorSchema = z.object({ razonSocial: z.string().trim().min(2, 'Escribí la razón social.').max(200), rut: texto(20) });
export type ProveedorEntrada = z.infer<typeof proveedorSchema>;

export const cuentaDineroSchema = z.object({
  id: id.nullable(),
  nombre: z.string().trim().min(2, 'Escribí el nombre.').max(80),
  tipo: z.enum(['banco', 'caja']),
  banco: texto(80),
  numero: texto(40),
  moneda,
  saldoInicial: numeroOpc,
  saldoInicialFecha: fecha,
  activa: z.boolean(),
});
export type CuentaDineroEntrada = z.infer<typeof cuentaDineroSchema>;

export const gastoSchema = z.object({
  id: id.nullable(),
  version: z.number().int().nullable(),
  fecha,
  vence: fechaOpc,
  proveedorId: id.nullable(),
  proveedorNombre: texto(150),
  tipoDocumento: z.enum(['factura', 'factura_exenta', 'boleta', 'boleta_honorarios', 'sin_documento', 'otro']),
  numeroDocumento: texto(30),
  descripcion: z.string().trim().min(2, 'Escribí qué es el gasto.').max(200),
  cuentaId: z.number({ error: 'Elegí la categoría.' }).int().positive('Elegí la categoría.'),
  camionId: id.nullable(),
  moneda,
  neto: numeroOpc,
  exento: numeroOpc,
  total: numeroOpc,
});
export type GastoEntrada = z.infer<typeof gastoSchema>;

export const gastoFijoSchema = z.object({
  id: id.nullable(),
  nombre: z.string().trim().min(2, 'Escribí el nombre.').max(100),
  proveedorId: id.nullable(),
  cuentaId: z.number({ error: 'Elegí la categoría.' }).int().positive('Elegí la categoría.'),
  tipoDocumento: z.enum(['factura', 'factura_exenta', 'boleta', 'boleta_honorarios', 'sin_documento', 'otro']),
  moneda,
  monto: numeroOpc,
  diaVence: z.number().int(),
  camionId: id.nullable(),
  desde: fecha,
  hasta: fechaOpc,
  /** Cantidad de cuotas (leasing o crédito): con esto la base calcula «hasta». */
  cuotas: z.number().int().min(1, 'Las cuotas van de 1 a 600.').max(600, 'Las cuotas van de 1 a 600.').nullable().optional(),
  /** Cuotas ya pagadas antes de cargar el gasto en el sistema (leasing o crédito viejo). */
  cuotasPrevias: z.number().int().min(0).max(600).nullable().optional(),
  /** Varias unidades (leasing de varios tractores y semis). Si se manda, reemplaza la lista guardada. */
  camiones: z.array(id).max(60).optional(),
  semis: z.array(id).max(60).optional(),
  activo: z.boolean(),
  observacion: texto(500),
});
export type GastoFijoEntrada = z.infer<typeof gastoFijoSchema>;

export const movimientoSchema = z.object({
  tipo: z.enum(['cobro', 'pago', 'ingreso', 'egreso', 'transferencia']),
  fecha,
  cuentaDineroId: z.number({ error: 'Elegí el banco o la caja.' }).int().positive('Elegí el banco o la caja.'),
  monto: numeroOpc,
  facturaId: id.nullable(),
  gastoId: id.nullable(),
  cuentaId: id.nullable(),
  destinoId: id.nullable(),
  montoDestino: numeroOpc,
  montoDocumento: numeroOpc,
  descripcion: texto(200),
});
export type MovimientoEntrada = z.infer<typeof movimientoSchema>;

/** Pago de un gasto atrasado con sus recargos (interés por mora, gastos de cobranza y otros). */
export const pagoRecargosSchema = z.object({
  gastoId: id,
  fecha,
  cuentaDineroId: z.number({ error: 'Elegí el banco o la caja.' }).int().positive('Elegí el banco o la caja.'),
  monto: numeroOpc,
  montoDocumento: numeroOpc,
  mora: numeroOpc,
  cobranza: numeroOpc,
  otros: numeroOpc,
  otrosDetalle: texto(120),
});
export type PagoRecargosEntrada = z.infer<typeof pagoRecargosSchema>;

export const filaCartolaSchema = z.object({
  fecha: z.string().max(40),
  descripcion: z.string().max(400),
  documento: z.string().max(80),
  cargo: z.string().max(40),
  abono: z.string().max(40),
  monto: z.string().max(40),
  saldo: z.string().max(40),
});
export const importarCartolaSchema = z.object({ cuentaId: id, filas: z.array(filaCartolaSchema).min(1, 'La planilla no tiene filas.').max(5000) });
export type ImportarCartolaEntrada = z.infer<typeof importarCartolaSchema>;

export const conciliarSchema = z.object({ lineaId: id, movimientoId: id });
export const lineaSchema = z.object({ lineaId: id });
export const ignorarSchema = z.object({ lineaId: id, ignorar: z.boolean() });
export const crearDesdeLineaSchema = z.object({
  lineaId: id,
  tipo: z.enum(['cobro', 'pago', 'ingreso', 'egreso', 'transferencia']),
  facturaId: id.nullable(),
  gastoId: id.nullable(),
  cuentaId: id.nullable(),
  destinoId: id.nullable(),
  montoDestino: numeroOpc,
  descripcion: texto(200),
});
export type CrearDesdeLineaEntrada = z.infer<typeof crearDesdeLineaSchema>;

export const idSchema = z.object({ id });
export const anularSchema = z.object({ id, motivo });
// Migración 273: cambiar la fecha de un cobro
export const cambiarFechaCobroSchema = z.object({ id, fecha, motivo });
export const periodoSchema = z.object({ periodo: fecha });
// Migración 275: recibo de cobranza con una o varias facturas del mismo cliente
export const reciboSchema = z.object({
  fecha,
  cuentaDineroId: z.number({ error: 'Elegí el banco o la caja.' }).int().positive('Elegí el banco o la caja.'),
  observacion: texto(500),
  facturas: z
    .array(z.object({ facturaId: id, monto: numeroOpc }))
    .min(1, 'Elegí al menos una factura.')
    .max(100, 'Un recibo lleva hasta 100 facturas.'),
});
export type ReciboEntrada = z.infer<typeof reciboSchema>;
export const anularReciboSchema = z.object({ id, motivo });

// Migración 74
export const medioPagoSchema = z.object({
  id: id.nullable(),
  nombre: z.string().trim().min(2, 'Escribí el nombre.').max(80),
  medio: z.enum(['tarjeta', 'cuenta_corriente', 'efectivo', 'surtidor_propio']),
  tipo: z.enum(['factura_posterior', 'prepago', 'caja', 'tanque_propio']),
  proveedorId: id.nullable(),
  cuentaDineroId: id.nullable(),
  activo: z.boolean(),
});
export type MedioPagoEntrada = z.infer<typeof medioPagoSchema>;
export const vincularCargasSchema = z.object({ gastoId: id, cargas: z.array(id).max(2000) });
