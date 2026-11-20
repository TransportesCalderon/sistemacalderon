import { RepoError, type Db } from '@/shared/repository/types';
import { leerSeguimiento, type Seguimiento } from '../domain/seguimiento';

/**
 * Migración 288 · Lo único que puede pedir el usuario de un cliente (rol de base tc_cliente): su mapa y
 * lo de la contraseña, en el esquema public. El cliente sale de su usuario, nunca de un parámetro.
 */
export const clienteRepository = (db: Db) => ({
  async seguimiento(): Promise<Seguimiento> {
    const { data, error } = await db.schema('public').rpc('fn_mapa_cliente');
    if (error) throw new RepoError(error);
    return leerSeguimiento(data);
  },
  /** Si entró con una contraseña provisoria (la puso TI) y tiene que elegir la suya. */
  async deboCambiarClave(): Promise<boolean> {
    const { data, error } = await db.schema('public').rpc('fn_cliente_debo_cambiar_clave');
    if (error) return false;
    return data === true;
  },
});
