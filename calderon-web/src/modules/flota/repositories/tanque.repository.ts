import { ConflictoVersion, RepoError, type Db } from '@/shared/repository/types';
import type { CamionId, FechaDia, TanqueId } from '@/shared/types/dominio';
import type { BajaTanque, CambioCapacidad, DescripcionTanque, EliminarTanque, TanqueAlta, TanquesAlta } from '../domain/tanque.schemas';
import { esTipoTanque, type Tanque, type TanquesDelCamion } from '../domain/tanque.types';

/**
 * Repositorio de mae.tanque_combustible (migración 27).
 * - Alta: insert directo; el número lo asigna la base.
 * - Cambio de capacidad: mae.fn_cambiar_capacidad_tanque (cierra la vigencia y abre otra).
 * - Baja: cierra la vigencia con una fecha. Eliminar: solo para un tanque cargado por error
 *   (la base lo impide si tiene cargas).
 * - La capacidad total la calcula la base (mae.v_capacidad_camion).
 */
const COLS =
  'id, camion_id, numero_tanque, tipo, descripcion, capacidad_nominal_l::text, capacidad_util_l::text, vigente_desde, vigente_hasta, version_fila';

type Fila = {
  id: number;
  camion_id: number;
  numero_tanque: number;
  tipo: string;
  descripcion: string | null;
  capacidad_nominal_l: string;
  capacidad_util_l: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  version_fila: number;
};

export function aTanque(f: Fila): Tanque {
  return {
    id: f.id as TanqueId,
    camionId: f.camion_id as CamionId,
    numero: f.numero_tanque,
    tipo: esTipoTanque(f.tipo) ? f.tipo : 'otro',
    descripcion: f.descripcion,
    capacidadNominalL: Number(f.capacidad_nominal_l),
    capacidadUtilL: Number(f.capacidad_util_l),
    vigenteDesde: f.vigente_desde as FechaDia,
    vigenteHasta: f.vigente_hasta as FechaDia | null,
    versionFila: f.version_fila,
  };
}

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

export const tanqueRepository = (db: Db) => {
  const tabla = () => db.schema('mae').from('tanque_combustible');

  /** Escritura de una fila versionada: si nadie la cambió, la actualiza; si no, conflicto. */
  async function actualizar(
    tanqueId: number,
    versionFila: number,
    cambios: {
      descripcion?: string | null;
      vigente_hasta?: string;
      eliminado_en?: string;
    },
  ) {
    const { data, error } = await tabla()
      .update({ ...cambios, version_fila: versionFila })
      .eq('id', tanqueId)
      .eq('version_fila', versionFila)
      .select('id')
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) throw new ConflictoVersion('mae.tanque_combustible', tanqueId);
  }

  return {
    async delCamion(camionId: CamionId): Promise<TanquesDelCamion> {
      const [tanques, capacidad] = await Promise.all([
        tabla().select(COLS).eq('camion_id', camionId).is('eliminado_en', null).order('numero_tanque').order('vigente_desde'),
        db
          .schema('mae')
          .from('v_capacidad_camion')
          .select('tanques, capacidad_util_l, capacidad_nominal_l')
          .eq('camion_id', camionId)
          .maybeSingle(),
      ]);
      if (tanques.error) throw new RepoError(tanques.error);
      if (capacidad.error) throw new RepoError(capacidad.error);
      return {
        tanques: (tanques.data as unknown as Fila[]).map(aTanque),
        capacidad: {
          tanques: n(capacidad.data?.tanques) ?? 0,
          capacidadUtilL: n(capacidad.data?.capacidad_util_l),
          capacidadNominalL: n(capacidad.data?.capacidad_nominal_l),
        },
      };
    },

    /** Capacidad útil de hoy de varios camiones (lista de camiones). Sin tanques: null. */
    async capacidades(ids: number[]): Promise<Record<number, number | null>> {
      if (ids.length === 0) return {};
      const { data, error } = await db.schema('mae').from('v_capacidad_camion').select('camion_id, capacidad_util_l').in('camion_id', ids);
      if (error) throw new RepoError(error);
      return Object.fromEntries(data.map((f) => [Number(f.camion_id), n(f.capacidad_util_l)]));
    },

    async crear(d: TanqueAlta): Promise<void> {
      const { error } = await tabla().insert({
        camion_id: d.camionId,
        tipo: d.tipo,
        descripcion: d.descripcion,
        capacidad_nominal_l: d.capacidadNominalL,
        capacidad_util_l: d.capacidadUtilL,
        vigente_desde: d.vigenteDesde,
      });
      if (error) throw new RepoError(error);
    },

    /** Varios tanques en un solo INSERT: si la base rechaza uno, no se guarda ninguno. */
    async crearVarios(d: TanquesAlta): Promise<void> {
      const { error } = await tabla().insert(
        d.tanques.map((t) => ({
          camion_id: d.camionId,
          tipo: t.tipo,
          descripcion: t.descripcion,
          capacidad_nominal_l: t.capacidadNominalL,
          capacidad_util_l: t.capacidadUtilL,
          vigente_desde: d.vigenteDesde,
        })),
      );
      if (error) throw new RepoError(error);
    },

    async cambiarCapacidad(d: CambioCapacidad): Promise<void> {
      const { error } = await db.schema('mae').rpc('fn_cambiar_capacidad_tanque', {
        p_tanque: d.tanqueId,
        p_desde: d.desde,
        p_capacidad_nominal_l: d.capacidadNominalL,
        p_capacidad_util_l: d.capacidadUtilL,
      });
      if (error) throw new RepoError(error);
    },

    darDeBaja: (d: BajaTanque) => actualizar(d.tanqueId, d.versionFila, { vigente_hasta: d.hasta }),
    // El trigger aud.fn_soft_delete fija la hora y el usuario de la eliminación.
    eliminar: (d: EliminarTanque) =>
      actualizar(d.tanqueId, d.versionFila, {
        eliminado_en: new Date().toISOString(),
      }),
    editarDescripcion: (d: DescripcionTanque) => actualizar(d.tanqueId, d.versionFila, { descripcion: d.descripcion }),
  };
};
