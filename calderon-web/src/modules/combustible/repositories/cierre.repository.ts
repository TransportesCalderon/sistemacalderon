import { ConflictoVersion, RepoError, rangoPagina, type Db, type Pagina, type Versionado } from '@/shared/repository/types';
import type { Database } from '@/shared/types/db';
import type { CamionId, CargaId, ChoferId, CierreViajeId, FechaISO } from '@/shared/types/dominio';
import { diaSiguiente, num, num0 } from '../domain/comun';
import { parsearResultado, parsearVerificacion, resultadoCongelado, type ColumnasCongeladas } from '../domain/cierre.resultado';
import {
  TAMANO_PAGINA_CIERRES,
  esEstadoCierre,
  esTestAlcohol,
  type CierreListaParams,
  type CierreResumen,
  type CierreViaje,
  type DatosBorrador,
  type ResultadoCierre,
  type Verificacion,
} from '../domain/cierre.types';
import { nombresDe } from './catalogo-combustible.repository';

/**
 * Repositorio del cierre de viaje (migraciones 24 y 26). Toda la aritmética y la política viven
 * en la base:
 *  - fue.fn_resultado_cierre(id): resultado en vivo del borrador (pendientes y avisos incluidos);
 *  - fue.fn_aprobar_cierre / fn_anular_cierre: transiciones (SECURITY DEFINER);
 *  - fue.fn_verificar_cierre: verificación desde los hechos.
 * La aplicación solo escribe las columnas del borrador que la base le permite.
 */
type Fila = Database['fue']['Tables']['cierre_viaje']['Row'];

export interface TelemetriaCierre {
  km: number | null;
  fuenteKm: string | null;
  consumoL: number | null;
  fuenteConsumo: string | null;
  programadorPct: number | null;
}
type FilaCierre = Pick<
  Fila,
  | 'id'
  | 'numero'
  | 'camion_id'
  | 'carga_salida_id'
  | 'carga_llegada_id'
  | 'salida_ts'
  | 'llegada_ts'
  | 'estado'
  | 'chofer_responsable_id'
  | 'motivo_chofer'
  | 'programador_velocidad_pct'
  | 'test_alcohol'
  | 'km_manual'
  | 'consumo_plataforma_manual_l'
  | 'motivo_ajuste'
  | 'tractor_no_imputable_l'
  | 'tractor_no_imputable_ralenti_h'
  | 'tractor_no_imputable_motivo'
  | 'tractor_justificacion'
  | 'observaciones'
  | 'huella'
  | 'aprobado_por'
  | 'aprobado_en'
  | 'motivo_anulacion'
  | 'anulado_por'
  | 'anulado_en'
  | 'creado_en'
  | 'eliminado_en'
  | 'version_fila'
> &
  ColumnasCongeladas;

const COLS =
  'id, numero, camion_id, carga_salida_id, carga_llegada_id, salida_ts, llegada_ts, estado, chofer_responsable_id, motivo_chofer, programador_velocidad_pct, test_alcohol, km_manual, consumo_plataforma_manual_l, motivo_ajuste, tractor_no_imputable_l, tractor_no_imputable_ralenti_h, tractor_no_imputable_motivo, tractor_justificacion, observaciones, version_calculo, cargas_l, entradas_l, salidas_l, faltante_salida_l, faltante_llegada_l, libro_l, diferencia_l, tolerancia_l, km_recorridos, fuente_km, consumo_plataforma_l, fuente_consumo_plataforma, horas_motor, horas_ralenti, dias_parado, consumo_l_100km, tractor_diferencia_l, mochila_diferencia_l, imputable_total_l, linea_viaje, huella, detalle, calculado_en, aprobado_por, aprobado_en, motivo_anulacion, anulado_por, anulado_en, creado_en, eliminado_en, version_fila';

const COLS_RESUMEN =
  'id, numero, camion_id, chofer_responsable_id, salida_ts, llegada_ts, estado, linea_viaje, version_calculo, diferencia_l, tractor_diferencia_l, mochila_diferencia_l, imputable_total_l';

