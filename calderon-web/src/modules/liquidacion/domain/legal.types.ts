import type { Json } from '@/shared/types/database.generated';

/**
 * Liquidación de sueldo de Chile, planilla y comprobante de egreso (migración 66).
 * La base hace todas las cuentas (AFP, salud, cesantía, impuesto, líquido, letras); acá solo se lee.
 */
type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const n0 = (v: unknown): number => n(v) ?? 0;

export interface Empresa {
  razonSocial: string | null;
  rut: string | null;
  direccion: string | null;
  comuna: string | null;
}
export const parsearEmpresa = (v: unknown): Empresa => {
  const x = o(v);
  return { razonSocial: s(x.razon_social), rut: s(x.rut), direccion: s(x.direccion), comuna: s(x.comuna) };
};

export type Salud = 'fonasa' | 'isapre';
export type Contrato = 'indefinido' | 'plazo_fijo';
export interface FichaLaboral {
  rut: string;
  extranjero: boolean;
  cargo: string;
  afp: string;
  afpComisionPct: number;
  salud: Salud;
  isapre: string | null;
  isaprePlanUf: number | null;
  contrato: Contrato;
  contratoFirmado: boolean;
  observacion: string | null;
}
const parsearFicha = (v: unknown): FichaLaboral | null => {
  if (!v || typeof v !== 'object') return null;
  const x = o(v);
  return {
    rut: s(x.rut) ?? '',
    extranjero: x.extranjero === true,
    cargo: s(x.cargo) ?? '',
    afp: s(x.afp) ?? '',
    afpComisionPct: n0(x.afp_comision_pct),
    salud: (s(x.salud) ?? 'fonasa') as Salud,
    isapre: s(x.isapre),
    isaprePlanUf: n(x.isapre_plan_uf),
    contrato: (s(x.contrato) ?? 'indefinido') as Contrato,
    contratoFirmado: x.contrato_firmado === true,
    observacion: s(x.observacion),
  };
};

export interface HaberLegal {
  codigo: string;
  nombre: string;
  imponible: boolean;
  importe: number;
}

/** El cálculo de la liquidación de sueldo tal como lo devuelve la base. */
export interface Legal {
  congelado: boolean;
  faltan: string[];
  empresa: Empresa;
  ficha: FichaLaboral | null;
  fechaIngreso: string | null;
  uf: number | null;
  utm: number | null;
  diasLicencia: number;
  diasSinLicencia: number;
  diasVacaciones: number;
  diasTrabajados: number;
  haberes: HaberLegal[];
  totalImponible: number;
  totalNoImponible: number;
  totalHaberes: number;
  basePrevisional: number | null;
  afpPct: number;
  afpObligatoria: number;
  afpComision: number;
  afpTotal: number;
  saludPct: number;
  salud: number;
  cesantiaPct: number;
  cesantia: number;
  baseTributable: number;
  impuesto: number;
  totalDescuentos: number;
  liquido: number;
  liquidoLetras: string;
  planillaBruto: number;
  diferencia: number;
  otrosDescuentos: number;
  aPagar: number;
  aPagarLetras: string;
}
export const parsearLegal = (v: unknown): Legal | null => {
  if (!v || typeof v !== 'object') return null;
  const x = o(v);
  return {
    congelado: x.congelado === true,
    faltan: arr(x.faltan).map(String),
    empresa: parsearEmpresa(x.empresa),
    ficha: parsearFicha(x.ficha),
    fechaIngreso: s(x.fecha_ingreso),
    uf: n(x.uf),
    utm: n(x.utm),
    diasLicencia: n0(x.dias_licencia),
    diasSinLicencia: n0(x.dias_sin_licencia),
    diasVacaciones: n0(x.dias_vacaciones),
    diasTrabajados: n0(x.dias_trabajados),
    haberes: arr(x.haberes).map((h) => {
      const y = o(h);
      return { codigo: s(y.codigo) ?? '', nombre: s(y.nombre) ?? '', imponible: y.imponible === true, importe: n0(y.importe) };
    }),
    totalImponible: n0(x.total_imponible),
    totalNoImponible: n0(x.total_no_imponible),
    totalHaberes: n0(x.total_haberes),
    basePrevisional: n(x.base_previsional),
    afpPct: n0(x.afp_pct),
    afpObligatoria: n0(x.afp_obligatoria),
    afpComision: n0(x.afp_comision),
    afpTotal: n0(x.afp_total),
    saludPct: n0(x.salud_pct),
    salud: n0(x.salud),
    cesantiaPct: n0(x.cesantia_pct),
    cesantia: n0(x.cesantia),
    baseTributable: n0(x.base_tributable),
    impuesto: n0(x.impuesto),
    totalDescuentos: n0(x.total_descuentos),
    liquido: n0(x.liquido),
    liquidoLetras: s(x.liquido_letras) ?? '',
    planillaBruto: n0(x.planilla_bruto),
    diferencia: n0(x.diferencia),
    otrosDescuentos: n0(x.otros_descuentos),
    aPagar: n0(x.a_pagar),
    aPagarLetras: s(x.a_pagar_letras) ?? '',
  };
};

