import { ErrorNegocio } from '@/shared/lib/errores';
import type { Db } from '@/shared/repository/types';
import type { ClienteId } from '@/shared/types/dominio';
import type { ClienteDatos, ClienteEdicion } from '../domain/cliente.schemas';
import type { Cliente } from '../domain/cliente.types';
import { errorIdentificadorFiscal } from '../domain/identificador-fiscal';
import { clienteRepository } from '../repositories/cliente.repository';

/**
 * Casos de uso del cliente (arquitectura §10). Orquesta el repositorio y verifica
 * precondiciones para dar un mensaje temprano; no conoce Next.js ni React.
 * Las reglas definitivas las aplica la base (CHECK, índices únicos, triggers).
 */
export function clienteService(db: Db) {
  const repo = clienteRepository(db);

  return {
    /** Alta de cliente (P-CLI-01). */
    async crear(datos: ClienteDatos): Promise<Cliente> {
      return repo.crear(datos);
    },

    /** Edición con concurrencia optimista. Inactivar o bloquear es un cambio de estado. */
    async editar({ id, versionFila, ...datos }: ClienteEdicion): Promise<Cliente> {
      const actual = await repo.obtener(id as ClienteId);
      if (!actual) throw new ErrorNegocio('referencia', 'El cliente no existe o no tenés acceso.');
      if (actual.eliminadoEn) {
        throw new ErrorNegocio('inmutable', 'Este cliente fue eliminado como registro erróneo y ya no se modifica.');
      }
      // El identificador guardado puede venir de una carga histórica sin dígito verificador
      // válido: se exige el formato solo si cambia el país o el número.
      if (datos.pais !== actual.pais || datos.identificadorFiscal !== actual.identificadorFiscal) {
        const error = errorIdentificadorFiscal(datos.pais, datos.identificadorFiscal);
        if (error) throw new ErrorNegocio('regla_negocio', error);
      }
      // Si la versión ya no coincide, el repositorio lanza ConflictoVersion (40001).
      return repo.actualizar({ id, versionFila }, datos);
    },
  };
}
