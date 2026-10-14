import { ConflictoVersion, RepoError, rangoPagina, textoBusqueda, type Db, type Pagina, type Versionado } from '@/shared/repository/types';
import type { Database } from '@/shared/types/db';
import type { CamionId, DecimalStr, FechaDia, FechaISO } from '@/shared/types/dominio';
import type { CamionDatos } from '../domain/camion.schemas';
import {
  TAMANO_PAGINA_CAMIONES,
  esEstadoCamion,
  esPropietarioCamion,
  type Camion,
  type CamionFiltros,
  type CamionListaParams,
  type CamionResumen,
} from '../domain/camion.types';

/**
 * Repositorio de mae.camion (arquitectura §8).
 * - Lista: vista mae.v_camion (solo no eliminados); con "incluir eliminados", la tabla base.
 * - Ficha y escrituras: tabla base mae.camion.
 * - Sin delete: este repositorio no borra (la baja operativa es estado + fecha de baja).
 * - numeric viaja como texto (::text) para no perder precisión.
 */
const COLS_CAMION =
  'id, codigo_interno, patente, pais_patente, vin, marca, modelo, anio, tipo_combustible_id, fecha_alta, fecha_baja, estado, propietario_tipo, consumo_referencia_l_100km::text, id_optifleet, creado_en, creado_por, actualizado_en, actualizado_por, eliminado_en, version_fila';

const COLS_RESUMEN =
  'id, codigo_interno, patente, pais_patente, marca, modelo, anio, tipo_combustible_id, fecha_alta, fecha_baja, estado, propietario_tipo, eliminado_en, version_fila';

type FilaCamion = Database['mae']['Tables']['camion']['Row'];
type FilaSeleccion = Omit<FilaCamion, 'consumo_referencia_l_100km' | 'eliminado_por'> & {
  consumo_referencia_l_100km: string | null;
};
type FilaResumen = Pick<
  FilaCamion,
  | 'id'
  | 'codigo_interno'
  | 'patente'
  | 'pais_patente'
  | 'marca'
  | 'modelo'
  | 'anio'
  | 'tipo_combustible_id'
  | 'fecha_alta'
  | 'fecha_baja'
  | 'estado'
  | 'propietario_tipo'
  | 'eliminado_en'
  | 'version_fila'
>;

function estadoDe(v: string): Camion['estado'] {
  return esEstadoCamion(v) ? v : 'inactivo';
}
function propietarioDe(v: string): Camion['propietarioTipo'] {
  return esPropietarioCamion(v) ? v : 'propio';
}

export function aCamionResumen(f: FilaResumen): CamionResumen {
  return {
    id: f.id as CamionId,
    codigoInterno: f.codigo_interno,
    patente: f.patente,
    paisPatente: f.pais_patente.trim(),
    marca: f.marca,
    modelo: f.modelo,
    anio: f.anio,
    tipoCombustibleId: f.tipo_combustible_id,
    fechaAlta: f.fecha_alta as FechaDia,
    fechaBaja: f.fecha_baja as FechaDia | null,
    estado: estadoDe(f.estado),
    propietarioTipo: propietarioDe(f.propietario_tipo),
    versionFila: f.version_fila,
    eliminadoEn: f.eliminado_en as FechaISO | null,
  };
}

export function aCamion(f: FilaSeleccion): Camion {
  return {
    ...aCamionResumen(f),
    vin: f.vin,
    consumoReferencia: f.consumo_referencia_l_100km as DecimalStr | null,
    idOptifleet: f.id_optifleet,
    creadoEn: f.creado_en as FechaISO,
    creadoPor: f.creado_por,
    actualizadoEn: f.actualizado_en as FechaISO,
    actualizadoPor: f.actualizado_por,
  };
}