export function aCierre(f: FilaCierre): CierreViaje {
  const estado = esEstadoCierre(f.estado) ? f.estado : 'borrador';
  const datos: DatosBorrador = {
    choferResponsableId: f.chofer_responsable_id as ChoferId | null,
    motivoChofer: f.motivo_chofer,
    programadorVelocidadPct: num(f.programador_velocidad_pct),
    testAlcohol: esTestAlcohol(f.test_alcohol) ? f.test_alcohol : null,
    kmManual: num(f.km_manual),
    consumoPlataformaManualL: num(f.consumo_plataforma_manual_l),
    motivoAjuste: f.motivo_ajuste,
    noImputableL: num0(f.tractor_no_imputable_l),
    noImputableRalentiH: num0(f.tractor_no_imputable_ralenti_h),
    noImputableMotivo: f.tractor_no_imputable_motivo,
    justificacion: f.tractor_justificacion,
    observaciones: f.observaciones,
  };
  return {
    id: f.id as CierreViajeId,
    numero: f.numero,
    camionId: f.camion_id as CamionId,
    cargaSalidaId: f.carga_salida_id as CargaId,
    cargaLlegadaId: f.carga_llegada_id as CargaId,
    salidaTs: f.salida_ts as FechaISO,
    llegadaTs: f.llegada_ts as FechaISO,
    estado,
    datos,
    // Un cierre anulado después de aprobado conserva lo que se congeló.
    congelado: f.aprobado_en ? resultadoCongelado(f) : null,
    huella: f.huella,
    aprobadoPor: f.aprobado_por,
    aprobadoEn: f.aprobado_en as FechaISO | null,
    motivoAnulacion: f.motivo_anulacion,
    anuladoPor: f.anulado_por,
    anuladoEn: f.anulado_en as FechaISO | null,
    creadoEn: f.creado_en as FechaISO,
    versionFila: f.version_fila,
    eliminadoEn: f.eliminado_en as FechaISO | null,
  };
}

/** DatosBorrador → columnas de fue.cierre_viaje que la aplicación puede escribir. */
function aFila(d: DatosBorrador) {
  return {
    chofer_responsable_id: d.choferResponsableId,
    motivo_chofer: d.motivoChofer,
    programador_velocidad_pct: d.programadorVelocidadPct,
    test_alcohol: d.testAlcohol,
    km_manual: d.kmManual,
    consumo_plataforma_manual_l: d.consumoPlataformaManualL,
    motivo_ajuste: d.motivoAjuste,
    // Desde la migración 26 son el no imputable y la justificación del camión entero
    tractor_no_imputable_l: d.noImputableL,
    tractor_no_imputable_ralenti_h: d.noImputableRalentiH,
    tractor_no_imputable_motivo: d.noImputableMotivo,
    tractor_justificacion: d.justificacion,
    observaciones: d.observaciones,
  } satisfies Database['fue']['Tables']['cierre_viaje']['Update'];
}

