'use server';

import { createAction } from '@/server/actions/create-action';
import { anularTransferenciaSchema, pasarPlataSchema } from '../domain/pasar-plata';
import { pasarPlataRepository } from '../repositories/pasar-plata.repository';

/**
 * Migración 388 · Transferir entre cuentas propias (también dólares a pesos). Lo hacen Finanzas, Gerencia o TI: lo decide
 * la base (fin.fn_exigir_pasar_plata). Por eso alcanza con poder ver el tablero financiero: Gerencia ve Finanzas pero no
 * la edita, y esto sí lo tiene que poder anotar.
 */
const RUTAS = { paths: ['/hoy', '/conciliacion', '/finanzas'] };

export const pasarPlata = createAction({
  permiso: ['finanzas.resumen:ver', 'finanzas.bancos:ver'],
  schema: pasarPlataSchema,
  handler: (d, { db }) => pasarPlataRepository(db).pasar(d),
  invalida: () => RUTAS,
});

export const anularTransferencia = createAction({
  permiso: ['finanzas.resumen:ver', 'finanzas.bancos:ver'],
  schema: anularTransferenciaSchema,
  handler: (d, { db }) => pasarPlataRepository(db).anular(d),
  invalida: () => RUTAS,
});
