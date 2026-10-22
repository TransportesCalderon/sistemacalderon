import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/database.generated';

/**
 * Lectura de tickets y comprobantes con IA (migración 64). La IA solo PROPONE: la base
 * llama a la API (la clave está en Vault), ordena la respuesta y avisa lo que no cierra.
 */
export type TipoLectura = 'ticket_combustible' | 'comprobante_gasto';

export interface PropuestaIA {
  fecha?: string;
  hora?: string;
  litros?: number;
  precio_unitario?: number;
  importe_total?: number;
  moneda?: string;
  estacion_leida?: string;
  estacion_id?: number;
  estacion_nombre?: string;
  numero_comprobante?: string;
  patente?: string;
  camion_id?: number;
  odometro_km?: number;
  categoria?: string;
  lugar?: string;
  detalle?: string;
  confianza?: 'alta' | 'media' | 'baja';
  observacion?: string;
}

export interface ResultadoIA {
  id: number;
  estado: 'enviada' | 'lista' | 'error';
  propuesta: PropuestaIA | null;
  avisos: string[];
  error: string | null;
  reutilizada: boolean;
}

const aResultado = (v: Json | null): ResultadoIA => {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    id: Number(o.id),
    estado: (o.estado as ResultadoIA['estado']) ?? 'error',
    propuesta: (o.propuesta as PropuestaIA | null) ?? null,
    avisos: Array.isArray(o.avisos) ? o.avisos.map(String) : [],
    error: typeof o.error === 'string' ? o.error : null,
    reutilizada: o.reutilizada === true,
  };
};

export const iaRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  return {
    async estado(): Promise<boolean> {
      const { data, error } = await ops().rpc('fn_ia_estado');
      if (error) return false;
      return (data as { activa?: boolean } | null)?.activa === true;
    },
    async leer(tipo: TipoLectura, base64: string, mediaType: string): Promise<number> {
      const { data, error } = await ops().rpc('fn_ia_leer', { p_tipo: tipo, p_imagen_base64: base64, p_media_type: mediaType });
      if (error) throw new RepoError(error);
      return data;
    },
    async resultado(id: number): Promise<ResultadoIA> {
      const { data, error } = await ops().rpc('fn_ia_resultado', { p_lectura: id });
      if (error) throw new RepoError(error);
      return aResultado(data);
    },
    async marcarUsada(id: number, guardado: Record<string, unknown>) {
      const { error } = await ops().rpc('fn_ia_marcar_usada', { p_lectura: id, p_guardado: guardado as Json });
      if (error) throw new RepoError(error);
    },
  };
};
