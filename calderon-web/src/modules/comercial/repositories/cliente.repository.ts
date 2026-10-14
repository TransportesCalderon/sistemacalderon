import { ConflictoVersion, RepoError, rangoPagina, textoBusqueda, type Db, type Pagina, type Versionado } from '@/shared/repository/types';
import type { Database } from '@/shared/types/db';
import type { ClienteId, FechaISO } from '@/shared/types/dominio';
import type { ClienteDatos } from '../domain/cliente.schemas';
import {
  TAMANO_PAGINA_CLIENTES,
  esEstadoCliente,
  type Cliente,
  type ClienteFiltros,
  type ClienteListaParams,
  type ClienteParecido,
  type ClienteResumen,
} from '../domain/cliente.types';

/**
 * Repositorio de mae.cliente (arquitectura §8).
 * - Lista: vista mae.v_cliente (solo no eliminados); con "incluir eliminados", la tabla base.
 * - Ficha y escrituras: tabla base mae.cliente. Sin delete.
 * - Parecidos: ILIKE por palabra sobre razón social (acelerado por el índice
 *   trgm_cliente_razon_social), para avisar posibles duplicados al escribir.
 */
const COLS_CLIENTE =
  'id, codigo, razon_social, identificador_fiscal, pais, moneda_facturacion, condicion_pago_dias, segmento, estado, creado_en, creado_por, actualizado_en, actualizado_por, eliminado_en, version_fila';

const COLS_RESUMEN =
  'id, codigo, razon_social, identificador_fiscal, pais, moneda_facturacion, condicion_pago_dias, segmento, estado, eliminado_en, version_fila';

type FilaCliente = Database['mae']['Tables']['cliente']['Row'];
type FilaSeleccion = Omit<FilaCliente, 'eliminado_por'>;
type FilaResumen = Omit<FilaSeleccion, 'creado_en' | 'creado_por' | 'actualizado_en' | 'actualizado_por'>;

export function aClienteResumen(f: FilaResumen): ClienteResumen {
  return {
    id: f.id as ClienteId,
    codigo: f.codigo,
    razonSocial: f.razon_social,
    identificadorFiscal: f.identificador_fiscal,
    pais: f.pais.trim(),
    monedaFacturacion: f.moneda_facturacion.trim(),
    condicionPagoDias: f.condicion_pago_dias,
    segmento: f.segmento,
    estado: esEstadoCliente(f.estado) ? f.estado : 'inactivo',
    versionFila: f.version_fila,
    eliminadoEn: f.eliminado_en as FechaISO | null,
  };
}

export function aCliente(f: FilaSeleccion): Cliente {
  return {
    ...aClienteResumen(f),
    creadoEn: f.creado_en as FechaISO,
    creadoPor: f.creado_por,
    actualizadoEn: f.actualizado_en as FechaISO,
    actualizadoPor: f.actualizado_por,
  };
}

/** Datos del formulario → columnas de mae.cliente. Las de control las fija el trigger. */
export function aFilaCliente(d: ClienteDatos) {
  return {
    codigo: d.codigo,
    razon_social: d.razonSocial,
    identificador_fiscal: d.identificadorFiscal,
    pais: d.pais,
    moneda_facturacion: d.monedaFacturacion,
    condicion_pago_dias: d.condicionPagoDias,
    segmento: d.segmento,
    estado: d.estado,
  } satisfies Database['mae']['Tables']['cliente']['Insert'];
}

/**
 * Filtros de la lista traducidos a PostgREST (función pura). Cada palabra debe aparecer
 * en código, razón social o identificador fiscal (este último también sin guiones,
 * para encontrar "30-71234567-1" escribiendo "3071234567").
 */
export function filtrosClientePostgrest(f: ClienteFiltros): { eq: [string, string][]; or: string[] } {
  const eq: [string, string][] = [];
  if (f.estado) eq.push(['estado', f.estado]);
  if (f.pais) eq.push(['pais', f.pais]);
  if (f.moneda) eq.push(['moneda_facturacion', f.moneda]);
  if (f.segmento) eq.push(['segmento', f.segmento]);

  const t = textoBusqueda(f.texto);
  const palabras = t ? t.split(' ').filter(Boolean).slice(0, 4) : [];
  const or = palabras.map((p) => {
    const condiciones = [`codigo.ilike.*${p}*`, `razon_social.ilike.*${p}*`, `identificador_fiscal.ilike.*${p}*`];
    const sinSeparadores = p.replace(/[-.]/g, '');
    if (sinSeparadores !== p && sinSeparadores.length > 0) condiciones.push(`identificador_fiscal.ilike.*${sinSeparadores}*`);
    return condiciones.join(',');
  });
  return { eq, or };
}

/** Palabras que no distinguen clientes: formas societarias y conectores. */
const PALABRAS_COMUNES = new Set([
  'SA', 'SAS', 'SRL', 'SPA', 'SAU', 'SACI', 'SAIC', 'LTDA', 'LIMITADA', 'EIRL', 'CIA', 'COMPAÑIA', 'COMPANIA',
  'SOCIEDAD', 'ANONIMA', 'ANÓNIMA', 'RESPONSABILIDAD', 'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'EN',
]);

