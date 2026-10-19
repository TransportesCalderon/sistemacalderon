import { ErrorNegocio } from '@/shared/lib/errores';
import type { Db } from '@/shared/repository/types';
import type { ChoferId } from '@/shared/types/dominio';
import type { ChoferAlta, ChoferEdicion } from '../domain/chofer.schemas';
import type { Chofer, DatosReservadosChofer } from '../domain/chofer.types';
import { choferRepository } from '../repositories/chofer.repository';

/**
 * Casos de uso del chofer (arquitectura §10). Verifica precondiciones y permisos que
 * dependen del dato (documento, alcance "propio"); la base aplica las reglas definitivas.
 */
export interface PermisosChofer {
  /** 'propio' = el usuario es el chofer y solo puede operar sobre su propio registro. */
  alcance: 'todo' | 'propio';
  choferIdSesion: number | null;
  /** flota.documento_chofer:editar (RR. HH.). */
  puedeCambiarDocumento: boolean;
}

export function choferService(db: Db) {
  const repo = choferRepository(db);

  const exigirPropio = (id: number, p: Pick<PermisosChofer, 'alcance' | 'choferIdSesion'>) => {
    if (p.alcance === 'propio' && id !== p.choferIdSesion) {
      throw new ErrorNegocio('sin_permiso', 'Solo podés operar sobre tu propio registro.');
    }
  };

  return {
    /** Alta (F-MAE-03). El documento es obligatorio: se carga, no se lee. */
    async crear({ documento, reservados, ...datos }: ChoferAlta, p: Pick<PermisosChofer, 'alcance'>): Promise<Chofer> {
      if (p.alcance !== 'todo') throw new ErrorNegocio('sin_permiso', 'No tenés permiso para dar de alta choferes.');
      return repo.crear(datos, documento, reservados);
    },

    /** Edición con concurrencia optimista. Incluye la baja operativa (estado Baja + fecha de egreso). */
    async editar({ id, versionFila, documento, reservados, ...datos }: ChoferEdicion, p: PermisosChofer): Promise<Chofer> {
      exigirPropio(id, p);
      if (documento && !p.puedeCambiarDocumento) {
        throw new ErrorNegocio('sin_permiso', 'El documento solo lo modifica Administración y RR. HH.');
      }
      if (reservados && !p.puedeCambiarDocumento) {
        throw new ErrorNegocio('sin_permiso', 'El RUT, la fecha de nacimiento y el contacto de emergencia solo los modifica Administración y RR. HH.');
      }
      const actual = await repo.obtener(id as ChoferId);
      if (!actual) throw new ErrorNegocio('referencia', 'El chofer no existe o no tenés acceso.');
      if (actual.eliminadoEn) {
        throw new ErrorNegocio('inmutable', 'Este chofer fue eliminado como registro erróneo y ya no se modifica.');
      }
      return repo.actualizar({ id, versionFila }, datos, documento, reservados);
    },

    /** "Mostrar documento" (P-MAE-03): registra el acceso y devuelve el documento. */
    async revelarDocumento(
      id: number,
      p: Pick<PermisosChofer, 'alcance' | 'choferIdSesion'>,
      ip: string | null,
    ): Promise<DatosReservadosChofer> {
      exigirPropio(id, p);
      const documento = await repo.revelarDocumento(id as ChoferId, { motivo: 'Ficha del chofer: Mostrar documento', ip });
      if (!documento) throw new ErrorNegocio('referencia', 'El chofer no existe o no tenés acceso.');
      return documento;
    },
  };
}
