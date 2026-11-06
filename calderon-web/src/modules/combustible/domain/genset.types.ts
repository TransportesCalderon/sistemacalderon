import type { FechaISO } from '@/shared/types/dominio';

/**
 * Combustible de los gensets (migración 48). Una vuelta va de una carga a tanque lleno a la
 * siguiente, o a una descarga que lo deja vacío. Todos los números los calcula la base
 * (fue.fn_calculo_genset); acá solo se traducen los nombres.
 */
export interface GensetCombustible {
  gensetId: number;
  codigo: string;
  semi: string | null;
  capacidadL: number | null;
  consumoLh: number | null;
  consumoRealLh: number | null;
  ultimo: FechaISO | null;
  ultimoHorometroH: number | null;
  vueltaInicioId: number | null;
  vueltaDesde: FechaISO | null;
  vueltaChofer: string | null;
  porCerrar: number;
  descuentosL: number;
}

export type TipoRegistroGenset = 'carga' | 'descarga';

export interface RegistroGenset {
  id: number;
  tipo: TipoRegistroGenset;
  fechaHora: FechaISO;
  litros: number;
  horometroH: number;
  tanqueLleno: boolean;
  vacio: boolean;
  chofer: string | null;
  semi: string | null;
  tractor: string | null;
  estacion: string | null;
  importe: number | null;
  moneda: string | null;
  ticketNumero: string | null;
  deposito: string | null;
  observacion: string | null;
  /** Número del cierre que lo contiene (no se puede eliminar). */
  cerrado: string | null;
}

export const SITUACIONES_VUELTA_GENSET = ['en_curso', 'por_cerrar', 'cerrado'] as const;
export type SituacionVueltaGenset = (typeof SITUACIONES_VUELTA_GENSET)[number];
export const ETIQUETA_SITUACION_VUELTA: Record<SituacionVueltaGenset, string> = {
  en_curso: 'En curso',
  por_cerrar: 'Para cerrar',
  cerrado: 'Cerrada',
};

export interface VueltaGenset {
  inicioId: number;
  situacion: SituacionVueltaGenset;
  inicio: { fechaHora: FechaISO; litros: number; horometroH: number; choferId: number | null; chofer: string | null };
  fin: { tipo: TipoRegistroGenset; fechaHora: FechaISO; litros: number; horometroH: number } | null;
  horas: number | null;
  cargadoL: number;
  descargadoL: number;
  consumoRealL: number | null;
  consumoEsperadoL: number | null;
  diferenciaL: number | null;
  consumoRealLh: number | null;
  consumoLh: number | null;
  capacidadL: number | null;
  toleranciaL: number;
  dentroTolerancia: boolean;
  descuentoL: number;
  precioLitro: number | null;
  moneda: string | null;
  descuentoImporte: number | null;
  choferPropuestoId: number | null;
  cierre: { id: number; numero: string; choferResponsable: string | null; descuentoL: number; descuentoImporte: number | null } | null;
  pendientes: string[];
  avisos: string[];
}

export interface CierreGenset {
  id: number;
  numero: string;
  estado: 'cerrado' | 'anulado';
  inicio: FechaISO;
  fin: FechaISO;
  horas: number;
  consumoRealL: number;
  consumoEsperadoL: number;
  diferenciaL: number;
  descuentoL: number;
  descuentoImporte: number | null;
  moneda: string | null;
  chofer: string | null;
  motivoAnulacion: string | null;
}

export interface FichaGenset {
  registros: RegistroGenset[];
  vueltas: VueltaGenset[];
  cierres: CierreGenset[];
}

type J = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const t = (v: unknown) => (v === null || v === undefined ? null : String(v));
const lista = (v: unknown) => (Array.isArray(v) ? (v as J[]) : []);

export function parsearVuelta(v: J): VueltaGenset {
  const i = (v.inicio ?? {}) as J;
  const f = v.fin as J | null;
  const c = v.cierre as J | null;
  const s = v.situacion;
  return {
    inicioId: Number(i.id),
    situacion: s === 'cerrado' || s === 'por_cerrar' ? s : 'en_curso',
    inicio: { fechaHora: String(i.fecha_hora) as FechaISO, litros: Number(i.litros), horometroH: Number(i.horometro_h), choferId: n(i.chofer_id), chofer: t(i.chofer) },
    fin: f
      ? { tipo: f.tipo === 'descarga' ? 'descarga' : 'carga', fechaHora: String(f.fecha_hora) as FechaISO, litros: Number(f.litros), horometroH: Number(f.horometro_h) }
      : null,
    horas: n(v.horas),
    cargadoL: Number(v.cargado_l ?? 0),
    descargadoL: Number(v.descargado_l ?? 0),
    consumoRealL: n(v.consumo_real_l),
    consumoEsperadoL: n(v.consumo_esperado_l),
    diferenciaL: n(v.diferencia_l),
    consumoRealLh: n(v.consumo_real_lh),
    consumoLh: n(v.consumo_lh),
    capacidadL: n(v.capacidad_l),
    toleranciaL: Number(v.tolerancia_l ?? 0),
    dentroTolerancia: Boolean(v.dentro_tolerancia),
    descuentoL: Number(v.descuento_l ?? 0),
    precioLitro: n(v.precio_litro),
    moneda: t(v.moneda)?.trim() ?? null,
    descuentoImporte: n(v.descuento_importe),
    choferPropuestoId: n(v.chofer_propuesto_id),
    cierre: c
      ? { id: Number(c.id), numero: String(c.numero), choferResponsable: t(c.chofer_responsable), descuentoL: Number(c.descuento_l ?? 0), descuentoImporte: n(c.descuento_importe) }
      : null,
    pendientes: (Array.isArray(v.pendientes) ? v.pendientes : []).map(String),
    avisos: (Array.isArray(v.avisos) ? v.avisos : []).map(String),
  };
}

