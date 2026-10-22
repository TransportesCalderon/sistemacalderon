import type { Json } from '@/shared/types/database.generated';
import { parsearLegal, parsearLegalCarga, parsearPlanilla, type Legal, type LegalCarga, type Planilla } from './legal.types';

/**
 * Liquidación mensual del chofer (migración 62). La base arma los renglones y los totales;
 * acá solo se lee el JSON para mostrarlo.
 */
export type TipoRenglon = 'remunerativo' | 'no_remunerativo' | 'descuento';
export type EstadoLiquidacion = 'borrador' | 'aprobada' | 'pagada' | 'anulada';
export type CalculoConcepto = 'manual' | 'fijo' | 'porcentaje';

export const TIPOS_RENGLON: readonly TipoRenglon[] = ['remunerativo', 'no_remunerativo', 'descuento'];
export const ETIQUETA_TIPO: Record<TipoRenglon, string> = {
  remunerativo: 'Remunerativo',
  no_remunerativo: 'No remunerativo',
  descuento: 'Descuento',
};
export const TITULO_TIPO: Record<TipoRenglon, string> = {
  remunerativo: 'Haberes remunerativos',
  no_remunerativo: 'Haberes no remunerativos',
  descuento: 'Descuentos',
};
export const ETIQUETA_ESTADO_LIQ: Record<EstadoLiquidacion, string> = {
  borrador: 'Borrador',
  aprobada: 'Aprobada',
  pagada: 'Pagada',
  anulada: 'Anulada',
};
export const ETIQUETA_CALCULO: Record<CalculoConcepto, string> = { manual: 'A mano', fijo: 'Importe fijo', porcentaje: 'Porcentaje' };

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export interface Renglon {
  id: number;
  origen: 'sistema' | 'concepto' | 'manual';
  codigo: string;
  descripcion: string;
  tipo: TipoRenglon;
  cantidad: number | null;
  unitario: number | null;
  importe: number;
}

export interface Liquidacion {
  id: number;
  numero: string;
  choferId: number;
  chofer: string;
  legajo: string | null;
  documento: string | null;
  periodo: string;
  desde: string;
  hasta: string;
  moneda: string;
  estado: EstadoLiquidacion;
  remunerativo: number;
  noRemunerativo: number;
  descuentos: number;
  neto: number;
  avisos: string[];
  aprobadaPor: string | null;
  aprobadaEn: string | null;
  pagadaEn: string | null;
  formaPago: string | null;
  motivo: string | null;
  version: number;
  renglones: Renglon[];
  /** Migración 66: planilla, liquidación de sueldo (Chile) y comprobante de egreso */
  planilla: Planilla;
  legal: Legal | null;
  legalCarga: LegalCarga | null;
  egresoNumero: string | null;
  egresoLetras: string | null;
  pagoBanco: string | null;
  pagoNumero: string | null;
  firmadaRuta: string | null;
  firmadaEn: string | null;
}

export const parsearLiquidacion = (v: Json | unknown): Liquidacion => {
  const x = o(v);
  return {
    id: Number(x.id),
    numero: s(x.numero) ?? '',
    choferId: Number(x.chofer_id),
    chofer: s(x.chofer) ?? '',
    legajo: s(x.legajo),
    documento: s(x.documento),
    periodo: s(x.periodo) ?? '',
    desde: s(x.desde) ?? '',
    hasta: s(x.hasta) ?? '',
    moneda: s(x.moneda) ?? '',
    estado: (s(x.estado) ?? 'borrador') as EstadoLiquidacion,
    remunerativo: n(x.remunerativo) ?? 0,
    noRemunerativo: n(x.no_remunerativo) ?? 0,
    descuentos: n(x.descuentos) ?? 0,
    neto: n(x.neto) ?? 0,
    avisos: arr(x.avisos).map(String),
    aprobadaPor: s(x.aprobada_por),
    aprobadaEn: s(x.aprobada_en),
    pagadaEn: s(x.pagada_en),
    formaPago: s(x.forma_pago),
    motivo: s(x.motivo),
    version: n(x.version) ?? 1,
    planilla: parsearPlanilla(x.planilla),
    legal: parsearLegal(x.legal),
    legalCarga: parsearLegalCarga(x.legal_carga),
    egresoNumero: s(x.egreso_numero),
    egresoLetras: s(x.egreso_letras),
    pagoBanco: s(x.pago_banco),
    pagoNumero: s(x.pago_numero),
    firmadaRuta: s(x.firmada_ruta),
    firmadaEn: s(x.firmada_en),
    renglones: arr(x.renglones).map((r) => {
      const y = o(r);
      return {
        id: Number(y.id),
        origen: (s(y.origen) ?? 'sistema') as Renglon['origen'],
        codigo: s(y.codigo) ?? '',
        descripcion: s(y.descripcion) ?? '',
        tipo: (s(y.tipo) ?? 'remunerativo') as TipoRenglon,
        cantidad: n(y.cantidad),
        unitario: n(y.unitario),
        importe: n(y.importe) ?? 0,
      };
    }),
  };
};