/** Lo que RRHH cargó (días y haberes) para volver a mostrarlo en el formulario. */
export interface LegalCarga {
  diasLicencia: number;
  diasSinLicencia: number;
  diasVacaciones: number;
  haberes: { codigo: string; importe: number }[];
}
export const parsearLegalCarga = (v: unknown): LegalCarga | null => {
  if (!v || typeof v !== 'object') return null;
  const x = o(v);
  return {
    diasLicencia: n0(x.dias_licencia),
    diasSinLicencia: n0(x.dias_sin_licencia),
    diasVacaciones: n0(x.dias_vacaciones),
    haberes: arr(x.haberes).map((h) => ({ codigo: s(o(h).codigo) ?? '', importe: n0(o(h).importe) })),
  };
};

export interface ViajePlanilla {
  numero: string;
  salida: string | null;
  llegada: string | null;
  recorrido: string | null;
  km: number | null;
  canon: number | null;
}
export interface FondoPlanilla {
  moneda: string;
  entregado: number;
  gastos: number;
  devuelto: number;
  diferencia: number;
}
export interface Planilla {
  viajes: ViajePlanilla[];
  fondo: FondoPlanilla[];
}
export const parsearPlanilla = (v: unknown): Planilla => {
  const x = o(v);
  return {
    viajes: arr(x.viajes).map((t) => {
      const y = o(t);
      return { numero: s(y.numero) ?? '', salida: s(y.salida), llegada: s(y.llegada), recorrido: s(y.recorrido), km: n(y.km), canon: n(y.canon) };
    }),
    fondo: arr(x.fondo).map((t) => {
      const y = o(t);
      return { moneda: s(y.moneda) ?? '', entregado: n0(y.entregado), gastos: n0(y.gastos), devuelto: n0(y.devuelto), diferencia: n0(y.diferencia) };
    }),
  };
};

// ---------------------------------------------------------------------------
// Pantalla «Datos legales»
// ---------------------------------------------------------------------------
export interface ConceptoLegal {
  codigo: string;
  nombre: string;
  imponible: boolean;
}
export interface Indicador {
  periodo: string;
  uf: number;
  utm: number;
  topeImponibleUf: number;
  topeCesantiaUf: number;
}
export interface FichaChofer {
  choferId: number;
  chofer: string;
  fechaIngreso: string | null;
  ficha: FichaLaboral | null;
}
export interface DatosLegales {
  empresa: Empresa;
  tasas: { afp: number; salud: number; cesantia: number };
  conceptos: ConceptoLegal[];
  tramos: { desdeUtm: number; factor: number }[];
  indicadores: Indicador[];
  fichas: FichaChofer[];
}
export const parsearDatosLegales = (v: Json | unknown): DatosLegales => {
  const x = o(v);
  const t = o(x.tasas);
  return {
    empresa: parsearEmpresa(x.empresa),
    tasas: { afp: n0(t.afp), salud: n0(t.salud), cesantia: n0(t.cesantia) },
    conceptos: arr(x.conceptos).map((c) => ({ codigo: s(o(c).codigo) ?? '', nombre: s(o(c).nombre) ?? '', imponible: o(c).imponible === true })),
    tramos: arr(x.tramos).map((c) => ({ desdeUtm: n0(o(c).desde_utm), factor: n0(o(c).factor) })),
    indicadores: arr(x.indicadores).map((c) => {
      const y = o(c);
      return { periodo: s(y.periodo) ?? '', uf: n0(y.uf), utm: n0(y.utm), topeImponibleUf: n0(y.tope_imponible_uf), topeCesantiaUf: n0(y.tope_cesantia_uf) };
    }),
    fichas: arr(x.fichas).map((c) => {
      const y = o(c);
      return { choferId: Number(y.chofer_id), chofer: s(y.chofer) ?? '', fechaIngreso: s(y.fecha_ingreso), ficha: parsearFicha(y.ficha) };
    }),
  };
};

/** Pesos chilenos sin decimales: 1.447.959 */
export const clp = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Math.round(v).toLocaleString('es-CL', { maximumFractionDigits: 0 });

export const ETIQUETA_CONTRATO: Record<Contrato, string> = { indefinido: 'Indefinido', plazo_fijo: 'Plazo fijo' };