/** Palabras significativas de una razón social (para buscar parecidos). Función pura. */
export function palabrasSignificativas(razonSocial: string): string[] {
  const t = textoBusqueda(razonSocial.replace(/\./g, ''));
  if (!t) return [];
  const unicas = new Set(
    t
      .toUpperCase()
      .split(/[\s-]+/)
      .filter((p) => p.length >= 3 && !PALABRAS_COMUNES.has(p)),
  );
  // Las más largas primero: suelen ser las más distintivas.
  return [...unicas].sort((a, b) => b.length - a.length).slice(0, 4);
}

export interface ClienteRepository {
  listar(p: ClienteListaParams): Promise<Pagina<ClienteResumen>>;
  obtener(id: ClienteId): Promise<Cliente | null>;
  crear(datos: ClienteDatos): Promise<Cliente>;
  actualizar(ref: Versionado, datos: ClienteDatos): Promise<Cliente>;
  /** Hasta 5 clientes con razón social parecida (sin el propio, al editar). */
  parecidos(razonSocial: string, excluirId?: ClienteId): Promise<ClienteParecido[]>;
  /** Segmentos ya usados, para sugerirlos en el formulario y filtrar la lista. */
  segmentos(): Promise<string[]>;
}

export const clienteRepository = (db: Db): ClienteRepository => ({
  async listar(p) {
    const [desde, hasta] = rangoPagina(p.pagina, TAMANO_PAGINA_CLIENTES);
    // La vista v_cliente tiene las mismas columnas que la tabla (SELECT * … WHERE eliminado_en IS NULL).
    const origen = (p.incluirEliminados ? 'cliente' : 'v_cliente') as 'cliente';
    let q = db.schema('mae').from(origen).select(COLS_RESUMEN, { count: 'exact' });

    const { eq, or } = filtrosClientePostgrest(p);
    for (const [col, valor] of eq) q = q.eq(col as 'estado', valor);
    for (const condicion of or) q = q.or(condicion);

    const { data, count, error } = await q
      .order(p.orden, { ascending: p.dir === 'asc', nullsFirst: false })
      .order('id', { ascending: true })
      .range(desde, hasta);
    if (error) throw new RepoError(error);
    return { filas: (data as FilaResumen[]).map(aClienteResumen), total: count };
  },

  async obtener(id) {
    const { data, error } = await db.schema('mae').from('cliente').select(COLS_CLIENTE).eq('id', id).maybeSingle();
    if (error) throw new RepoError(error);
    return data ? aCliente(data as FilaSeleccion) : null;
  },

  async crear(datos) {
    const { data, error } = await db.schema('mae').from('cliente').insert(aFilaCliente(datos)).select(COLS_CLIENTE).single();
    if (error) throw new RepoError(error);
    return aCliente(data as FilaSeleccion);
  },

  async actualizar({ id, versionFila }, datos) {
    // Se envía la versión leída: el trigger aud.fn_columnas_control la compara y la incrementa.
    const { data, error } = await db
      .schema('mae')
      .from('cliente')
      .update({ ...aFilaCliente(datos), version_fila: versionFila })
      .eq('id', id)
      .eq('version_fila', versionFila)
      .select(COLS_CLIENTE)
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) throw new ConflictoVersion('mae.cliente', id);
    return aCliente(data as FilaSeleccion);
  },

  async parecidos(razonSocial, excluirId) {
    const palabras = palabrasSignificativas(razonSocial);
    if (palabras.length === 0) return [];
    let q = db
      .schema('mae')
      .from('v_cliente')
      .select('id, codigo, razon_social, pais, estado')
      .or(palabras.map((p) => `razon_social.ilike.*${p}*`).join(','))
      .limit(30);
    if (excluirId !== undefined) q = q.neq('id', excluirId);
    const { data, error } = await q;
    if (error) throw new RepoError(error);

    return (data as Pick<FilaCliente, 'id' | 'codigo' | 'razon_social' | 'pais' | 'estado'>[])
      .map((f) => {
        const razon = f.razon_social.toUpperCase();
        return {
          id: f.id as ClienteId,
          codigo: f.codigo,
          razonSocial: f.razon_social,
          pais: f.pais.trim(),
          estado: esEstadoCliente(f.estado) ? f.estado : 'inactivo',
          coincidencias: palabras.filter((p) => razon.includes(p)).length,
        };
      })
      .sort((a, b) => b.coincidencias - a.coincidencias || a.razonSocial.localeCompare(b.razonSocial, 'es'))
      .slice(0, 5);
  },

  async segmentos() {
    const { data, error } = await db
      .schema('mae')
      .from('v_cliente')
      .select('segmento')
      .not('segmento', 'is', null)
      .order('segmento')
      .limit(1000);
    if (error) throw new RepoError(error);
    return [...new Set((data as { segmento: string | null }[]).map((f) => f.segmento).filter((s): s is string => Boolean(s)))];
  },
});
