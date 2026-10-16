import type { Json } from '@/shared/types/db';
import type { CargaId, ChoferId, ControlSaldoId, DepositoId, FechaISO } from '@/shared/types/dominio';
import { num } from './comun';
import type { ComponenteMochila, ComponenteTractor, ControlDelCierre, Pendiente, ResultadoCierre, Verificacion } from './cierre.types';

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

function control(v: Json | undefined): ControlDelCierre | null {
  const o = obj(v);
  if (!o) return null;
  return { id: idDe<ControlSaldoId>(o.id) as ControlSaldoId, litros: n(o.litros), fuente: txt(o.fuente) };
}

export function pendientesDe(v: Json | undefined): Pendiente[] {
  return arr(v)
    .map(obj)
    .filter((p): p is Obj => p !== null)
    .map((p) => ({ codigo: txt(p.codigo) ?? '', mensaje: txt(p.mensaje) ?? '' }));
}

export function textosDe(v: Json | undefined): string[] {
  return arr(v).filter((x): x is string => typeof x === 'string');
}

function tractorDe(t: Obj | null): ComponenteTractor {
  return {
    litrosCargaSalida: n(t?.litros_carga_salida),
    litrosLlenadosL: n(t?.litros_llenados_l),
    litrosDesdeMochilaL: n(t?.litros_desde_mochila_l),
    consumoLlenadoL: n(t?.consumo_llenado_l),
    consumoPlataformaL: n(t?.consumo_plataforma_l),
    fuenteConsumo: txt(t?.fuente_consumo_plataforma),
    kmRecorridos: n(t?.km_recorridos),
    fuenteKm: txt(t?.fuente_km),
    consumoL100km: n(t?.consumo_l_100km),
    horasMotor: n(t?.horas_motor),
    horasRalenti: n(t?.horas_ralenti),
    diasParado: n(t?.dias_parado),
    diferenciaL: n(t?.diferencia_l),
    toleranciaL: n(t?.tolerancia_l),
    noImputableL: n(t?.no_imputable_l),
    imputableL: n(t?.imputable_l),
  };
}

function mochilaDe(m: Obj | null): ComponenteMochila | null {
  if (!m) return null;
  return {
    depositoId: idDe<DepositoId>(m.deposito_id),
    depositoCodigo: txt(m.codigo),
    controlAncla: control(m.control_ancla),
    controlLlegada: control(m.control_llegada),
    anclaL: n(m.ancla_l),
    entradasL: n(m.entradas_l),
    transferenciasEntradaL: n(m.transferencias_entrada_l),
    transferenciasSalidaL: n(m.transferencias_salida_l),
    aTractorL: n(m.a_tractor_l),
    conMotivoL: n(m.con_motivo_l),
    realL: n(m.real_l),
    teoricoL: n(m.teorico_l),
    fisicoL: n(m.fisico_l),
    diferenciaL: n(m.diferencia_l),
    toleranciaL: n(m.tolerancia_l),
    noImputableL: n(m.no_imputable_l),
    imputableL: n(m.imputable_l),
  };
}

/** fue.fn_resultado_cierre / fn_resultado_viaje → ResultadoCierre. */
export function parsearResultado(json: Json): ResultadoCierre {
  const r = obj(json) ?? {};
  return {
    tractor: tractorDe(obj(r.tractor)),
    usaMochila: typeof r.usa_mochila === 'boolean' ? r.usa_mochila : null,
    mochila: mochilaDe(obj(r.mochila)),
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
  litros_carga_salida: number | null;
  litros_llenados_l: number | null;
  litros_desde_mochila_l: number | null;
  consumo_llenado_l: number | null;
  consumo_plataforma_l: number | null;
  fuente_consumo_plataforma: string | null;
  km_recorridos: number | null;
  fuente_km: string | null;
  consumo_l_100km: number | null;
  horas_motor: number | null;
  horas_ralenti: number | null;
  dias_parado: number | null;
  tractor_diferencia_l: number | null;
  tractor_tolerancia_l: number | null;
  tractor_no_imputable_l: number;
  tractor_imputable_l: number | null;
  usa_mochila: boolean | null;
  deposito_id: number | null;
  control_ancla_id: number | null;
  control_llegada_id: number | null;
  mochila_ancla_l: number | null;
  mochila_entradas_l: number | null;
  mochila_transferencias_entrada_l: number | null;
  mochila_transferencias_salida_l: number | null;
  mochila_a_tractor_l: number | null;
  mochila_con_motivo_l: number | null;
  mochila_real_l: number | null;
  mochila_teorico_l: number | null;
  mochila_fisico_l: number | null;
  mochila_diferencia_l: number | null;
  mochila_tolerancia_l: number | null;
  mochila_no_imputable_l: number;
  mochila_imputable_l: number | null;
  imputable_total_l: number | null;
  linea_viaje: string | null;
  chofer_responsable_id: number | null;
  carga_llegada_id: number;
  detalle: Json | null;
  calculado_en: string | null;
}

export function resultadoCongelado(f: ColumnasCongeladas): ResultadoCierre {
  const detalle = obj(f.detalle);
  const mochilaDetalle = obj(detalle?.mochila);
  const ancla = obj(mochilaDetalle?.control_ancla);
  const llegada = obj(mochilaDetalle?.control_llegada);
  return {
    tractor: {
      litrosCargaSalida: num(f.litros_carga_salida),
      litrosLlenadosL: num(f.litros_llenados_l),
      litrosDesdeMochilaL: num(f.litros_desde_mochila_l),
      consumoLlenadoL: num(f.consumo_llenado_l),
      consumoPlataformaL: num(f.consumo_plataforma_l),
      fuenteConsumo: f.fuente_consumo_plataforma,
      kmRecorridos: num(f.km_recorridos),
      fuenteKm: f.fuente_km,
      consumoL100km: num(f.consumo_l_100km),
      horasMotor: num(f.horas_motor),
      horasRalenti: num(f.horas_ralenti),
      diasParado: num(f.dias_parado),
      diferenciaL: num(f.tractor_diferencia_l),
      toleranciaL: num(f.tractor_tolerancia_l),
      noImputableL: num(f.tractor_no_imputable_l),
      imputableL: num(f.tractor_imputable_l),
    },
    usaMochila: f.usa_mochila,
    mochila: f.usa_mochila
      ? {
          depositoId: f.deposito_id as DepositoId | null,
          depositoCodigo: txt(mochilaDetalle?.codigo),
          controlAncla: f.control_ancla_id
            ? { id: f.control_ancla_id as ControlSaldoId, litros: num(f.mochila_ancla_l), fuente: txt(ancla?.fuente) }
            : null,
          controlLlegada: f.control_llegada_id
            ? { id: f.control_llegada_id as ControlSaldoId, litros: num(f.mochila_fisico_l), fuente: txt(llegada?.fuente) }
            : null,
          anclaL: num(f.mochila_ancla_l),
          entradasL: num(f.mochila_entradas_l),
          transferenciasEntradaL: num(f.mochila_transferencias_entrada_l),
          transferenciasSalidaL: num(f.mochila_transferencias_salida_l),
          aTractorL: num(f.mochila_a_tractor_l),
          conMotivoL: num(f.mochila_con_motivo_l),
          realL: num(f.mochila_real_l),
          teoricoL: num(f.mochila_teorico_l),
          fisicoL: num(f.mochila_fisico_l),
          diferenciaL: num(f.mochila_diferencia_l),
          toleranciaL: num(f.mochila_tolerancia_l),
          noImputableL: num(f.mochila_no_imputable_l),
          imputableL: num(f.mochila_imputable_l),
        }
      : null,
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
