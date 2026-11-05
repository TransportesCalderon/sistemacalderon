import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migración 194 · Seguimiento de los viajes en curso (Telemetría). La base calcula los números,
 * los compara con el objetivo del viaje, decide el resultado (bien / a mejorar / mal) y escribe
 * el mensaje para el chofer. Acá solo se convierten tipos.
 */
export const VERSION_SEGUIMIENTO = 194;

export type Resultado = 'bien' | 'a_mejorar' | 'mal' | 'sin_datos';
export type Estado = 'verde' | 'naranja' | 'rojo' | null;

export const ETIQUETA_RESULTADO: Record<Resultado, string> = { bien: 'Bien', a_mejorar: 'A mejorar', mal: 'Mal', sin_datos: 'Sin datos' };

export interface Evaluacion {
  resultado: Resultado;
  l100km: number | null;
  objetivoL100km: number | null;
  estadoConsumo: Estado;
  estadoProgramador: Estado;
  mensaje: string;
}

export interface ControlViaje {
  id: number;
  en: FechaISO;
  por: string | null;
  km: number | null;
  litros: number | null;
  l100km: number | null;
  programadorPct: number | null;
  objetivoL100km: number | null;
  fuente: 'telemetria' | 'manual';
  resultado: Resultado;
  mensaje: string;
}

export interface ViajeEnCurso {
  viajeId: number;
  numero: string;
  camionId: number;
  patente: string;
  marca: string | null;
  choferId: number | null;
  chofer: string | null;
  salidaTs: FechaISO;
  linea: string | null;
  km: number | null;
  litros: number | null;
  programadorPct: number | null;
  conTelemetria: boolean;
  evaluacion: Evaluacion;
  ultimoControl: { en: FechaISO; por: string | null; resultado: Resultado; l100km: number | null; programadorPct: number | null; fuente: string } | null;
  controlesHoy: number;
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const resultado = (v: unknown): Resultado => (v === 'bien' || v === 'a_mejorar' || v === 'mal' ? v : 'sin_datos');
const estado = (v: unknown): Estado => (v === 'verde' || v === 'naranja' || v === 'rojo' ? v : null);

export function parsearEvaluacion(d: unknown): Evaluacion {
  const e = obj(d);
  return {
    resultado: resultado(e.resultado),
    l100km: n(e.l_100km),
    objetivoL100km: n(e.objetivo_l_100km),
    estadoConsumo: estado(e.estado_consumo),
    estadoProgramador: estado(e.estado_programador),
    mensaje: txt(e.mensaje) ?? '',
  };
}

export const parsearViajesEnCurso = (d: unknown): ViajeEnCurso[] =>
  arr(d).map((v) => {
    const u = v.ultimo_control ? obj(v.ultimo_control) : null;
    return {
      viajeId: Number(v.viaje_id),
      numero: txt(v.numero) ?? '',
      camionId: Number(v.camion_id),
      patente: txt(v.patente) ?? '',
      marca: txt(v.marca),
      choferId: n(v.chofer_id),
      chofer: txt(v.chofer),
      salidaTs: (txt(v.salida_ts) ?? '') as FechaISO,
      linea: txt(v.linea),
      km: n(v.km),
      litros: n(v.litros),
      programadorPct: n(v.programador_pct),
      conTelemetria: v.con_telemetria === true,
      evaluacion: parsearEvaluacion(v.evaluacion),
      ultimoControl: u
        ? {
            en: (txt(u.en) ?? '') as FechaISO,
            por: txt(u.por),
            resultado: resultado(u.resultado),
            l100km: n(u.l_100km),
            programadorPct: n(u.programador_pct),
            fuente: txt(u.fuente) ?? '',
          }
        : null,
      controlesHoy: Number(v.controles_hoy ?? 0),
    };
  });

export const parsearControles = (d: unknown): ControlViaje[] =>
  arr(d).map((c) => ({
    id: Number(c.id),
    en: (txt(c.en) ?? '') as FechaISO,
    por: txt(c.por),
    km: n(c.km),
    litros: n(c.litros),
    l100km: n(c.l_100km),
    programadorPct: n(c.programador_pct),
    objetivoL100km: n(c.objetivo_l_100km),
    fuente: c.fuente === 'manual' ? 'manual' : 'telemetria',
    resultado: resultado(c.resultado),
    mensaje: txt(c.mensaje) ?? '',
  }));

// ---- Migración 195: pedido de carga de combustible (mensaje para Gerencia) ----
export const VERSION_PEDIDO_CARGA = 195;

export interface DatosPedidoCarga {
  inicialL: number | null;
  km: number | null;
  gastoL: number | null;
  tanquesL: number | null;
  mochilaL: number | null;
  l100km: number | null;
  programadorPct: number | null;
  litrosSugeridos: number | null;
  precio: number | null;
  moneda: string | null;
  precioFecha: FechaISO | null;
  conTelemetria: boolean;
  aviso: string | null;
}

export interface PedidoCarga {
  id: number;
  en: FechaISO;
  por: string | null;
  estacion: string | null;
  litros: number;
  importe: number | null;
  moneda: string | null;
  mensaje: string;
}

export function parsearDatosPedido(d: unknown): DatosPedidoCarga {
  const x = obj(d);
  return {
    inicialL: n(x.inicial_l),
    km: n(x.km),
    gastoL: n(x.gasto_l),
    tanquesL: n(x.tanques_l),
    mochilaL: n(x.mochila_l),
    l100km: n(x.l_100km),
    programadorPct: n(x.programador_pct),
    litrosSugeridos: n(x.litros_sugeridos),
    precio: n(x.precio),
    moneda: txt(x.moneda),
    precioFecha: txt(x.precio_fecha) as FechaISO | null,
    conTelemetria: x.con_telemetria === true,
    aviso: txt(x.aviso),
  };
}

export const parsearPedidos = (d: unknown): PedidoCarga[] =>
  arr(d).map((p) => ({
    id: Number(p.id),
    en: (txt(p.en) ?? '') as FechaISO,
    por: txt(p.por),
    estacion: txt(p.estacion),
    litros: Number(p.litros ?? 0),
    importe: n(p.importe),
    moneda: txt(p.moneda),
    mensaje: txt(p.mensaje) ?? '',
  }));
