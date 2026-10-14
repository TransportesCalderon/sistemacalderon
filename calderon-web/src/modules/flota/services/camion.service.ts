import { ErrorNegocio } from '@/shared/lib/errores';
import type { Db } from '@/shared/repository/types';
import type { CamionId } from '@/shared/types/dominio';
import type { CamionDatos, CamionEdicion } from '../domain/camion.schemas';
import type { Camion } from '../domain/camion.types';
import { camionRepository } from '../repositories/camion.repository';

/**
 * Casos de uso del camión (arquitectura §10). Orquesta el repositorio y verifica
 * precondiciones para dar un mensaje temprano; no conoce Next.js ni React.
 * Las reglas definitivas las aplica la base (CHECK, índices únicos, triggers).
 */
export function camionService(db: Db) {
  const repo = camionRepository(db);

  return {
    /** Alta de camión (F-MAE-01). */
    async crear(datos: CamionDatos): Promise<Camion> {
      return repo.crear(datos);
    },

    /** Edición con concurrencia optimista. Incluye la baja operativa (estado inactivo + fecha de baja). */
    async editar({ id, versionFila, ...datos }: CamionEdicion): Promise<Camion> {
      const actual = await repo.obtener(id as CamionId);
      if (!actual) throw new ErrorNegocio('referencia', 'El camión no existe o no tenés acceso.');
      if (actual.eliminadoEn) {
        throw new ErrorNegocio('inmutable', 'Este camión fue eliminado como registro erróneo y ya no se modifica.');
      }
      // Si la versión ya no coincide, el repositorio lanza ConflictoVersion (40001).
      return repo.actualizar({ id, versionFila }, datos);
    },
  };
}
