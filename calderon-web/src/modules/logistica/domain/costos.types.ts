import type { FechaISO } from '@/shared/types/dominio';

/** Km reales y costos del viaje de chofer (migración 51). Lo calcula la base; acá solo se convierte. */
export interface GastoViaje {
  id: number;
  categoria: string;
  fecha: string;
  importe: number;
  moneda: string;
  importeBase: number | null;
  documento: string | null;
  observacion: string | null;
  anulado: boolean;
  motivoAnulacion: string | null;
}

export interface CostosViaje {
  moneda: string;
  enCurso: boolean;
  kmLinea: number | null;
  kmReales: number | null;
  fuenteKm: 'telemetria' | 'linea' | null;
  litrosMotor: number | null;
  horasMotor: number | null;
  l100km: number | null;
  litrosCargados: number | null;
  combustible: number | null;
  combustibleEstimado: boolean;
  canon: number | null;
  canonSinCotizacion: number;
  costoKmFijo: number | null;
  costoKm: number | null;
  gastos: number | null;
  gastosDetalle: GastoViaje[];
  total: number;
  porKm: number | null;
  operaciones: number;
  porOperacion: number | null;
}

export interface CostoViajeFila {
  viajeId: number;
  numero: string;
  estado: string;
  salida: FechaISO;
  llegada: FechaISO | null;
  patente: string;
  chofer: string;
  kmLinea: number | null;
  kmReales: number | null;
  litros: number | null;
  combustible: number | null;
  canon: number | null;
  costoKm: number | null;
  gastos: number | null;
  total: number;
  porKm: number | null;
  operaciones: number;
  moneda: string;
  enCurso: boolean;
  incompleto: boolean;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const t = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function parsearCostosViaje(d: unknown): CostosViaje {
  const x = obj(d);
  const tel = obj(x.telemetria);
  const fuente = t(x.fuente_km);
  return {
    moneda: t(x.moneda) ?? '',
    enCurso: x.en_curso === true,
    kmLinea: n(x.km_linea),
    kmReales: n(x.km_reales),
    fuenteKm: fuente === 'telemetria' || fuente === 'linea' ? fuente : null,
    litrosMotor: n(tel.litros),
    horasMotor: n(tel.horas_motor),
    l100km: n(tel.l_100km),
    litrosCargados: n(x.litros_cargados),
    combustible: n(x.combustible),
    combustibleEstimado: x.combustible_estimado === true,
    canon: n(x.canon),
    canonSinCotizacion: n(x.canon_sin_cotizacion) ?? 0,
    costoKmFijo: n(x.costo_km_fijo),
    costoKm: n(x.costo_km),
    gastos: n(x.gastos),
    gastosDetalle: (Array.isArray(x.gastos_detalle) ? x.gastos_detalle : []).map((g) => {
      const y = obj(g);
      return {
        id: Number(y.id),
        categoria: t(y.categoria) ?? '',
        fecha: t(y.fecha) ?? '',
        importe: Number(y.importe),
        moneda: t(y.moneda) ?? '',
        importeBase: n(y.importe_base),
        documento: t(y.documento),
        observacion: t(y.observacion),
        anulado: y.estado === 'anulado',
        motivoAnulacion: t(y.motivo_anulacion),
      };
    }),
    total: n(x.total) ?? 0,
    porKm: n(x.por_km),
    operaciones: n(x.operaciones) ?? 0,
    porOperacion: n(x.por_operacion),
  };
}