/** Datos del formulario → columnas de mae.camion. Las columnas de control las fija el trigger. */
export function aFilaCamion(d: CamionDatos) {
  return {
    codigo_interno: d.codigoInterno,
    patente: d.patente,
    pais_patente: d.paisPatente,
    vin: d.vin,
    marca: d.marca,
    modelo: d.modelo,
    anio: d.anio,
    tipo_combustible_id: d.tipoCombustibleId,
    fecha_alta: d.fechaAlta,
    fecha_baja: d.fechaBaja,
    estado: d.estado,
    propietario_tipo: d.propietarioTipo,
    // numeric(6,2) ≤ 9999,99: el número JSON se serializa exacto (p. ej. 32.45)
    consumo_referencia_l_100km: d.consumoReferencia === null ? null : Number(d.consumoReferencia),
    id_optifleet: d.idOptifleet,
  } satisfies Database['mae']['Tables']['camion']['Insert'];
}

/** Filtros de la lista traducidos a PostgREST. Función pura (se prueba sin base). */
export function filtrosCamionPostgrest(f: CamionFiltros): { eq: [string, string | number][]; or: string | null } {
  const eq: [string, string | number][] = [];
  if (f.estado) eq.push(['estado', f.estado]);
  if (f.propietario) eq.push(['propietario_tipo', f.propietario]);
  if (f.pais) eq.push(['pais_patente', f.pais]);
  if (f.tipoCombustibleId !== undefined) eq.push(['tipo_combustible_id', f.tipoCombustibleId]);

  const t = textoBusqueda(f.texto);
  const or = t
    ? ['codigo_interno', 'patente', 'marca', 'modelo', 'vin'].map((c) => `${c}.ilike.*${t.replace(/ /g, '*')}*`).join(',')
    : null;
  return { eq, or };
}

export interface CamionRepository {
  listar(p: CamionListaParams): Promise<Pagina<CamionResumen>>;
  obtener(id: CamionId): Promise<Camion | null>;
  crear(datos: CamionDatos): Promise<Camion>;
  actualizar(ref: Versionado, datos: CamionDatos): Promise<Camion>;
}

export const camionRepository = (db: Db): CamionRepository => ({
  async listar(p) {
    const [desde, hasta] = rangoPagina(p.pagina, TAMANO_PAGINA_CAMIONES);
    // La vista v_camion tiene las mismas columnas que la tabla (SELECT * … WHERE eliminado_en IS NULL).
    const origen = (p.incluirEliminados ? 'camion' : 'v_camion') as 'camion';
    // Maestro chico: el conteo exacto es barato y da la paginación precisa.
    let q = db.schema('mae').from(origen).select(COLS_RESUMEN, { count: 'exact' });

    const { eq, or } = filtrosCamionPostgrest(p);
    for (const [col, valor] of eq) q = q.eq(col as 'estado', valor as string);
    if (or) q = q.or(or);

    const { data, count, error } = await q
      .order(p.orden, { ascending: p.dir === 'asc', nullsFirst: false })
      .order('id', { ascending: true })
      .range(desde, hasta);
    if (error) throw new RepoError(error);
    return { filas: (data as FilaResumen[]).map(aCamionResumen), total: count };
  },

  async obtener(id) {
    const { data, error } = await db.schema('mae').from('camion').select(COLS_CAMION).eq('id', id).maybeSingle();
    if (error) throw new RepoError(error);
    return data ? aCamion(data as unknown as FilaSeleccion) : null;
  },

  async crear(datos) {
    const { data, error } = await db.schema('mae').from('camion').insert(aFilaCamion(datos)).select(COLS_CAMION).single();
    if (error) throw new RepoError(error);
    return aCamion(data as unknown as FilaSeleccion);
  },

  async actualizar({ id, versionFila }, datos) {
    // Se envía la versión leída: el trigger aud.fn_columnas_control la compara y la incrementa.
    const { data, error } = await db
      .schema('mae')
      .from('camion')
      .update({ ...aFilaCamion(datos), version_fila: versionFila })
      .eq('id', id)
      .eq('version_fila', versionFila)
      .select(COLS_CAMION)
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) throw new ConflictoVersion('mae.camion', id);
    return aCamion(data as unknown as FilaSeleccion);
  },
});
