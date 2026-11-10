import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migración 223 · Consumo aprendido: lo que MIDIÓ el motor en cada tramo terminado. De ahí sale el consumo
 * esperado por ruta, los litros que necesita cada camión para lo que le falta y la comparación de cada chofer
 * contra los demás en el mismo camión y ruta. Lo calcula la base; acá solo se lee.
 */
export const VERSION_CONSUMO_APRENDIDO = 223;

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export interface TramoLitros {
  origen: string;
  destino: string;
  conCarga: boolean;
  estado: string | null;
  km: number | null;
  l100km: number | null;
  litros: number | null;
  texto: string | null;
  motivo: string | null;
}
export interface LitrosRuta {
  tramos: TramoLitros[];
  km: number;
  litros: number;
  sinDato: number;
  completo: boolean;
}
export function parsearLitrosRuta(d: unknown): LitrosRuta {
  const o = obj(d);
  return {
    tramos: arr(o.tramos).map((t) => ({
      origen: txt(t.origen) ?? '—',
      destino: txt(t.destino) ?? '—',
      conCarga: t.con_carga !== false,
      estado: txt(t.estado),
      km: n(t.km),
      l100km: n(t.l_100km),
      litros: n(t.litros),
      texto: txt(t.texto),
      motivo: txt(t.motivo),
    })),
    km: n(o.km) ?? 0,
    litros: n(o.litros) ?? 0,
    sinDato: n(o.sin_dato) ?? 0,
    completo: o.completo === true,
  };
}

export interface RutaAprendida {
  origen: string;
  destino: string;
  conCarga: boolean;
  tramos: number;
  km: number | null;
  l100km: number | null;
  min: number | null;
  max: number | null;
  porMarca: { marca: string; tramos: number; l100km: number | null }[];
}
export interface ConsumoRutas {
  aprendidos: number;
  sinMedir: number;
  ultimo: FechaISO | null;
  rutas: RutaAprendida[];
  camiones: { camionId: number; patente: string; pendiente: LitrosRuta }[];
}
export function parsearConsumoRutas(d: unknown): ConsumoRutas {
  const o = obj(d);
  return {
    aprendidos: n(o.aprendidos) ?? 0,
    sinMedir: n(o.sin_medir) ?? 0,
    ultimo: txt(o.ultimo) as FechaISO | null,
    rutas: arr(o.rutas).map((r) => ({
      origen: txt(r.origen) ?? '—',
      destino: txt(r.destino) ?? '—',
      conCarga: r.con_carga !== false,
      tramos: n(r.tramos) ?? 0,
      km: n(r.km),
      l100km: n(r.l_100km),
      min: n(r.min),
      max: n(r.max),
      porMarca: arr(r.por_marca).map((m) => ({ marca: txt(m.marca) ?? 'Sin marca', tramos: n(m.tramos) ?? 0, l100km: n(m.l_100km) })),
    })),
    camiones: arr(o.camiones).map((c) => ({ camionId: n(c.camion_id) ?? 0, patente: txt(c.patente) ?? '', pendiente: parsearLitrosRuta(c.pendiente) })),
  };
}

export interface TramoChofer {
  tramoId: number;
  inicio: FechaISO;
  camion: string;
  origen: string;
  destino: string;
  conCarga: boolean;
  km: number | null;
  litros: number | null;
  l100km: number | null;
  esperadoL100km: number | null;
  base: string | null;
  programadorPct: number | null;
}
export interface ConsumoChofer {
  choferId: number;
  chofer: string;
  tramos: number;
  km: number;
  litros: number;
  l100km: number | null;
  kmComparados: number;
  litrosEsperados: number | null;
  litrosDeMas: number | null;
  desvioPct: number | null;
  programadorPct: number | null;
  programadorOtrosPct: number | null;
  ralentiL: number | null;
  marcado: boolean;
  detalle: TramoChofer[];
  revisadoPor: string | null;
  revisadoEn: FechaISO | null;
  comentario: string | null;
  iaEstado: 'esperando' | 'lista' | 'error' | null;
  iaTexto: string | null;
  iaError: string | null;
}
export interface ConsumoChoferes {
  mes: string;
  umbralPct: number;
  kmMin: number;
  calculadoEn: FechaISO | null;
  iaDisponible: boolean;
  choferes: ConsumoChofer[];
}
export function parsearConsumoChoferes(d: unknown): ConsumoChoferes {
  const o = obj(d);
  return {
    mes: txt(o.mes) ?? '',
    umbralPct: n(o.umbral_pct) ?? 10,
    kmMin: n(o.km_min) ?? 500,
    calculadoEn: txt(o.calculado_en) as FechaISO | null,
    iaDisponible: o.ia_disponible === true,
    choferes: arr(o.choferes).map((c) => ({
      choferId: n(c.chofer_id) ?? 0,
      chofer: txt(c.chofer) ?? '',
      tramos: n(c.tramos) ?? 0,
      km: n(c.km) ?? 0,
      litros: n(c.litros) ?? 0,
      l100km: n(c.l_100km),
      kmComparados: n(c.km_comparados) ?? 0,
      litrosEsperados: n(c.litros_esperados),
      litrosDeMas: n(c.litros_de_mas),
      desvioPct: n(c.desvio_pct),
      programadorPct: n(c.programador_pct),
      programadorOtrosPct: n(c.programador_otros_pct),
      ralentiL: n(c.ralenti_l),
      marcado: c.marcado === true,
      detalle: arr(c.detalle).map((t) => ({
        tramoId: n(t.tramo_id) ?? 0,
        inicio: (txt(t.inicio) ?? '') as FechaISO,
        camion: txt(t.camion) ?? '',
        origen: txt(t.origen) ?? '—',
        destino: txt(t.destino) ?? '—',
        conCarga: t.con_carga !== false,
        km: n(t.km),
        litros: n(t.litros),
        l100km: n(t.l_100km),
        esperadoL100km: n(t.esperado_l_100km),
        base: txt(t.base),
        programadorPct: n(t.programador_pct),
      })),
      revisadoPor: txt(c.revisado_por),
      revisadoEn: txt(c.revisado_en) as FechaISO | null,
      comentario: txt(c.comentario),
      iaEstado: c.ia_estado === 'esperando' || c.ia_estado === 'lista' || c.ia_estado === 'error' ? c.ia_estado : null,
      iaTexto: txt(c.ia_texto),
      iaError: txt(c.ia_error),
    })),
  };
}
