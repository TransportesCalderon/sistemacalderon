import { ConflictoVersion, RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/db';
import type { FechaDia, FechaISO } from '@/shared/types/dominio';
import type {
  EdicionPizarraDatos,
  Eliminar,
  GensetDatos,
  InstalarGensetDatos,
  SemiDatos,
  TipoAccesorioDatos,
} from '../domain/pizarra.schemas';
import {
  esEstadoUnidad,
  type Alerta,
  type ColumnaAccesorio,
  type EstadoSemi,
  type FilaPizarra,
  type Genset,
  type Lugar,
  type Semi,
  type TipoAccesorio,
  type TipoSemi,
} from '../domain/pizarra.types';
import { parsearSigue, type SigueFila } from '../domain/pizarra.sigue';

function accesorios(j: Json): Record<number, number> {
  const r: Record<number, number> = {};
  if (j && typeof j === 'object' && !Array.isArray(j)) for (const [k, v] of Object.entries(j)) if (typeof v === 'number') r[Number(k)] = v;
  return r;
}

function alertas(j: Json): Alerta[] {
  if (!Array.isArray(j)) return [];
  return j.flatMap((a) =>
    a && typeof a === 'object' && !Array.isArray(a) && typeof a.codigo === 'string' && typeof a.texto === 'string'
      ? [{ codigo: a.codigo, nivel: a.nivel === 'critico' ? ('critico' as const) : ('aviso' as const), texto: a.texto }]
      : [],
  );
}

const FUENTES = ['telemetria', 'evento', 'playa', 'ultimo_destino'] as const;

/** Pizarra Azul y sus catálogos (migración 39). La base valida; su mensaje se muestra tal cual. */
export const pizarraRepository = (db: Db) => {
  const mae = () => db.schema('mae');

  async function actualizar(
    tabla: 'semirremolque' | 'genset' | 'ubicacion',
    idFila: number,
    version: number,
    cambios: Record<string, unknown>,
  ): Promise<void> {
    const { data, error } = await mae()
      .from(tabla)
      .update({ ...cambios, version_fila: version } as never)
      .eq('id', idFila)
      .eq('version_fila', version)
      .select('id')
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) throw new ConflictoVersion(`mae.${tabla}`, idFila);
  }

  return {
    // ------------------------------------------------------------- pizarra
    /** Sprint 6 (migración 118): «lo que sigue» de cada fila, por semi. */
    async sigue(): Promise<Map<number, SigueFila>> {
      const { data, error } = await db.schema('ops').rpc('fn_pizarra_sigue');
      if (error) throw new RepoError(error);
      return parsearSigue(data);
    },
    async filas(): Promise<FilaPizarra[]> {
      const { data, error } = await db.schema('ops').rpc('fn_pizarra');
      if (error) throw new RepoError(error);
      return (data ?? []).map((f) => ({
        semiId: f.semi_id,
        patente: f.patente,
        codigoInterno: f.codigo_interno,
        tipo: f.tipo,
        estado: esEstadoUnidad(f.estado) ? f.estado : 'disponible',
        taraFecha: f.tara_fecha as FechaDia | null,
        taraDias: f.tara_dias,
        accesorios: accesorios(f.accesorios),
        gensetCodigo: f.genset_codigo,
        gensetDesde: f.genset_desde as FechaISO | null,
        tramoId: f.tramo_id,
        // Sprint 5: los ids para editar tractor, chofer y genset desde la fila
        gensetId: f.genset_id,
        camionId: f.camion_id,
        choferId: f.chofer_id,
        servicioId: f.servicio_id,
        tractor: f.tractor_patente,
        chofer: f.chofer_nombre,
        numeroServicio: f.numero_servicio,
        cliente: f.cliente,
        producto: f.producto,
        contenedor: f.contenedor,
        taraMaxDias: f.tara_max_dias,
        salidaTs: f.salida_ts as FechaISO | null,
        salidaLugar: f.salida_lugar,
        destino: f.destino,
        descarga: f.descarga_programada as FechaISO | null,
        proxima:
          f.proximo_servicio_id === null
            ? null
            : {
                cliente: f.proxima_cliente,
                producto: f.proxima_producto,
                fecha: f.proxima_fecha as FechaISO | null,
                lugar: f.proxima_lugar,
                taraMaxDias: f.proxima_tara_max_dias,
              },
        ubicacion: f.ubicacion,
        ubicacionFuente: (FUENTES as readonly string[]).includes(f.ubicacion_fuente ?? '')
          ? (f.ubicacion_fuente as FilaPizarra['ubicacionFuente'])
          : null,
        ubicacionTs: f.ubicacion_ts as FechaISO | null,
        observacion: f.observacion,
        observacionPor: f.observacion_por,
        observacionEn: f.observacion_en as FechaISO | null,
        alertas: alertas(f.alertas),
        versionFila: f.version_fila,
      }));
    },

    async columnasAccesorio(): Promise<ColumnaAccesorio[]> {
      const { data, error } = await db.schema('ops').rpc('fn_pizarra_totales');
      if (error) throw new RepoError(error);
      return (data ?? []).map((t) => ({
        id: t.tipo_accesorio_id,
        nombre: t.nombre,
        sigla: t.sigla,
        orden: t.orden,
        total: Number(t.total),
        semisConDato: Number(t.semis_con_dato),
      }));
    },

    async lugares(): Promise<Lugar[]> {
      const { data, error } = await mae().from('ubicacion').select('id, nombre, tipo').is('eliminado_en', null).order('nombre');
      if (error) throw new RepoError(error);
      return data.map((u) => ({ id: u.id, nombre: u.nombre, tipo: u.tipo }));
    },

    /** Lugar en playa, observación y accesorios, todo junto (devuelve la versión nueva de la fila). */
    async guardarEdicion(d: EdicionPizarraDatos): Promise<number> {
      const { data, error } = await db.schema('ops').rpc('fn_guardar_semi_pizarra', {
        p_semi: d.semiId,
        p_version: d.versionFila,
        p_ubicacion_playa: d.lugarId,
        p_observacion: d.observacion,
        p_accesorios: d.accesorios as Json,
      });
      if (error) throw new RepoError(error);
      return data;
    },

    // --------------------------------------------------------------- semis
    async semis(): Promise<Semi[]> {
      const { data, error } = await mae()
        .from('semirremolque')
        .select('id, codigo_interno, patente, pais_patente, tipo, capacidad_kg, tiene_equipo_frio, estado, tara_fecha, version_fila')
        .is('eliminado_en', null)
        .order('patente');
      if (error) throw new RepoError(error);
      return data.map((s) => ({
        id: s.id,
        codigoInterno: s.codigo_interno,
        patente: s.patente,
        paisPatente: s.pais_patente.trim(),
        tipo: s.tipo as TipoSemi,
        capacidadKg: Number(s.capacidad_kg),
        tieneEquipoFrio: s.tiene_equipo_frio,
        estado: s.estado as EstadoSemi,
        taraFecha: s.tara_fecha as FechaDia | null,
        versionFila: s.version_fila,
      }));
    },

    async guardarSemi(d: SemiDatos): Promise<void> {
      const fila = {
        codigo_interno: d.codigoInterno,
        patente: d.patente,
        pais_patente: d.paisPatente,
        tipo: d.tipo,
        capacidad_kg: d.capacidadKg,
        tiene_equipo_frio: d.tieneEquipoFrio,
        estado: d.estado,
        tara_fecha: d.taraFecha,
      };
      if (d.id === null) {
        const { error } = await mae().from('semirremolque').insert(fila);
        if (error) throw new RepoError(error);
        return;
      }
      await actualizar('semirremolque', d.id, d.versionFila ?? 0, fila);
    },

    async bajaSemi(d: Eliminar): Promise<void> {
      await actualizar('semirremolque', d.id, d.versionFila, { eliminado_en: new Date().toISOString() });
    },

    // -------------------------------------------------- tipos de accesorio
    async tiposAccesorio(): Promise<TipoAccesorio[]> {
      const { data, error } = await db
        .schema('ref')
        .from('tipo_accesorio')
        .select('id, nombre, sigla, orden, activo, version_fila')
        .is('eliminado_en', null)
        .order('orden')
        .order('nombre');
      if (error) throw new RepoError(error);
      return data.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        sigla: t.sigla,
        orden: t.orden,
        activo: t.activo,
        versionFila: t.version_fila,
      }));
    },

    async guardarTipoAccesorio(d: TipoAccesorioDatos): Promise<void> {
      const fila = { nombre: d.nombre, sigla: d.sigla, orden: d.orden, activo: d.activo };
      if (d.id === null) {
        const { error } = await db.schema('ref').from('tipo_accesorio').insert(fila);
        if (error) throw new RepoError(error);
        return;
      }
      const { data, error } = await db
        .schema('ref')
        .from('tipo_accesorio')
        .update({ ...fila, version_fila: d.versionFila ?? 0 })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila ?? 0)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('ref.tipo_accesorio', d.id);
    },

    async eliminarTipoAccesorio(d: Eliminar): Promise<void> {
      const { data, error } = await db
        .schema('ref')
        .from('tipo_accesorio')
        .update({ eliminado_en: new Date().toISOString(), version_fila: d.versionFila })
        .eq('id', d.id)
        .eq('version_fila', d.versionFila)
        .select('id')
        .maybeSingle();
      if (error) throw new RepoError(error);
      if (!data) throw new ConflictoVersion('ref.tipo_accesorio', d.id);
    },

    // ------------------------------------------------------------- gensets
    async gensets(): Promise<Genset[]> {
      const [g, i, s] = await Promise.all([
        mae()
          .from('genset')
          .select('id, codigo, marca, modelo, numero_serie, estado, observaciones, capacidad_l, consumo_lh, version_fila')
          .is('eliminado_en', null)
          .order('codigo'),
        mae().from('genset_instalacion').select('genset_id, semirremolque_id, desde').is('hasta', null).is('eliminado_en', null),
        mae().from('semirremolque').select('id, patente').is('eliminado_en', null),
      ]);
      for (const r of [g, i, s]) if (r.error) throw new RepoError(r.error);
      const patente = new Map((s.data ?? []).map((x) => [x.id, x.patente]));
      const inst = new Map((i.data ?? []).map((x) => [x.genset_id, x]));
      // Orden natural: GS9, GS82, GS84, GS100 (no GS100 antes que GS82)
      const ordenados = [...(g.data ?? [])].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true, sensitivity: 'base' }));
      return ordenados.map((x) => {
        const v = inst.get(x.id);
        return {
          id: x.id,
          codigo: x.codigo,
          marca: x.marca,
          modelo: x.modelo,
          numeroSerie: x.numero_serie,
          estado: x.estado === 'baja' ? 'baja' : 'activo',
          observaciones: x.observaciones,
          capacidadL: x.capacidad_l === null ? null : Number(x.capacidad_l),
          consumoLh: x.consumo_lh === null ? null : Number(x.consumo_lh),
          versionFila: x.version_fila,
          semiId: v?.semirremolque_id ?? null,
          semiPatente: v ? (patente.get(v.semirremolque_id) ?? `#${v.semirremolque_id}`) : null,
          instaladoDesde: (v?.desde ?? null) as FechaISO | null,
        };
      });
    },

    async guardarGenset(d: GensetDatos): Promise<void> {
      const fila = {
        codigo: d.codigo,
        marca: d.marca,
        modelo: d.modelo,
        numero_serie: d.numeroSerie,
        estado: d.estado,
        observaciones: d.observaciones,
        capacidad_l: d.capacidadL,
        consumo_lh: d.consumoLh,
      };
      if (d.id === null) {
        const { error } = await mae().from('genset').insert(fila);
        if (error) throw new RepoError(error);
        return;
      }
      await actualizar('genset', d.id, d.versionFila ?? 0, fila);
    },

    async eliminarGenset(d: Eliminar): Promise<void> {
      await actualizar('genset', d.id, d.versionFila, { eliminado_en: new Date().toISOString() });
    },

    async instalarGenset(d: InstalarGensetDatos): Promise<void> {
      const { error } = await mae().rpc('fn_instalar_genset', { p_genset: d.gensetId, p_semi: d.semiId as number });
      if (error) throw new RepoError(error);
    },

    async retirarGenset(semiId: number): Promise<void> {
      const { error } = await mae().rpc('fn_retirar_genset', { p_semi: semiId });
      if (error) throw new RepoError(error);
    },
  };
};
