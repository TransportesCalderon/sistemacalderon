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
  }),
  handler: (d, { db }) => usuariosRepository(db).guardar(d),
  invalida: () => ({ paths: ['/configuracion/usuarios'] }),
});