export function parsearFichaGenset(d: J): FichaGenset {
  return {
    registros: lista(d.registros).map((r) => ({
      id: Number(r.id),
      tipo: r.tipo === 'descarga' ? 'descarga' : 'carga',
      fechaHora: String(r.fecha_hora) as FechaISO,
      litros: Number(r.litros),
      horometroH: Number(r.horometro_h),
      tanqueLleno: Boolean(r.tanque_lleno),
      vacio: Boolean(r.vacio),
      chofer: t(r.chofer),
      semi: t(r.semi),
      tractor: t(r.tractor),
      estacion: t(r.estacion),
      importe: n(r.importe),
      moneda: t(r.moneda)?.trim() ?? null,
      ticketNumero: t(r.ticket_numero),
      deposito: t(r.deposito),
      observacion: t(r.observacion),
      cerrado: t(r.cerrado),
    })),
    vueltas: lista(d.vueltas).map(parsearVuelta),
    cierres: lista(d.cierres).map((c) => ({
      id: Number(c.id),
      numero: String(c.numero),
      estado: c.estado === 'anulado' ? 'anulado' : 'cerrado',
      inicio: String(c.inicio_ts) as FechaISO,
      fin: String(c.fin_ts) as FechaISO,
      horas: Number(c.horas),
      consumoRealL: Number(c.consumo_real_l),
      consumoEsperadoL: Number(c.consumo_esperado_l),
      diferenciaL: Number(c.diferencia_l),
      descuentoL: Number(c.descuento_l),
      descuentoImporte: n(c.descuento_importe),
      moneda: t(c.moneda)?.trim() ?? null,
      chofer: t(c.chofer),
      motivoAnulacion: t(c.motivo_anulacion),
    })),
  };
}

// ---- Migración 202 · Genset G1: lista de cargas y contexto para completar la carga ----
export const VERSION_GENSET_G1 = 202;

export interface CargaGenset {
  id: number;
  tipo: 'carga' | 'descarga';
  fechaHora: FechaISO;
  gensetId: number;
  genset: string;
  semi: string | null;
  tractor: string | null;
  chofer: string | null;
  origen: 'estacion' | 'tanque_base' | 'descarga_base';
  estacion: string | null;
  tanque: string | null;
  litros: number;
  horometroH: number;
  tanqueLleno: boolean;
  vacio: boolean;
  precioUnitario: number | null;
  moneda: string | null;
  importe: number | null;
  ticketNumero: string | null;
  observacion: string | null;
  cargadoPor: string | null;
  cierre: string | null;
}

export interface ContextoGenset {
  semi: string | null;
  camionId: number | null;
  tractor: string | null;
  choferId: number | null;
  chofer: string | null;
}

type JG = Record<string, unknown>;
const tg = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const ng = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export const parsearCargasGenset = (d: unknown): CargaGenset[] =>
  (Array.isArray(d) ? (d as JG[]) : []).map((x) => ({
    id: Number(x.id),
    tipo: x.tipo === 'descarga' ? 'descarga' : 'carga',
    fechaHora: (tg(x.fecha_hora) ?? '') as FechaISO,
    gensetId: Number(x.genset_id),
    genset: tg(x.genset) ?? '',
    semi: tg(x.semi),
    tractor: tg(x.tractor),
    chofer: tg(x.chofer),
    origen: x.origen === 'tanque_base' ? 'tanque_base' : x.origen === 'descarga_base' ? 'descarga_base' : 'estacion',
    estacion: tg(x.estacion),
    tanque: tg(x.tanque),
    litros: Number(x.litros ?? 0),
    horometroH: Number(x.horometro_h ?? 0),
    tanqueLleno: x.tanque_lleno === true,
    vacio: x.vacio === true,
    precioUnitario: ng(x.precio_unitario),
    moneda: tg(x.moneda),
    importe: ng(x.importe),
    ticketNumero: tg(x.ticket_numero),
    observacion: tg(x.observacion),
    cargadoPor: tg(x.cargado_por),
    cierre: tg(x.cierre),
  }));

export function parsearContextoGenset(d: unknown): ContextoGenset {
  const x = (d && typeof d === 'object' ? d : {}) as JG;
  return { semi: tg(x.semi), camionId: ng(x.camion_id), tractor: tg(x.tractor), choferId: ng(x.chofer_id), chofer: tg(x.chofer) };
}
