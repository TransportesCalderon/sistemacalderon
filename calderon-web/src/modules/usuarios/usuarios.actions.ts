'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { usuariosRepository } from './usuarios.repository';

/** Alta (vincular una cuenta de acceso), cambio de roles y desactivación. Solo TI (la base lo vuelve a controlar). */
export const guardarUsuario = createAction({
  permiso: 'configuracion.usuarios:editar',
  schema: z.object({
    email: z.string().trim().toLowerCase().email('Email no válido.'),
    nombre: z.string().trim().min(1, 'Escribí el nombre.').max(200, 'Máximo 200 caracteres.'),
    roles: z.array(z.string()).min(1, 'Elegí al menos un rol.'),
    activo: z.boolean(),
    // Migración 60: con el rol chofer, a qué chofer corresponde (la base lo exige)
    choferId: z.number().int().positive().nullable(),
  }),
  handler: (d, { db }) => usuariosRepository(db).guardar(d),
  invalida: () => ({ paths: ['/configuracion/usuarios'] }),
});

/** Migración 150: crear el usuario con su cuenta de acceso (email y contraseña inicial opcional). Solo TI. */
export const crearUsuario = createAction({
  permiso: 'configuracion.usuarios:editar',
  schema: z.object({
    email: z.string().trim().toLowerCase().email('Email no válido.'),
    nombre: z.string().trim().min(1, 'Escribí el nombre.').max(200, 'Máximo 200 caracteres.'),
    roles: z.array(z.string()).min(1, 'Elegí al menos un rol.'),
    choferId: z.number().int().positive().nullable(),
    // Vacía = sin contraseña inicial (la base pone una al azar)
    clave: z.string().max(72, 'Máximo 72 caracteres.').nullable(),
  }),
  handler: (d, { db }) => usuariosRepository(db).crear(d),
  invalida: () => ({ paths: ['/configuracion/usuarios'] }),
});

/** Migración 170: marcar quién aprueba cierres de viaje (aprobación cruzada). Solo TI. */
export const marcarAprobadorCierre = createAction({
  permiso: 'configuracion.usuarios:editar',
  schema: z.object({ usuario: z.number().int().positive(), aprueba: z.boolean() }),
  handler: (d, { db }) => usuariosRepository(db).marcarAprobadorCierre(d.usuario, d.aprueba),
});

/** Migración 200: marcar quién da la segunda aprobación de cierres (se descuenta menos que la diferencia). Solo TI. */
export const marcarAprobadorSegundoNivel = createAction({
  permiso: 'configuracion.usuarios:editar',
  schema: z.object({ usuario: z.number().int().positive(), aprueba: z.boolean() }),
  handler: (d, { db }) => usuariosRepository(db).marcarAprobadorSegundoNivel(d.usuario, d.aprueba),
});

/** Migración 177: marcar quién recibe la ventana de tanque bajo (además de Telemetría). Solo TI. */
export const marcarAvisoTanqueBajo = createAction({
  permiso: 'configuracion.usuarios:editar',
  schema: z.object({ usuario: z.number().int().positive(), aprueba: z.boolean() }),
  handler: (d, { db }) => usuariosRepository(db).marcarAvisoTanqueBajo(d.usuario, d.aprueba),
});

/** Migración 189: marcar quién recibe las alertas vencidas (escalamiento) y resuelve prórrogas. Solo TI. */
export const marcarRecibeEscalamiento = createAction({
  permiso: 'configuracion.usuarios:editar',
  schema: z.object({ usuario: z.number().int().positive(), aprueba: z.boolean() }),
  handler: (d, { db }) => usuariosRepository(db).marcarRecibeEscalamiento(d.usuario, d.aprueba),
});

/** Migración 192: TI pone una contraseña provisoria; el usuario tiene que cambiarla al entrar. Solo TI (lo controla la base). */
export const restablecerClave = createAction({
  permiso: 'configuracion.usuarios:editar',
  schema: z.object({ usuario: z.number().int().positive(), clave: z.string().max(72, 'Máximo 72 caracteres.') }),
  handler: (d, { db }) => usuariosRepository(db).restablecerClave(d.usuario, d.clave),
});
