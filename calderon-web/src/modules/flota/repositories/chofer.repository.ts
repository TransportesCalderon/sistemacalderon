import { ConflictoVersion, RepoError, rangoPagina, textoBusqueda, type Db, type Pagina, type Versionado } from '@/shared/repository/types';
import type { Database } from '@/shared/types/db';
import type { ChoferId, FechaDia, FechaISO } from '@/shared/types/dominio';
import type { ChoferDatos } from '../domain/chofer.schemas';
import {
  TAMANO_PAGINA_CHOFERES,
  esEstadoChofer,
  esTipoDocumento,
  type Chofer,
  type ChoferFiltros,
  type ChoferListaParams,
  type ChoferResumen,
  type DocumentoChofer,
} from '../domain/chofer.types';

/**
 * Repositorio de mae.chofer (arquitectura §8).
 *
 * Datos personales: ninguna constante de columnas incluye documento_tipo ni
 * documento_numero (el rol tc_lectura ni siquiera tiene permiso sobre ellas). El
 * documento solo se lee en revelarDocumento(), que antes registra el acceso.
 *
 * La lista lee la tabla base con eliminado_en IS NULL en lugar de la vista v_chofer:
 * el DDL concede a tc_lectura (Gerencia) solo columnas de mae.chofer, no la vista.
 */
const COLS_CHOFER =
  'id, legajo, nombre, apellido, pais_residencia, base_ubicacion_id, categoria_liquidacion, fecha_ingreso, fecha_egreso, estado, id_conductor_optifleet, creado_en, creado_por, actualizado_en, actualizado_por, eliminado_en, version_fila';

const COLS_RESUMEN =
  'id, legajo, nombre, apellido, pais_residencia, base_ubicacion_id, categoria_liquidacion, fecha_ingreso, fecha_egreso, estado, eliminado_en, version_fila';

type FilaChofer = Database['mae']['Tables']['chofer']['Row'];
type FilaSeleccion = Omit<FilaChofer, 'documento_tipo' | 'documento_numero' | 'eliminado_por'>;
type FilaResumen = Pick<
  FilaChofer,
  | 'id'
  | 'legajo'
  | 'nombre'
  | 'apellido'
  | 'pais_residencia'
  | 'base_ubicacion_id'
  | 'categoria_liquidacion'
  | 'fecha_ingreso'
  | 'fecha_egreso'
  | 'estado'
  | 'eliminado_en'
  | 'version_fila'
>;

export function aChoferResumen(f: FilaResumen): ChoferResumen {
  return {
    id: f.id as ChoferId,
    legajo: f.legajo,
    nombre: f.nombre,
    apellido: f.apellido,
    paisResidencia: f.pais_residencia.trim(),
    baseUbicacionId: f.base_ubicacion_id,
    categoriaLiquidacion: f.categoria_liquidacion,
    fechaIngreso: f.fecha_ingreso as FechaDia,
    fechaEgreso: f.fecha_egreso as FechaDia | null,
    estado: esEstadoChofer(f.estado) ? f.estado : 'baja',
    versionFila: f.version_fila,
    eliminadoEn: f.eliminado_en as FechaISO | null,
  };
}

export function aChofer(f: FilaSeleccion): Chofer {
  return {
    ...aChoferResumen(f),
    idConductorOptifleet: f.id_conductor_optifleet,
    creadoEn: f.creado_en as FechaISO,
    creadoPor: f.creado_por,
    actualizadoEn: f.actualizado_en as FechaISO,
    actualizadoPor: f.actualizado_por,
  };
}

/** Datos del formulario → columnas (sin documento). Las de control las fija el trigger. */
export function aFilaChofer(d: ChoferDatos) {
  return {
    legajo: d.legajo,
    nombre: d.nombre,
    apellido: d.apellido,
    pais_residencia: d.paisResidencia,
    base_ubicacion_id: d.baseUbicacionId,
    categoria_liquidacion: d.categoriaLiquidacion,
    fecha_ingreso: d.fechaIngreso,
    fecha_egreso: d.fechaEgreso,
    estado: d.estado,
    id_conductor_optifleet: d.idConductorOptifleet,
  } satisfies Database['mae']['Tables']['chofer']['Update'];
}

/**
 * Filtros de la lista traducidos a PostgREST (función pura).
 * La búsqueda exige que cada palabra aparezca en alguna columna: "juan perez" encuentra
 * nombre = Juan y apellido = Pérez. Nunca busca en el documento.
 */