export interface FilaLiquidacion {
  id: number;
  numero: string;
  choferId: number;
  chofer: string;
  estado: EstadoLiquidacion;
  remunerativo: number;
  noRemunerativo: number;
  descuentos: number;
  neto: number;
  avisos: number;
  pagadaEn: string | null;
}
export interface Periodo {
  periodo: string;
  desde: string;
  hasta: string;
  moneda: string;
  liquidaciones: FilaLiquidacion[];
}
export const parsearPeriodo = (v: Json | unknown): Periodo => {
  const x = o(v);
  return {
    periodo: s(x.periodo) ?? '',
    desde: s(x.desde) ?? '',
    hasta: s(x.hasta) ?? '',
    moneda: s(x.moneda) ?? '',
    liquidaciones: arr(x.liquidaciones).map((l) => {
      const y = o(l);
      return {
        id: Number(y.id),
        numero: s(y.numero) ?? '',
        choferId: Number(y.chofer_id),
        chofer: s(y.chofer) ?? '',
        estado: (s(y.estado) ?? 'borrador') as EstadoLiquidacion,
        remunerativo: n(y.remunerativo) ?? 0,
        noRemunerativo: n(y.no_remunerativo) ?? 0,
        descuentos: n(y.descuentos) ?? 0,
        neto: n(y.neto) ?? 0,
        avisos: n(y.avisos) ?? 0,
        pagadaEn: s(y.pagada_en),
      };
    }),
  };
};

export interface Tarifa {
  id: number;
  choferId: number | null;
  chofer: string | null;
  desde: string;
  sueldoFijo: number | null;
  precioKm: number | null;
  observacion: string | null;
}
export const parsearTarifas = (v: Json | unknown): Tarifa[] =>
  arr(v).map((t) => {
    const y = o(t);
    return {
      id: Number(y.id),
      choferId: n(y.chofer_id),
      chofer: s(y.chofer),
      desde: s(y.desde) ?? '',
      sueldoFijo: n(y.sueldo_fijo),
      precioKm: n(y.precio_km),
      observacion: s(y.observacion),
    };
  });

export interface Concepto {
  id: number;
  codigo: string;
  nombre: string;
  tipo: TipoRenglon;
  calculo: CalculoConcepto;
  valor: number | null;
  base: 'remunerativo' | 'bruto' | null;
  automatico: boolean;
  activo: boolean;
  orden: number;
}
export const parsearConceptos = (v: Json | unknown): Concepto[] =>
  arr(v).map((c) => {
    const y = o(c);
    return {
      id: Number(y.id),
      codigo: s(y.codigo) ?? '',
      nombre: s(y.nombre) ?? '',
      tipo: (s(y.tipo) ?? 'remunerativo') as TipoRenglon,
      calculo: (s(y.calculo) ?? 'manual') as CalculoConcepto,
      valor: n(y.valor),
      base: (s(y.base) as Concepto['base']) ?? null,
      automatico: y.automatico === true,
      activo: y.activo !== false,
      orden: n(y.orden) ?? 100,
    };
  });

export const pesos = (v: number | null | undefined, moneda?: string) =>
  v === null || v === undefined ? '—' : `${moneda ? `${moneda} ` : ''}${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const moverPeriodo = (periodo: string, meses: number) => {
  const [a, m] = periodo.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1 + meses, 1)).toISOString().slice(0, 10);
};
