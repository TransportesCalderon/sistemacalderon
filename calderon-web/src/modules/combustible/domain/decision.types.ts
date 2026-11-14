/** Migración 185 · Qué se hizo con la diferencia de un cierre y el pedido de quitar el descuento. Lo decide la base. */

export type Decision = 'descontar' | 'justificar';

export interface PedidoQuitar {
  id: number;
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'retirada';
  litros: number;
  motivo: string;
  evidencia: string;
  por: string | null;
  en: string | null;
  resueltoPor: string | null;
  resueltoEn: string | null;
  motivoResolucion: string | null;
  esMio: boolean;
  puedoResolver: boolean;
}

export interface DecisionCierre {
  decision: Decision | null;
  motivo: string | null;
  evidencia: string | null;
  por: string | null;
  en: string | null;
  aDescontarL: number | null;
  descuentoQuitadoL: number | null;
  pedido: PedidoQuitar | null;
}

type J = Record<string, unknown>;
const o = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const t = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

export function parsearDecision(d: unknown): DecisionCierre {
  const x = o(d);
  const p = x.pedido && typeof x.pedido === 'object' ? o(x.pedido) : null;
  return {
    decision: x.decision === 'descontar' || x.decision === 'justificar' ? x.decision : null,
    motivo: t(x.motivo),
    evidencia: t(x.evidencia),
    por: t(x.por),
    en: t(x.en),
    aDescontarL: n(x.a_descontar_l),
    descuentoQuitadoL: n(x.descuento_quitado_l),
    pedido: p
      ? {
          id: Number(p.id),
          estado: (['pendiente', 'aprobada', 'rechazada', 'retirada'].includes(String(p.estado)) ? p.estado : 'pendiente') as PedidoQuitar['estado'],
          litros: Number(p.litros ?? 0),
          motivo: t(p.motivo) ?? '',
          evidencia: t(p.evidencia) ?? '',
          por: t(p.por),
          en: t(p.en),
          resueltoPor: t(p.resuelto_por),
          resueltoEn: t(p.resuelto_en),
          motivoResolucion: t(p.motivo_resolucion),
          esMio: p.es_mio === true,
          puedoResolver: p.puedo_resolver === true,
        }
      : null,
  };
}

/** Migración 185 · Diferencias acumuladas por chofer (fue.fn_diferencias_choferes). */
export interface DiferenciaChofer {
  puesto: number;
  choferId: number;
  chofer: string;
  viajes: number;
  viajesFaltante: number;
  pctViajesFaltante: number | null;
  litrosFaltante: number;
  litrosSobrante: number;
  litrosDescontados: number;
  litrosJustificados: number;
  viajesJustificados: number;
  /** Migración 187: de los litros que faltaron, % descontado y % justificado. */
  pctDescontado: number | null;
  pctJustificado: number | null;
  /** Migración 193: lo que quedó dentro de la tolerancia (% de lo cargado): no se descuenta ni se justifica. */
  litrosTolerancia: number;
  pctTolerancia: number | null;
  promedioPorViaje: number | null;
  litrosCada1000Km: number | null;
  km: number;
}
export interface DiferenciasChoferes {
  total: {
    viajes: number;
    viajesFaltante: number;
    litrosFaltante: number;
    litrosDescontados: number;
    litrosJustificados: number;
    pctDescontado: number | null;
    pctJustificado: number | null;
    litrosTolerancia: number;
    pctTolerancia: number | null;
  };
  choferes: DiferenciaChofer[];
}
export function parsearDiferenciasChoferes(d: unknown): DiferenciasChoferes {
  const x = o(d);
  const tot = o(x.total);
  return {
    total: {
      viajes: Number(tot.viajes ?? 0),
      viajesFaltante: Number(tot.viajes_faltante ?? 0),
      litrosFaltante: Number(tot.litros_faltante ?? 0),
      litrosDescontados: Number(tot.litros_descontados ?? 0),
      litrosJustificados: Number(tot.litros_justificados ?? Math.max(0, Number(tot.litros_faltante ?? 0) - Number(tot.litros_descontados ?? 0))),
      pctDescontado: n(tot.pct_descontado),
      pctJustificado: n(tot.pct_justificado),
      litrosTolerancia: Number(tot.litros_tolerancia ?? 0),
      pctTolerancia: n(tot.pct_tolerancia),
    },
    choferes: (Array.isArray(x.choferes) ? (x.choferes as J[]) : []).map((c) => ({
      puesto: Number(c.puesto),
      choferId: Number(c.chofer_id),
      chofer: t(c.chofer) ?? '—',
      viajes: Number(c.viajes ?? 0),
      viajesFaltante: Number(c.viajes_faltante ?? 0),
      pctViajesFaltante: n(c.pct_viajes_faltante),
      litrosFaltante: Number(c.litros_faltante ?? 0),
      litrosSobrante: Number(c.litros_sobrante ?? 0),
      litrosDescontados: Number(c.litros_descontados ?? 0),
      litrosJustificados: Number(c.litros_justificados ?? 0),
      viajesJustificados: Number(c.viajes_justificados ?? 0),
      pctDescontado: n(c.pct_descontado),
      pctJustificado: n(c.pct_justificado),
      litrosTolerancia: Number(c.litros_tolerancia ?? 0),
      pctTolerancia: n(c.pct_tolerancia),
      promedioPorViaje: n(c.promedio_por_viaje),
      litrosCada1000Km: n(c.litros_cada_1000_km),
      km: Number(c.km ?? 0),
    })),
  };
}

/** Período del acumulado: el mes (AAAA-MM) o el trimestre que termina en ese mes. */
export function periodoAcumulado(mes: string, trimestre: boolean): { desde: string; hasta: string } {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const fin = new Date(Date.UTC(a, m, 0));
  const ini = new Date(Date.UTC(a, m - (trimestre ? 3 : 1), 1));
  const f = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: f(ini), hasta: f(fin) };
}
