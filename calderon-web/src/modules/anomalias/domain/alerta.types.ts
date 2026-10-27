import type { FechaISO } from '@/shared/types/dominio';

/**
 * Alertas del motor de anomalías (migración 49). La base detecta, deduplica y decide quién
 * puede revisar; acá solo se convierten tipos y se eligen las etiquetas para mostrar.
 */
export const ESTADOS_ABIERTOS = ['nueva', 'en_revision'] as const;
export type Vista = 'abiertas' | 'cerradas' | 'todas';
export type Decision = 'justificada' | 'descartada' | 'confirmada' | 'a_descontar';

export const ETIQUETA_ESTADO: Record<string, string> = {
  nueva: 'Nueva',
  en_revision: 'En revisión',
  explicada: 'Justificada',
  descartada: 'Descartada',
  confirmada_operativa: 'Confirmada',
};

export const ETIQUETA_RESOLUCION: Record<string, string> = {
  justificada: 'Justificada',
  descartada: 'Descartada (falsa alarma)',
  confirmada: 'Confirmada, sin descuento',
  a_descontar: 'A descontar al chofer',
};

export const ETIQUETA_SEVERIDAD: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

const UNIDAD: Record<string, string> = { l: 'L', km: 'km', min: 'min', l_100km: 'L/100 km', pct: '%' };
export const etiquetaUnidad = (u: string | null) => (u ? (UNIDAD[u] ?? u) : '');

export interface Alerta {
  id: number;
  codigo: string;
  tipo: string;
  categoria: string;
  severidad: string;
  estado: string;
  resolucion: string | null;
  camionId: number | null;
  patente: string | null;
  choferId: number | null;
  chofer: string | null;
  cargaId: number | null;
  desde: FechaISO | null;
  hasta: FechaISO | null;
  detectada: FechaISO;
  observado: number | null;
  esperado: number | null;
  unidad: string | null;
  evidencia: Record<string, unknown>;
  descuentoL: number | null;
  descuentoImporte: number | null;
  moneda: string | null;
  descuentoChofer: string | null;
  comentarios: number;
}

export const estaAbierta = (a: Pick<Alerta, 'estado'>) => (ESTADOS_ABIERTOS as readonly string[]).includes(a.estado);

export interface DetalleAlerta {
  regla: { codigo: string; nombre: string; descripcion: string | null; version: number; parametros: Record<string, unknown> };
  historial: { estado: string; anterior: string | null; en: FechaISO; usuario: string | null; justificacion: string | null }[];
  comentarios: { texto: string; en: FechaISO; usuario: string | null }[];
  carga: { id: number; fechaHora: FechaISO; litros: number; estacion: string | null } | null;
}

export interface Regla {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  version: number;
  parametros: Record<string, unknown>;
  activa: boolean;
  vigenteDesde: string;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function parsearDetalle(d: unknown): DetalleAlerta {
  const x = obj(d);
  const r = obj(x.regla);
  const c = x.carga ? obj(x.carga) : null;
  return {
    regla: { codigo: txt(r.codigo) ?? '', nombre: txt(r.nombre) ?? '', descripcion: txt(r.descripcion), version: Number(r.version ?? 1), parametros: obj(r.parametros) },
    historial: arr(x.historial).map((h) => ({
      estado: txt(h.estado) ?? '',
      anterior: txt(h.anterior),
      en: (txt(h.en) ?? '') as FechaISO,
      usuario: txt(h.usuario),
      justificacion: txt(h.justificacion),
    })),
    comentarios: arr(x.comentarios).map((k) => ({ texto: txt(k.texto) ?? '', en: (txt(k.en) ?? '') as FechaISO, usuario: txt(k.usuario) })),
    carga: c ? { id: Number(c.id), fechaHora: (txt(c.fecha_hora) ?? '') as FechaISO, litros: Number(c.litros), estacion: txt(c.estacion) } : null,
  };
}

/** Nombres legibles de los datos que guarda cada regla como evidencia y de sus umbrales. */
export const ETIQUETA_DATO: Record<string, string> = {
  nivel_antes_l: 'Nivel antes (L)',
  nivel_despues_l: 'Nivel después (L)',
  consumido_l: 'Consumido por el motor (L)',
  consumido_entre_l: 'Consumido por el motor (L)',
  km: 'Km recorridos',
  litros: 'Litros',
  litros_declarados: 'Litros cargados',
  subida_l: 'Subida del tanque (L)',
  estacion: 'Estación',
  lectura_ts: 'Posición del camión a las',
  dia: 'Día',
  episodios: 'Veces',
  mayor_min: 'La más larga (min)',
  exceso_l: 'Litros de más',
  velocidad_max: 'Velocidad máxima (km/h)',
  limite_kmh: 'Límite (km/h)',
  litros_min: 'Litros mínimos',
  litros_alta: 'Litros para «alta»',
  km_max: 'Km máximos (detenido)',
  pct_min: 'Porcentaje mínimo',
  ventana_h: 'Horas alrededor de la carga',
  metros_min: 'Metros mínimos',
  ventana_min: 'Minutos alrededor de la carga',
  minutos_min: 'Minutos mínimos',
  minutos_media: 'Minutos para «media»',
  pct: 'Porcentaje sobre lo normal',
  km_min: 'Km mínimos por día',
  dias_base: 'Días para calcular lo normal',
  // Migración 89: carga mayor a lo consumido
  sugerido_l: 'Faltaba para llenar (L)',
  como: 'Cómo se calculó',
  ultimo_llenado_ts: 'Último llenado de corte',
  // Migración 85: programador de velocidad cada 100 km
  odometro_desde_km: 'Desde el km (odómetro)',
  odometro_hasta_km: 'Hasta el km (odómetro)',
  km_medidos: 'Km medidos',
  km_con_programador: 'Km con programador',
  km_tramo: 'Cada cuántos km',
  pct_alta: 'Porcentaje para «alta»',
  cobertura_pct: 'Datos mínimos del tramo (%)',
};

/** Evidencia que se muestra (sin coordenadas ni datos internos). */
export const DATOS_OCULTOS = new Set(['latitud', 'longitud', 'estacion_latitud', 'estacion_longitud', 'detalle', 'con_acumulados']);
