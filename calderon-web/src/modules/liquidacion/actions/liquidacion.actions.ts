'use server';

import { createAction } from '@/server/actions/create-action';
import {
  aprobarSchema,
  bonoColaboradoresSchema,
  bonoDesempenoSchema,
  diaTrabajadoSchema,
  tramoLiquidacionSchema,
  conceptoSchema,
  empresaSchema,
  fichaSchema,
  firmadaSchema,
  idSchema,
  indicadoresSchema,
  legalSchema,
  motivoSchema,
  pagarSchema,
  prepararSchema,
  prepararTodasSchema,
  renglonSchema,
  tarifaSchema,
} from '../domain/liquidacion.schemas';
import { liquidacionRepository } from '../repositories/liquidacion.repository';

/**
 * Escrituras de liquidaciones (migración 62). El permiso de la pantalla es el primer filtro;
 * la base vuelve a exigir RRHH o TI (y Finanzas para registrar el pago).
 */
const rutas = () => ({ paths: ['/liquidaciones', '/rrhh/tarifas', '/rrhh/datos-legales', '/mi-viaje'] });

export const guardarTarifa = createAction({
  permiso: 'liquidacion.reglas:editar',
  schema: tarifaSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarTarifa(d),
  invalida: rutas,
});
export const quitarTarifa = createAction({
  permiso: 'liquidacion.reglas:editar',
  schema: idSchema,
  handler: (d, { db }) => liquidacionRepository(db).quitarTarifa(d.id),
  invalida: rutas,
});
export const guardarConcepto = createAction({
  permiso: 'liquidacion.reglas:editar',
  schema: conceptoSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarConcepto(d),
  invalida: rutas,
});
export const prepararLiquidacion = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: prepararSchema,
  handler: (d, { db }) => liquidacionRepository(db).preparar(d.choferId, d.periodo),
  invalida: rutas,
});
export const choferesAPreparar = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: prepararTodasSchema,
  handler: (d, { db }) => liquidacionRepository(db).choferesAPreparar(d.periodo),
});
export const prepararLiquidaciones = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: prepararTodasSchema,
  handler: (d, { db }) => liquidacionRepository(db).prepararTodas(d.periodo),
  invalida: rutas,
});
export const agregarRenglon = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: renglonSchema,
  handler: (d, { db }) => liquidacionRepository(db).agregarRenglon(d),
  invalida: rutas,
});
export const quitarRenglon = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: idSchema,
  handler: (d, { db }) => liquidacionRepository(db).quitarRenglon(d.id),
  invalida: rutas,
});
export const aprobarLiquidacion = createAction({
  permiso: 'liquidacion.liquidaciones:transicionar',
  schema: aprobarSchema,
  handler: (d, { db }) => liquidacionRepository(db).aprobar(d.id, d.version),
  invalida: rutas,
});
export const pagarLiquidacion = createAction({
  permiso: 'liquidacion.liquidaciones:transicionar',
  schema: pagarSchema,
  handler: (d, { db }) => liquidacionRepository(db).pagar(d.id, d.fecha, d.forma, d.banco, d.numero, d.cuentaId ?? null),
  invalida: rutas,
});
export const reabrirLiquidacion = createAction({
  permiso: 'liquidacion.liquidaciones:transicionar',
  schema: motivoSchema,
  handler: (d, { db }) => liquidacionRepository(db).reabrir(d.id, d.motivo),
  invalida: rutas,
});
export const anularLiquidacion = createAction({
  permiso: 'liquidacion.liquidaciones:transicionar',
  schema: motivoSchema,
  handler: (d, { db }) => liquidacionRepository(db).anular(d.id, d.motivo),
  invalida: rutas,
});

// Migración 66: liquidación de sueldo de Chile y comprobante de egreso
export const guardarEmpresa = createAction({
  permiso: 'liquidacion.reglas:editar',
  schema: empresaSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarEmpresa(d),
  invalida: rutas,
});
export const guardarIndicadores = createAction({
  permiso: 'liquidacion.reglas:editar',
  schema: indicadoresSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarIndicadores(d),
  invalida: rutas,
});
export const guardarFicha = createAction({
  permiso: 'liquidacion.reglas:editar',
  schema: fichaSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarFicha(d),
  invalida: rutas,
});
export const guardarLegal = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: legalSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarLegal(d),
  invalida: rutas,
});
// Liquidación en 3 pasos
export const guardarDiaTrabajado = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: diaTrabajadoSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarDiaTrabajado(d),
  invalida: rutas,
});
/** Operaciones corrige los días desde la ficha del chofer (Flota). La base exige RRHH, Operaciones o TI. */
export const guardarDiaTrabajadoFlota = createAction({
  permiso: 'flota.choferes:editar',
  schema: diaTrabajadoSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarDiaTrabajado(d),
  invalida: rutas,
});
export const guardarBonoDesempeno = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: bonoDesempenoSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarBonoDesempeno(d),
  invalida: rutas,
});
export const guardarBonoColaboradores = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: bonoColaboradoresSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarBonoColaboradores(d),
  invalida: rutas,
});
export const guardarTramoLiquidacion = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: tramoLiquidacionSchema,
  handler: (d, { db }) => liquidacionRepository(db).guardarTramo(d),
  invalida: rutas,
});
export const quitarBonoColaboradores = createAction({
  permiso: 'liquidacion.liquidaciones:editar',
  schema: idSchema,
  handler: (d, { db }) => liquidacionRepository(db).quitarBonoColaboradores(d.id),
  invalida: rutas,
});
export const adjuntarFirmada = createAction({
  permiso: 'liquidacion.liquidaciones:transicionar',
  schema: firmadaSchema,
  handler: (d, { db }) => liquidacionRepository(db).adjuntarFirmada(d.id, d.ruta),
  invalida: rutas,
});
