import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migración 191 · Fase 3: patrones por estación. No clasifica estaciones (no hay «sospechosa sí/no»):
 * es un ranking de anomalías para que lo interpreten Operaciones y Gerencia. Los litros son
 * ASOCIADOS (el faltante del viaje repartido por los litros que cargó cada estación), no causados.
 */
export const VERSION_PATRONES_ESTACION = 191;
export const PERIODOS_ESTACION = [
  { dias: 30, texto: 'Últimos 30 días' },
  { dias: 90, texto: 'Últimos 90 días' },
  { dias: 365, texto: 'Últimos 12 meses' },
] as const;
export type DiasEstacion = (typeof PERIODOS_ESTACION)[number]['dias'];

export type Sentido = 'empeora' | 'mejora' | 'estable' | 'sin_datos';

export interface EstacionPatron {
  estacionId: number;
  estacion: string;
  pais: string | null;
  tanquePropio: boolean;
  cargas: number;
  litros: number;
  ultimaCarga: FechaISO | null;
  ultimoIncidente: FechaISO | null;
  /** false: menos cargas que fue.estacion_min_cargas → sin indicadores ni ranking. */
  suficiente: boolean;
  posicion: number | null;
  viajes: number | null;
  viajesConFaltante: number | null;
  faltanteAsociadoL: number | null;
  descontadoAsociadoL: number | null;
  justificadoAsociadoL: number | null;
  cargasImposibles: number | null;
  incidentesCombustible: number | null;
  incidentesOperativos: number | null;
  pctIncidentes: number | null;
  faltantePorMilL: number | null;
  indice: number | null;
  tendencia: { sentido: Sentido; cambioPct: number | null } | null;
}

export interface PatronesEstaciones {
  dias: number;
  minCargas: number;
  flota: { cargas: number; litros: number; faltanteAsociadoL: number; faltantePorMilL: number | null; pctIncidentes: number | null };
  estaciones: EstacionPatron[];
}

export interface IncidenteCarga {
  tipo: string;
  alertaId: number | null;
  faltanteViajeL?: number;
  partePct?: number;
  asociadoL?: number;
  descontadoL?: number;
  justificadoL?: number;
  decision?: string | null;
}

export interface CargaConIncidente {
  cargaId: number;
  fechaHora: FechaISO;
  litros: number;
  tractor: string | null;
  chofer: string | null;
  cierreId: number | null;
  cierre: string | null;
  combustible: IncidenteCarga[];
  operativos: IncidenteCarga[];
}

/** Incidentes de combustible (más fuertes) y operativos, con su nombre para mostrar. */
export const ETIQUETA_INCIDENTE: Record<string, string> = {
  carga_imposible: 'Carga imposible',
  carga_vs_telemetria: 'Carga que no aparece en el tanque',
  carga_lejos: 'Carga lejos de la estación',
  viaje_con_faltante: 'Viaje con faltante',
};

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function parsearPatronesEstaciones(d: unknown): PatronesEstaciones {
  const x = obj(d);
  const f = obj(x.flota);
  return {
    dias: Number(x.dias ?? 0),
    minCargas: Number(x.min_cargas ?? 20),
    flota: {
      cargas: Number(f.cargas ?? 0),
      litros: Number(f.litros ?? 0),
      faltanteAsociadoL: Number(f.faltante_asociado_l ?? 0),
      faltantePorMilL: n(f.faltante_por_mil_l),
      pctIncidentes: n(f.pct_incidentes),
    },
    estaciones: arr(x.estaciones).map((e) => {
      const t = e.tendencia ? obj(e.tendencia) : null;
      const s = txt(t?.sentido);
      return {
        estacionId: Number(e.estacion_id),
        estacion: txt(e.estacion) ?? '',
        pais: txt(e.pais),
        tanquePropio: e.tanque_propio === true,
        cargas: Number(e.cargas ?? 0),
        litros: Number(e.litros ?? 0),
        ultimaCarga: txt(e.ultima_carga) as FechaISO | null,
        ultimoIncidente: txt(e.ultimo_incidente) as FechaISO | null,
        suficiente: e.suficiente === true,
        posicion: n(e.posicion),
        viajes: n(e.viajes),
        viajesConFaltante: n(e.viajes_con_faltante),
        faltanteAsociadoL: n(e.faltante_asociado_l),
        descontadoAsociadoL: n(e.descontado_asociado_l),
        justificadoAsociadoL: n(e.justificado_asociado_l),
        cargasImposibles: n(e.cargas_imposibles),
        incidentesCombustible: n(e.incidentes_combustible),
        incidentesOperativos: n(e.incidentes_operativos),
        pctIncidentes: n(e.pct_incidentes),
        faltantePorMilL: n(e.faltante_por_mil_l),
        indice: n(e.indice),
        tendencia: t && s ? { sentido: (['empeora', 'mejora', 'estable'].includes(s) ? s : 'sin_datos') as Sentido, cambioPct: n(t.cambio_pct) } : null,
      };
    }),
  };
}

const incidente = (i: J): IncidenteCarga => ({
  tipo: txt(i.tipo) ?? '',
  alertaId: n(i.alerta_id),
  faltanteViajeL: n(i.faltante_viaje_l) ?? undefined,
  partePct: n(i.parte_pct) ?? undefined,
  asociadoL: n(i.asociado_l) ?? undefined,
  descontadoL: n(i.descontado_l) ?? undefined,
  justificadoL: n(i.justificado_l) ?? undefined,
  decision: txt(i.decision),
});

export const parsearDetalleEstacion = (d: unknown): CargaConIncidente[] =>
  arr(d).map((c) => ({
    cargaId: Number(c.carga_id),
    fechaHora: (txt(c.fecha_hora) ?? '') as FechaISO,
    litros: Number(c.litros ?? 0),
    tractor: txt(c.tractor),
    chofer: txt(c.chofer),
    cierreId: n(c.cierre_id),
    cierre: txt(c.cierre),
    combustible: arr(c.combustible).map(incidente),
    operativos: arr(c.operativos).map(incidente),
  }));

/** «Hace 6 días», «hoy». */
export function haceCuanto(iso: string | null, ahora = Date.now()): string {
  if (!iso) return '—';
  const dias = Math.floor((ahora - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return `Hace ${dias} días`;
}
