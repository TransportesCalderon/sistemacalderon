import type { Json } from '@/shared/types/db';
import type { CargaId, ChoferId, FechaISO } from '@/shared/types/dominio';
import { num } from './comun';
import type { ComponenteCamion, Pendiente, ResultadoCierre, Verificacion } from './cierre.types';

/**
 * Lectura (sin cálculo) de lo que devuelve la base:
 *  - fue.fn_resultado_cierre(id): resultado en vivo de un borrador, con pendientes y avisos;
 *  - las columnas congeladas de fue.cierre_viaje al aprobar;
 *  - fue.fn_verificar_cierre(id).
 * Ningún número se calcula acá: solo se cambia el nombre de los campos.
 */
type Obj = Record<string, Json | undefined>;

const obj = (v: Json | undefined): Obj | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : []);
const txt = (v: Json | undefined): string | null => (typeof v === 'string' ? v : null);
const n = (v: Json | undefined): number | null => (typeof v === 'number' || typeof v === 'string' ? num(v) : null);
const idDe = <T extends number>(v: Json | undefined): T | null => (n(v) as T | null) ?? null;

export function pendientesDe(v: Json | undefined): Pendiente[] {
  return arr(v)
    .map(obj)
    .filter((p): p is Obj => p !== null)
    .map((p) => ({ codigo: txt(p.codigo) ?? '', mensaje: txt(p.mensaje) ?? '' }));
}

export function textosDe(v: Json | undefined): string[] {
  return arr(v).filter((x): x is string => typeof x === 'string');
}

function camionDe(c: Obj | null): ComponenteCamion {
  return {
    cargasL: n(c?.cargas_l),
    entradasL: n(c?.entradas_l),
    salidasL: n(c?.salidas_l),
    faltanteSalidaL: n(c?.faltante_salida_l),
    faltanteLlegadaL: n(c?.faltante_llegada_l),
    libroL: n(c?.libro_l),
    consumoPlataformaL: n(c?.consumo_plataforma_l),
    fuenteConsumo: txt(c?.fuente_consumo_plataforma),
    kmRecorridos: n(c?.km_recorridos),
    fuenteKm: txt(c?.fuente_km),
    consumoL100km: n(c?.consumo_l_100km),
    horasMotor: n(c?.horas_motor),
    horasRalenti: n(c?.horas_ralenti),
    diasParado: n(c?.dias_parado),
    diferenciaL: n(c?.diferencia_l),
    toleranciaL: n(c?.tolerancia_l),
    noImputableL: n(c?.no_imputable_l),
    imputableL: n(c?.imputable_l),
  };
}

/** fue.fn_resultado_cierre / fn_resultado_viaje → ResultadoCierre. */
export function parsearResultado(json: Json): ResultadoCierre {
  const r = obj(json) ?? {};
  return {
    versionCalculo: 2,
    camion: camionDe(obj(r.camion)),
    anterior: null,
    imputableTotalL: n(r.imputable_total_l),
    lineaViaje: txt(r.linea_viaje),
    choferResponsableId: idDe<ChoferId>(r.chofer_responsable_id),
    choferPropuestoId: idDe<ChoferId>(r.chofer_propuesto_id),
    cargaLlegadaId: idDe<CargaId>(r.carga_llegada_id),
    pendientes: pendientesDe(r.pendientes),
    avisos: textosDe(r.avisos),
    calculadoEn: txt(r.calculado_en) as FechaISO | null,
  };
}

/** Columnas congeladas de un cierre aprobado (o anulado después de aprobarse). */
export interface ColumnasCongeladas {
  version_calculo: number;
  cargas_l: number | null;
  entradas_l: number | null;
  salidas_l: number | null;
  faltante_salida_l: number | null;
  faltante_llegada_l: number | null;
  libro_l: number | null;
  diferencia_l: number | null;
  tolerancia_l: number | null;
  consumo_plataforma_l: number | null;
  fuente_consumo_plataforma: string | null;
  km_recorridos: number | null;
  fuente_km: string | null;
  consumo_l_100km: number | null;
  horas_motor: number | null;
  horas_ralenti: number | null;
  dias_parado: number | null;
  tractor_no_imputable_l: number;
  tractor_diferencia_l: number | null;
  mochila_diferencia_l: number | null;
  imputable_total_l: number | null;
  linea_viaje: string | null;
  chofer_responsable_id: number | null;
  carga_llegada_id: number;
  detalle: Json | null;
  calculado_en: string | null;
}

export function resultadoCongelado(f: ColumnasCongeladas): ResultadoCierre {
  const detalle = obj(f.detalle);
  const anterior = f.version_calculo === 1;
  return {
    versionCalculo: anterior ? 1 : 2,
    camion: {
      cargasL: num(f.cargas_l),
      entradasL: num(f.entradas_l),
      salidasL: num(f.salidas_l),
      faltanteSalidaL: num(f.faltante_salida_l),
      faltanteLlegadaL: num(f.faltante_llegada_l),
      libroL: num(f.libro_l),
      consumoPlataformaL: num(f.consumo_plataforma_l),
      fuenteConsumo: f.fuente_consumo_plataforma,
      kmRecorridos: num(f.km_recorridos),
      fuenteKm: f.fuente_km,
      consumoL100km: num(f.consumo_l_100km),
      horasMotor: num(f.horas_motor),
      horasRalenti: num(f.horas_ralenti),
      diasParado: num(f.dias_parado),
      diferenciaL: num(f.diferencia_l),
      toleranciaL: num(f.tolerancia_l),
      noImputableL: num(f.tractor_no_imputable_l),
      imputableL: num(f.imputable_total_l),
    },
    anterior: anterior ? { tractorDiferenciaL: num(f.tractor_diferencia_l), mochilaDiferenciaL: num(f.mochila_diferencia_l) } : null,
    imputableTotalL: num(f.imputable_total_l),
    lineaViaje: f.linea_viaje,
    choferResponsableId: f.chofer_responsable_id as ChoferId | null,
    choferPropuestoId: null,
    cargaLlegadaId: f.carga_llegada_id as CargaId,
    pendientes: [],
    avisos: textosDe(detalle?.avisos),
    calculadoEn: f.calculado_en as FechaISO | null,
  };
}

/** fue.fn_verificar_cierre → Verificacion. */
export function parsearVerificacion(json: Json): Verificacion {
  const v = obj(json) ?? {};
  return {
    ok: v.ok === true,
    defectos: textosDe(v.defectos),
    avisos: textosDe(v.avisos),
    verificadoEn: txt(v.verificado_en) as FechaISO | null,
  };
}