export function filtrosChoferPostgrest(f: ChoferFiltros): { eq: [string, string | number][]; or: string[] } {
  const eq: [string, string | number][] = [];
  if (f.estado) eq.push(['estado', f.estado]);
  if (f.pais) eq.push(['pais_residencia', f.pais]);
  if (f.baseId !== undefined) eq.push(['base_ubicacion_id', f.baseId]);

  const t = textoBusqueda(f.texto);
  const palabras = t ? t.split(' ').filter(Boolean).slice(0, 4) : [];
  const or = palabras.map((p) =>
    ['legajo', 'nombre', 'apellido', 'id_conductor_optifleet'].map((c) => `${c}.ilike.*${p}*`).join(','),
  );
  return { eq, or };
}

export interface ChoferRepository {
  listar(p: ChoferListaParams): Promise<Pagina<ChoferResumen>>;
  obtener(id: ChoferId): Promise<Chofer | null>;
  crear(datos: ChoferDatos, documento: DocumentoChofer): Promise<Chofer>;
  actualizar(ref: Versionado, datos: ChoferDatos, documento: DocumentoChofer | null): Promise<Chofer>;
  /** Registra el acceso en aud.acceso_sensible y recién entonces lee el documento. */
  revelarDocumento(id: ChoferId, contexto: { motivo: string; ip: string | null }): Promise<DocumentoChofer | null>;
}

export const choferRepository = (db: Db): ChoferRepository => ({
  async listar(p) {
    const [desde, hasta] = rangoPagina(p.pagina, TAMANO_PAGINA_CHOFERES);
    let q = db.schema('mae').from('chofer').select(COLS_RESUMEN, { count: 'exact' });
    if (!p.incluirEliminados) q = q.is('eliminado_en', null);

    const { eq, or } = filtrosChoferPostgrest(p);
    for (const [col, valor] of eq) q = q.eq(col as 'estado', valor as string);
    for (const condicion of or) q = q.or(condicion);

    q = q.order(p.orden, { ascending: p.dir === 'asc', nullsFirst: false });
    if (p.orden === 'apellido') q = q.order('nombre', { ascending: p.dir === 'asc' });
    const { data, count, error } = await q.order('id', { ascending: true }).range(desde, hasta);
    if (error) throw new RepoError(error);
    return { filas: (data as FilaResumen[]).map(aChoferResumen), total: count };
  },

  async obtener(id) {
    const { data, error } = await db.schema('mae').from('chofer').select(COLS_CHOFER).eq('id', id).maybeSingle();
    if (error) throw new RepoError(error);
    return data ? aChofer(data as FilaSeleccion) : null;
  },

  async crear(datos, documento) {
    const { data, error } = await db
      .schema('mae')
      .from('chofer')
      .insert({ ...aFilaChofer(datos), documento_tipo: documento.tipo, documento_numero: documento.numero })
      .select(COLS_CHOFER)
      .single();
    if (error) throw new RepoError(error);
    return aChofer(data as FilaSeleccion);
  },

  async actualizar({ id, versionFila }, datos, documento) {
    const cambios = {
      ...aFilaChofer(datos),
      ...(documento ? { documento_tipo: documento.tipo, documento_numero: documento.numero } : {}),
      version_fila: versionFila,
    };
    const { data, error } = await db
      .schema('mae')
      .from('chofer')
      .update(cambios)
      .eq('id', id)
      .eq('version_fila', versionFila)
      .select(COLS_CHOFER)
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) throw new ConflictoVersion('mae.chofer', id);
    return aChofer(data as FilaSeleccion);
  },

  async revelarDocumento(id, { motivo, ip }) {
    // 1) Registro del acceso. Si no se puede registrar, no se muestra (falla cerrado).
    const registro = await db.schema('aud').rpc('fn_registrar_acceso_sensible', {
      p_tipo_acceso: 'lectura',
      p_esquema: 'mae',
      p_tabla: 'chofer',
      p_fila_ids: [id],
      p_cantidad: 1,
      p_motivo: motivo,
      ...(ip ? { p_ip: ip } : {}),
    });
    if (registro.error) throw new RepoError(registro.error);

    // 2) Lectura del documento.
    const { data, error } = await db
      .schema('mae')
      .from('chofer')
      .select('documento_tipo, documento_numero')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) return null;
    return { tipo: esTipoDocumento(data.documento_tipo) ? data.documento_tipo : 'OTRO', numero: data.documento_numero };
  },
});