export const cierreRepository = (db: Db) => ({
  async listar(p: CierreListaParams): Promise<Pagina<CierreResumen>> {
    const [desde, hasta] = rangoPagina(p.pagina, TAMANO_PAGINA_CIERRES);
    let q = db.schema('fue').from('v_cierre_viaje').select(COLS_RESUMEN, { count: 'exact' });
    if (p.camionId !== undefined) q = q.eq('camion_id', p.camionId);
    if (p.estado) q = q.eq('estado', p.estado);
    if (p.desde) q = q.gte('salida_ts', `${p.desde}T00:00:00Z`);
    if (p.hasta) q = q.lt('salida_ts', `${diaSiguiente(p.hasta)}T00:00:00Z`);
    if (p.conImputable) q = q.gt('imputable_total_l', 0);
    const { data, count, error } = await q.order('salida_ts', { ascending: false }).order('id', { ascending: false }).range(desde, hasta);
    if (error) throw new RepoError(error);
    const filas = data as Pick<
      Fila,
      | 'id'
      | 'numero'
      | 'camion_id'
      | 'chofer_responsable_id'
      | 'salida_ts'
      | 'llegada_ts'
      | 'estado'
      | 'linea_viaje'
      | 'version_calculo'
      | 'diferencia_l'
      | 'tractor_diferencia_l'
      | 'mochila_diferencia_l'
      | 'imputable_total_l'
    >[];
    const nombres = await nombresDe(db, { camiones: filas.map((f) => f.camion_id), choferes: filas.map((f) => f.chofer_responsable_id ?? NaN) });
    return {
      filas: filas.map((f) => ({
        id: f.id as CierreViajeId,
        numero: f.numero,
        camionId: f.camion_id as CamionId,
        camionPatente: nombres.patente.get(f.camion_id) ?? null,
        choferNombre: f.chofer_responsable_id === null ? null : (nombres.chofer.get(f.chofer_responsable_id) ?? null),
        salidaTs: f.salida_ts as FechaISO,
        llegadaTs: f.llegada_ts as FechaISO,
        estado: esEstadoCierre(f.estado) ? f.estado : 'borrador',
        lineaViaje: f.linea_viaje,
        // Modelo anterior a la 26: la suma de las dos diferencias, solo para mostrar
        diferenciaL:
          f.version_calculo === 1 && f.tractor_diferencia_l !== null
            ? Number(f.tractor_diferencia_l) + (num(f.mochila_diferencia_l) ?? 0)
            : num(f.diferencia_l),
        imputableTotalL: num(f.imputable_total_l),
      })),
      total: count,
    };
  },

  async obtener(id: CierreViajeId): Promise<CierreViaje | null> {
    const { data, error } = await db.schema('fue').from('v_cierre_viaje').select(COLS).eq('id', id).maybeSingle();
    if (error) throw new RepoError(error);
    return data ? aCierre(data as FilaCierre) : null;
  },

  /** Cierre no anulado de un viaje (por su frontera de salida). */
  async deViaje(cargaSalidaId: number): Promise<CierreViajeId | null> {
    const { data, error } = await db.schema('fue').from('v_cierre_viaje').select('id').eq('carga_salida_id', cargaSalidaId).neq('estado', 'anulado').maybeSingle();
    if (error) throw new RepoError(error);
    return (data?.id as CierreViajeId | undefined) ?? null;
  },

  async resultado(id: CierreViajeId): Promise<ResultadoCierre> {
    const { data, error } = await db.schema('fue').rpc('fn_resultado_cierre', { p_id: id });
    if (error) throw new RepoError(error);
    return parsearResultado(data);
  },

  /** Migración 53: lo que dice la telemetría para el cierre (sin los ajustes manuales). */
  async telemetria(id: CierreViajeId): Promise<TelemetriaCierre> {
    const { data, error } = await db.schema('fue').rpc('fn_telemetria_cierre', { p_cierre: id });
    if (error) throw new RepoError(error);
    const x = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
    const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
    const t = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      km: n(x.km),
      fuenteKm: t(x.fuente_km),
      consumoL: n(x.consumo_l),
      fuenteConsumo: t(x.fuente_consumo),
      programadorPct: n(x.programador_pct),
    };
  },

  async verificar(id: CierreViajeId): Promise<Verificacion> {
    const { data, error } = await db.schema('fue').rpc('fn_verificar_cierre', { p_id: id });
    if (error) throw new RepoError(error);
    return parsearVerificacion(data);
  },

  async crear(camionId: number, cargaSalidaId: number): Promise<CierreViaje> {
    const { data, error } = await db.schema('fue').from('cierre_viaje').insert({ camion_id: camionId, carga_salida_id: cargaSalidaId }).select(COLS).single();
    if (error) throw new RepoError(error);
    return aCierre(data as FilaCierre);
  },

  /** Guarda los datos del borrador. Sin datos: solo vuelve a guardar (la base toma la llegada vigente). */
  async guardar({ id, versionFila }: Versionado, datos?: DatosBorrador): Promise<CierreViaje> {
    const { data, error } = await db
      .schema('fue')
      .from('cierre_viaje')
      .update({ ...(datos ? aFila(datos) : {}), version_fila: versionFila })
      .eq('id', id)
      .eq('version_fila', versionFila)
      .select(COLS)
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) throw new ConflictoVersion('fue.cierre_viaje', id);
    return aCierre(data as FilaCierre);
  },

  async aprobar({ id, versionFila }: Versionado): Promise<CierreViaje> {
    const { data, error } = await db.schema('fue').rpc('fn_aprobar_cierre', { p_id: id, p_version: versionFila });
    if (error) throw new RepoError(error);
    return aCierre(data as unknown as FilaCierre);
  },

  async anular({ id, versionFila }: Versionado, motivo: string): Promise<CierreViaje> {
    const { data, error } = await db.schema('fue').rpc('fn_anular_cierre', { p_id: id, p_version: versionFila, p_motivo: motivo });
    if (error) throw new RepoError(error);
    return aCierre(data as unknown as FilaCierre);
  },
});
