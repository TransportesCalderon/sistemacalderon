'use server';

import { createAction } from '@/server/actions/create-action';
import { clienteAltaSchema, clienteEdicionSchema } from '../domain/cliente.schemas';
import { clienteService } from '../services/cliente.service';

/**
 * Server actions de Comercial > Clientes. Permiso de la matriz §16: 'comercial.clientes:editar'
 * (Operaciones y Finanzas). La base vuelve a controlar con el rol tc_* del usuario.
 */
export const crearCliente = createAction({
  permiso: 'comercial.clientes:editar',
  schema: clienteAltaSchema,
  handler: (datos, { db }) => clienteService(db).crear(datos),
  invalida: (_datos, cliente) => ({ paths: ['/cotizaciones/datos-clientes', `/comercial/clientes/${cliente.id}`] }),
});

export const editarCliente = createAction({
  permiso: 'comercial.clientes:editar',
  schema: clienteEdicionSchema,
  handler: (input, { db }) => clienteService(db).editar(input),
  invalida: ({ id }) => ({ paths: ['/cotizaciones/datos-clientes', `/comercial/clientes/${id}`] }),
});
