import { RepoError, rangoPagina, type Db, type Pagina } from '@/shared/repository/types';
import type { CamionId, CargaId, FechaDia, FechaISO } from '@/shared/types/dominio';
import { esEstadoValidacion, type EstadoValidacion } from '../domain/carga.types';
import type { z } from 'zod';
import type { documentoSchema } from '../domain/documento.schemas';
import { esTipoDocumento, type Bandeja, type DocumentoCarga } from '../domain/documento.types';
import { nombresDe } from './catalogo-combustible.repository';

export interface CargaEnBandeja {
  id: CargaId;
  fechaHora: FechaISO;
  camionId: CamionId;
  camionPatente: string | null;
  estacion: string | null;
  estacionId: number | null;
  litros: number;
  importe: number;
  moneda: string;
  estadoValidacion: EstadoValidacion;
  motivoObservacion: string | null;
  tieneDocumento: boolean;
  creadoPor: number | null;
}

export const TAMANO_PAGINA_BANDEJA = 50;

/**
 * Ticket de la carga y bandejas de validación (migración 34). Las escrituras son funciones de
 * la base; el archivo lo sube el navegador a Storage antes de registrarlo.
 */
export const documentoRepository = (db: Db) => ({
  async deCarga(cargaId: number): Promise<DocumentoCarga[]> {
    const { data, error } = await db
      .schema('fue')
      .from('documento_carga')
      .select('id, tipo, numero_documento, fecha_documento, archivo_uri')
      .eq('carga_id', cargaId)
      .is('eliminado_en', null)
      .order('id');
    if (error) throw new RepoError(error);
    return data.map((d) => ({
      id: d.id,
      tipo: esTipoDocumento(d.tipo) ? d.tipo : 'ticket',
      numero: d.numero_documento,
      fecha: d.fecha_documento as FechaDia,
      archivo: d.archivo_uri,
    }));
  },

  /** Proveedor de la estación de la carga: emisor del ticket (null en el surtidor propio). */
  async emisorDe(estacionId: number | null): Promise<number | null> {
    if (estacionId === null) return null;
    const { data, error } = await db.schema('mae').from('estacion_servicio').select('proveedor_id').eq('id', estacionId).maybeSingle();
    if (error) throw new RepoError(error);
    return data?.proveedor_id ?? null;
  },

  async registrar(d: z.output<typeof documentoSchema>): Promise<number> {
    const { data, error } = await db.schema('fue').rpc('fn_agregar_documento_carga', {
      p_carga: d.cargaId,
      p_tipo: d.tipo,
      p_numero: d.numero,
      p_fecha: d.fecha,
      p_archivo: d.archivo,
      p_hash: d.hash,
      p_emisor: d.emisorId,
    });
    if (error) throw new RepoError(error);
    return data as number;
  },

  async quitar(documentoId: number): Promise<void> {
    const { error } = await db.schema('fue').rpc('fn_quitar_documento_carga', { p_documento: documentoId });
    if (error) throw new RepoError(error);
  },

  async validar(cargaId: number, motivo: string | null): Promise<void> {
    const { error } = await db.schema('fue').rpc('fn_validar_carga', { p_carga: cargaId, p_motivo: motivo });
    if (error) throw new RepoError(error);
  },

  /** Quién y cuándo validó la carga. */
  async validacion(cargaId: number): Promise<{ por: string | null; en: FechaISO | null; motivo: string | null }> {
    const { data, error } = await db
      .schema('fue')
      .from('carga_combustible')
      .select('validada_por, validada_en, motivo_validacion')
      .eq('id', cargaId)
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data?.validada_por) return { por: null, en: null, motivo: null };
    const u = await db.schema('seg').from('usuario').select('nombre').eq('id', data.validada_por).maybeSingle();
    if (u.error) throw new RepoError(u.error);
    return { por: u.data?.nombre ?? null, en: data.validada_en as FechaISO | null, motivo: data.motivo_validacion };
  },

  async bandeja(tipo: Bandeja, pagina: number): Promise<Pagina<CargaEnBandeja>> {
    const [desde, hasta] = rangoPagina(pagina, TAMANO_PAGINA_BANDEJA);
    let q = db
      .schema('fue')
      .from('carga_combustible')
      .select(
        'id, fecha_hora, camion_id, estacion_id, litros, importe_original, moneda, estado_validacion, motivo_observacion, tiene_documento, creado_por',
        {
          count: 'exact',
        },
      )
      .is('eliminado_en', null);
    if (tipo === 'por_validar') q = q.in('estado_validacion', ['pendiente', 'observada']);
    if (tipo === 'observadas') q = q.eq('estado_validacion', 'observada');
    if (tipo === 'sin_documento') q = q.eq('tiene_documento', false).neq('estado_validacion', 'anulada');
    const { data, count, error } = await q.order('fecha_hora', { ascending: true }).order('id').range(desde, hasta);
    if (error) throw new RepoError(error);
    const nombres = await nombresDe(db, { camiones: data.map((c) => c.camion_id), estaciones: data.map((c) => c.estacion_id ?? NaN) });
    return {
      total: count,
      filas: data.map((c) => ({
        id: c.id as CargaId,
        fechaHora: c.fecha_hora as FechaISO,
        camionId: c.camion_id as CamionId,
        camionPatente: nombres.patente.get(c.camion_id) ?? null,
        estacion: c.estacion_id === null ? null : (nombres.estacion.get(c.estacion_id) ?? null),
        estacionId: c.estacion_id,
        litros: Number(c.litros),
        importe: Number(c.importe_original),
        moneda: c.moneda.trim(),
        estadoValidacion: esEstadoValidacion(c.estado_validacion) ? c.estado_validacion : 'pendiente',
        motivoObservacion: c.motivo_observacion,
        tieneDocumento: c.tiene_documento,
        creadoPor: c.creado_por,
      })),
    };
  },
});
