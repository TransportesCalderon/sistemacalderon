import { parsearLitrosRuta, type LitrosRuta } from '@/modules/combustible/domain/consumo-aprendido.types';
import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migración 194 · Seguimiento de los viajes en curso (Telemetría). La base calcula los números,
 * los compara con el objetivo del viaje, decide el resultado (bien / a mejorar / mal) y escribe
 * el mensaje para el chofer. Acá solo se convierten tipos.
 */
export const VERSION_SEGUIMIENTO = 194;
/** Migración 197: litros con lecturas mezcladas, motivo cuando faltan y medir «desde» un momento elegido. */
export const VERSION_SEGUIMIENTO_DESDE = 197;

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
  /** Migración 241: nota para la oficina (consumo alto con buen programador, línea sin objetivo). */
  nota: string | null;
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
  fuente: 'telemetria' | 'manual' | 'foto';
  resultado: Resultado;
  mensaje: string;
  /** Migración 197: desde cuándo se midió (null = desde la salida). */
  desde: FechaISO | null;
  /** Migración 240: foto de la computadora de a bordo (ruta en Storage). */
  foto: string | null;
}

/** Migración 240: lo que leyó la IA de la foto de la computadora de a bordo. */
export interface LecturaFoto {
  km: number | null;
  litros: number | null;
  l100km: number | null;
  programadorPct: number | null;
  avisos: string[];
}
export const VERSION_SEGUIMIENTO_FOTO = 240;
export const parsearLecturaFoto = (d: unknown): LecturaFoto => {
  const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
  return {
    km: n(o.km),
    litros: n(o.litros),
    l100km: n(o.l_100km),
    programadorPct: n(o.programador_pct),
    avisos: Array.isArray(o.avisos) ? o.avisos.map(String) : [],
  };
};

export interface ViajeEnCurso {
  viajeId: number;
  numero: string;
  camionId: number;
  patente: string;
  marca: string | null;
  choferId: number | null;
  chofer: string | null;
  /** Migración 214: el chofer del viaje, si no es el que maneja ahora (a él se le hace el cierre). */
  choferViaje: string | null;
  salidaTs: FechaISO;
  linea: string | null;
  km: number | null;
  litros: number | null;
  programadorPct: number | null;
  conTelemetria: boolean;
  /** Migración 197: por qué la telemetría no da los litros (texto de la base). */
  motivoSinLitros: string | null;
  evaluacion: Evaluacion;
  ultimoControl: { en: FechaISO; por: string | null; resultado: Resultado; l100km: number | null; programadorPct: number | null; fuente: string } | null;
  controlesHoy: number;
  /** Migración 259: última solicitud de carga por sistema del viaje. */
  solicitudCarga?: { estado: EstadoSolicitud; en: FechaISO; orden: string | null; motivoRechazo: string | null } | null;
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
    nota: txt(e.nota),
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
      choferViaje: txt(v.chofer_viaje),
      salidaTs: (txt(v.salida_ts) ?? '') as FechaISO,
      linea: txt(v.linea),
      km: n(v.km),
      litros: n(v.litros),
      programadorPct: n(v.programador_pct),
      conTelemetria: v.con_telemetria === true,
      motivoSinLitros: txt(v.motivo_sin_litros),
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
      solicitudCarga: v.solicitud_carga
        ? {
            estado: estadoSolicitud(obj(v.solicitud_carga).estado) ?? 'pendiente',
            en: (txt(obj(v.solicitud_carga).en) ?? '') as FechaISO,
            orden: txt(obj(v.solicitud_carga).orden),
            motivoRechazo: txt(obj(v.solicitud_carga).motivo_rechazo),
          }
        : null,
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
    fuente: c.fuente === 'manual' ? 'manual' : c.fuente === 'foto' ? 'foto' : 'telemetria',
    resultado: resultado(c.resultado),
    mensaje: txt(c.mensaje) ?? '',
    desde: txt(c.desde) as FechaISO | null,
    foto: txt(c.foto),
  }));

/** Migración 197: los números de un viaje en curso desde el momento elegido. */
export interface TramoSeguimiento {
  desde: FechaISO;
  km: number | null;
  litros: number | null;
  programadorPct: number | null;
  conTelemetria: boolean;
  motivoSinLitros: string | null;
  evaluacion: Evaluacion;
}

export function parsearTramo(d: unknown): TramoSeguimiento {
  const x = obj(d);
  return {
    desde: (txt(x.desde) ?? '') as FechaISO,
    km: n(x.km),
    litros: n(x.litros),
    programadorPct: n(x.programador_pct),
    conTelemetria: x.con_telemetria === true,
    motivoSinLitros: txt(x.motivo_sin_litros),
    evaluacion: parsearEvaluacion(x.evaluacion),
  };
}

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
  /** Migración 221: inicial separado (los tanques se llenan primero), lo cargado en el viaje y la línea por los tramos. */
  inicialTanquesL: number | null;
  inicialMochilaL: number | null;
  /** Migración 233: lo que faltó para llenar en la carga de salida (ya descontado del inicial). */
  faltanteSalidaL: number | null;
  cargasViajeL: number;
  cargasViaje: { estacion: string; litros: number }[];
  linea: string | null;
  lineaTramos: boolean;
  /** Migración 223: lo necesario para lo que le falta (consumo medido en esas rutas) y lo que entra en los tanques. */
  litrosParaLlenar: number | null;
  litrosParaLlegar: number | null;
  necesario: LitrosRuta | null;
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
  /** Migración 259: por mensaje (WhatsApp) o por sistema (solicitud que aprueba quien autoriza cargas). */
  via?: 'mensaje' | 'sistema';
  estado?: EstadoSolicitud | null;
  aCargar?: string | null;
  orden?: string | null;
  ordenEstado?: string | null;
  motivoRechazo?: string | null;
  resueltoEn?: FechaISO | null;
  resueltoPor?: string | null;
}

// ---- Migración 259: solicitud de carga por sistema ----
export const VERSION_SOLICITUD_CARGA = 259;
export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada';
export const ETIQUETA_SOLICITUD: Record<EstadoSolicitud, string> = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };
const estadoSolicitud = (v: unknown): EstadoSolicitud | null => (v === 'pendiente' || v === 'aprobada' || v === 'rechazada' ? v : null);

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
    inicialTanquesL: n(x.inicial_tanques_l),
    inicialMochilaL: n(x.inicial_mochila_l),
    faltanteSalidaL: n(x.faltante_salida_l),
    cargasViajeL: n(x.cargas_viaje_l) ?? 0,
    cargasViaje: arr(x.cargas_viaje).map((c) => ({ estacion: txt(c.estacion) ?? '', litros: Number(c.litros ?? 0) })),
    linea: txt(x.linea),
    lineaTramos: x.linea_tramos === true,
    litrosParaLlenar: n(x.litros_para_llenar),
    litrosParaLlegar: n(x.litros_para_llegar),
    necesario: x.necesario ? parsearLitrosRuta(x.necesario) : null,
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
    via: p.via === 'sistema' ? 'sistema' : 'mensaje',
    estado: estadoSolicitud(p.estado),
    aCargar: txt(p.a_cargar),
    orden: txt(p.orden),
    ordenEstado: txt(p.orden_estado),
    motivoRechazo: txt(p.motivo_rechazo),
    resueltoEn: txt(p.resuelto_en) as FechaISO | null,
    resueltoPor: txt(p.resuelto_por),
  }));
