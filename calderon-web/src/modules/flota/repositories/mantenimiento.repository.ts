import { RepoError, type Db } from '@/shared/repository/types';
import {
  parsearAvisosOt,
  parsearEquiposMant,
  parsearOrdenes,
  parsearPersonas,
  parsearPlan,
  parsearZonas,
  type AvisoOt,
  type EquipoMant,
  type OrdenTrabajo,
  type Persona,
  type Prioridad,
  type TareaPlan,
  type Zona,
} from '../domain/mantenimiento.types';
import type { Equipo } from '../domain/vencimientos.types';

export interface DatosTarea {
  id: number | null;
  version: number | null;
  nombre: string;
  descripcion: string | null;
  aplica: Equipo;
  marca: string | null;
  tipoSemi: string | null;
  cadaDias: number | null;
  cadaKm: number | null;
  avisoDias: number;
  avisoKm: number;
  zonas: string[];
  prioridad: Prioridad;
  activo: boolean;
}
export interface DatosOt {
  equipo: Equipo;
  equipoId: number;
  titulo: string;
  descripcion: string | null;
  zonas: string[];
  prioridad: Prioridad;
  fechaLimite: string | null;
  asignado: number | null;
}
export interface DatosTerminar {
  id: number;
  trabajo: string;
  km: number | null;
  repuestos: string | null;
  costo: number | null;
  moneda: string | null;
  proveedor: string | null;
}

/** Migración 199: plan de mantenimiento y órdenes de trabajo. La base valida todo; su mensaje se muestra tal cual. */
export const mantenimientoRepository = (db: Db) => {
  const mae = () => db.schema('mae');
  const ok = <T>(r: { data: T; error: unknown }): T => {
    if (r.error) throw new RepoError(r.error as ConstructorParameters<typeof RepoError>[0]);
    return r.data;
  };
  return {
    zonas: async (): Promise<Zona[]> => parsearZonas(ok(await mae().rpc('fn_zonas_equipo'))),
    equipos: async (): Promise<EquipoMant[]> => parsearEquiposMant(ok(await mae().rpc('fn_equipos_mantenimiento'))),
    mecanicos: async (): Promise<Persona[]> => parsearPersonas(ok(await mae().rpc('fn_mecanicos'))),
    ordenes: async (cerradasDias: number): Promise<OrdenTrabajo[]> => parsearOrdenes(ok(await mae().rpc('fn_ordenes_trabajo', { p_cerradas_dias: cerradasDias }))),
    plan: async (): Promise<TareaPlan[]> => parsearPlan(ok(await mae().rpc('fn_plan_mantenimiento'))),
    avisos: async (): Promise<AvisoOt[]> => parsearAvisosOt(ok(await mae().rpc('fn_avisos_ot'))),
    visto: async (id: number) => void ok(await mae().rpc('fn_ot_visto', { p_id: id })),
    guardarTarea: async (d: DatosTarea): Promise<number> =>
      Number(
        ok(
          await mae().rpc('fn_guardar_tarea', {
            p_id: d.id,
            p_version: d.version,
            p_nombre: d.nombre,
            p_descripcion: d.descripcion,
            p_aplica: d.aplica,
            p_marca: d.marca,
            p_tipo_semi: d.tipoSemi,
            p_cada_dias: d.cadaDias,
            p_cada_km: d.cadaKm,
            p_aviso_dias: d.avisoDias,
            p_aviso_km: d.avisoKm,
            p_zonas: d.zonas,
            p_prioridad: d.prioridad,
            p_activo: d.activo,
          }),
        ),
      ),
    baseTarea: async (tarea: number, equipo: Equipo, equipoId: number, fecha: string, km: number | null) =>
      void ok(await mae().rpc('fn_base_tarea', { p_tarea: tarea, p_equipo: equipo, p_equipo_id: equipoId, p_fecha: fecha, p_km: km })),
    crearOt: async (d: DatosOt): Promise<number> =>
      Number(
        ok(
          await mae().rpc('fn_crear_ot', {
            p_equipo: d.equipo,
            p_equipo_id: d.equipoId,
            p_titulo: d.titulo,
            p_descripcion: d.descripcion,
            p_zonas: d.zonas,
            p_prioridad: d.prioridad,
            p_fecha_limite: d.fechaLimite,
            p_asignado: d.asignado,
          }),
        ),
      ),
    asignar: async (id: number, usuario: number | null) => void ok(await mae().rpc('fn_asignar_ot', { p_id: id, p_usuario: usuario })),
    iniciar: async (id: number) => void ok(await mae().rpc('fn_iniciar_ot', { p_id: id })),
    terminar: async (d: DatosTerminar) =>
      void ok(
        await mae().rpc('fn_terminar_ot', {
          p_id: d.id,
          p_trabajo: d.trabajo,
          p_km: d.km,
          p_repuestos: d.repuestos,
          p_costo: d.costo,
          p_moneda: d.moneda,
          p_proveedor: d.proveedor,
        }),
      ),
    verificar: async (id: number, okVer: boolean, comentario: string | null) =>
      void ok(await mae().rpc('fn_verificar_ot', { p_id: id, p_ok: okVer, p_comentario: comentario })),
    anular: async (id: number, motivo: string) => void ok(await mae().rpc('fn_anular_ot', { p_id: id, p_motivo: motivo })),
    nota: async (id: number, texto: string) => void ok(await mae().rpc('fn_nota_ot', { p_id: id, p_texto: texto })),
  };
};
