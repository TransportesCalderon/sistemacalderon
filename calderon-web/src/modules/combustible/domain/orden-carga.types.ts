import type { FechaISO } from '@/shared/types/dominio';

/** Migración 234: orden de carga de combustible (Gerencia) con QR para el chofer y palabra de seguridad para la estación. */

export type ModoOrden = 'litros' | 'importe' | 'llenar';
export type EstadoOrden = 'emitida' | 'autorizada' | 'cargada' | 'anulada' | 'bloqueada' | 'vencida';

export const ETIQUETA_MODO: Record<ModoOrden, string> = { litros: 'Por litros', importe: 'Por importe', llenar: 'Llenar tanques y mochila' };
export const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  emitida: 'Esperando la estación',
  autorizada: 'Cargando',
  cargada: 'Cargada',
  anulada: 'Anulada',
  bloqueada: 'Bloqueada',
  vencida: 'Vencida',
};

export interface EstadoMail {
  activo: boolean;
  remitente: string | null;
  conClaves: boolean;
  conHttp: boolean;
  pendientes: number;
  /** Migración 236: la cuenta dio el permiso (Hotmail) o se usa Microsoft 365 de empresa. */
  conPermiso: boolean;
  modo: 'cuenta' | 'empresa' | 'smtp' | null;
}

/** Migración 248: qué se carga (solo tanques o tanques y mochila) y cómo cada uno. */
export interface DetalleOrden {
  destino: 'tanques' | 'tanques_mochila';
  tanques: { modo: 'lleno' | 'litros'; litros?: number | null };
  mochila?: { modo: 'llena' | 'litros'; litros?: number | null };
}

export interface PreparadoOrden {
  patente: string;
  choferId: number | null;
  chofer: string | null;
  litrosParaLlenar: number | null;
  /** Migración 248: capacidad de la mochila (tanques de tipo mochila); null si no tiene. */
  capacidadMochilaL: number | null;
  /** Migración 249: de dónde salen los litros para llenar (motor o km × consumo). */
  estimacionTexto: string | null;
  litrosActuales: number | null;
  capacidadL: number | null;
  motivoSinCalculo: string | null;
  estacion: string | null;
  correo: string | null;
  precio: number | null;
  moneda: string | null;
  vigente: string | null;
  /** Migración 259: solicitud de carga pendiente del camión (Seguimiento). */
  pendiente?: { id: number; por: string | null; en: FechaISO } | null;
  mail: EstadoMail;
}

/** Migración 259 · Solicitud de carga pedida desde Seguimiento de viaje (espera que alguien con «Autoriza cargas» la apruebe). */
export const VERSION_SOLICITUD_CARGA = 259;
export interface SolicitudCarga {
  id: number;
  en: FechaISO;
  por: string | null;
  viaje: string | null;
  camionId: number;
  patente: string;
  choferId: number | null;
  chofer: string | null;
  estacionId: number | null;
  estacion: string | null;
  correo: string | null;
  detalle: DetalleOrden | null;
  aCargar: string | null;
  /** Litros aproximados que pidió. */
  litros: number;
  /** Migración 263: lo que recomendó el sistema al pedirla (null en pedidos anteriores o sin datos del camión). */
  recomendadoL: number | null;
  paraLlegarL: number | null;
  paraLlenarL: number | null;
  observacion: string | null;
  mensaje: string;
}

export interface OrdenCarga {
  id: number;
  numero: string;
  camionId: number;
  patente: string;
  chofer: string | null;
  estacion: string;
  correo: string | null;
  modo: ModoOrden;
  autorizado: string;
  litrosCalculados: number | null;
  estado: EstadoOrden;
  venceEn: FechaISO;
  creadaEn: FechaISO;
  creadaPor: string | null;
  autorizadaEn: FechaISO | null;
  cargadaEn: FechaISO | null;
  litrosCargados: number | null;
  importeCargado: number | null;
  moneda: string | null;
  diferenciaL: number | null;
  alerta: string | null;
  revisadaEn: FechaISO | null;
  tickets: { ruta: string }[];
  intentos: number;
  motivoAnulacion: string | null;
  observacion: string | null;
  mailEstado: 'pendiente' | 'enviado' | 'error' | null;
  mailError: string | null;
}

export interface CreadaOrden {
  id: number;
  numero: string;
  palabra: string;
  litrosCalculados: number | null;
  mail: 'en_cola' | 'sin_configurar' | 'sin_correo';
  correo: string | null;
}

export interface MiOrden {
  id: number;
  numero: string;
  estado: 'emitida' | 'autorizada';
  token: string;
  patente: string;
  estacion: string;
  /** Migración 252: orden de un genset (al terminar se anota el horómetro). */
  genset: boolean;
}

/** Migración 252 · Órdenes de carga para gensets. */
export interface GensetOpcion {
  id: number;
  codigo: string;
  capacidadL: number | null;
  tractor: string | null;
}
export interface PreparadoGenset {
  codigo: string;
  capacidadL: number | null;
  semi: string | null;
  tractor: string | null;
  choferId: number | null;
  chofer: string | null;
  correo: string | null;
  vigente: string | null;
  mail: EstadoMail;
}
export const parsearGensetsOrden = (d: unknown): GensetOpcion[] =>
  a(d).map((x) => ({ id: Number(x.id), codigo: t(x.codigo) ?? '', capacidadL: n(x.capacidad_l), tractor: t(x.tractor) }));
export const parsearPreparadoGenset = (d: unknown): PreparadoGenset => {
  const x = o(d);
  return {
    codigo: t(x.codigo) ?? '',
    capacidadL: n(x.capacidad_l),
    semi: t(x.semi),
    tractor: t(x.tractor),
    choferId: n(x.chofer_id),
    chofer: t(x.chofer),
    correo: t(x.correo),
    vigente: t(x.vigente),
    mail: parsearEstadoMail(x.mail),
  };
};

/** Migración 253 · Carga de una orden terminada, lista para registrar (la propuesta la arma la base). */
export interface PorRegistrar {
  ordenId: number;
  numero: string;
  patente: string;
  chofer: string | null;
  estacion: string;
  fechaHora: string | null;
  litros: number | null;
  precioUnitario: number | null;
  moneda: string | null;
  importe: number | null;
  odometroKm: number | null;
  tanqueLleno: boolean;
  autorizado: string;
  ticketNumero: string | null;
  tickets: string[];
  alerta: string | null;
}
export const parsearPorRegistrar = (d: unknown): PorRegistrar[] =>
  a(d).map((x) => ({
    ordenId: Number(x.orden_id),
    numero: t(x.numero) ?? '',
    patente: t(x.patente) ?? '',
    chofer: t(x.chofer),
    estacion: t(x.estacion) ?? '',
    fechaHora: t(x.fecha_hora),
    litros: n(x.litros),
    precioUnitario: n(x.precio_unitario),
    moneda: t(x.moneda),
    importe: n(x.importe),
    odometroKm: n(x.odometro_km),
    tanqueLleno: x.tanque_lleno === true,
    autorizado: t(x.autorizado) ?? '',
    ticketNumero: t(x.ticket_numero),
    tickets: (Array.isArray(x.tickets) ? (x.tickets as Record<string, unknown>[]) : []).map((f) => String(f.ruta ?? '')).filter(Boolean),
    alerta: t(x.alerta),
  }));

export interface OrdenPublica {
  estado: EstadoOrden | 'no_existe';
  numero: string | null;
  chofer: string | null;
  patente: string | null;
  estacion: string | null;
  autorizado: string | null;
  venceEn: FechaISO | null;
}

type J = Record<string, unknown>;
const o = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const a = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const t = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const MODOS: ModoOrden[] = ['litros', 'importe', 'llenar'];
const ESTADOS: EstadoOrden[] = ['emitida', 'autorizada', 'cargada', 'anulada', 'bloqueada', 'vencida'];
const modo = (v: unknown): ModoOrden => (MODOS.includes(v as ModoOrden) ? (v as ModoOrden) : 'litros');
const estado = (v: unknown): EstadoOrden => (ESTADOS.includes(v as EstadoOrden) ? (v as EstadoOrden) : 'emitida');

export const parsearEstadoMail = (d: unknown): EstadoMail => {
  const x = o(d);
  return {
    activo: x.activo === true,
    remitente: t(x.remitente),
    conClaves: x.con_claves === true,
    conHttp: x.con_http === true,
    pendientes: n(x.pendientes) ?? 0,
    conPermiso: x.con_permiso === true,
    modo: x.modo === 'cuenta' || x.modo === 'empresa' || x.modo === 'smtp' ? x.modo : null,
  };
};

export const parsearPreparado = (d: unknown): PreparadoOrden => {
  const x = o(d);
  const c = o(x.combustible);
  return {
    patente: t(x.patente) ?? '',
    choferId: n(x.chofer_id),
    chofer: t(x.chofer),
    litrosParaLlenar: n(x.litros_para_llenar),
    capacidadMochilaL: n(x.capacidad_mochila_l),
    estimacionTexto: t(o(x.estimacion).texto),
    litrosActuales: n(c.litros),
    capacidadL: n(c.capacidad_l),
    motivoSinCalculo: t(c.motivo),
    estacion: t(x.estacion),
    correo: t(x.correo),
    precio: n(x.precio),
    moneda: t(x.moneda),
    vigente: t(x.vigente),
    pendiente: x.pendiente ? { id: Number(o(x.pendiente).id), por: t(o(x.pendiente).por), en: (t(o(x.pendiente).en) ?? '') as FechaISO } : null,
    mail: parsearEstadoMail(x.mail),
  };
};

/** Migración 259: lo que se carga, como lo guarda la base (fue.fn_detalle_orden). */
export const parsearDetalle = (d: unknown): DetalleOrden | null => {
  const x = o(d);
  if (x.destino !== 'tanques' && x.destino !== 'tanques_mochila') return null;
  const tq = o(x.tanques);
  const mo = o(x.mochila);
  return {
    destino: x.destino,
    tanques: { modo: tq.modo === 'litros' ? 'litros' : 'lleno', litros: n(tq.litros) },
    ...(x.destino === 'tanques_mochila' ? { mochila: { modo: mo.modo === 'litros' ? ('litros' as const) : ('llena' as const), litros: n(mo.litros) } } : {}),
  };
};

export const parsearSolicitudes = (d: unknown): SolicitudCarga[] =>
  a(d).map((x) => ({
    id: Number(x.id),
    en: (t(x.en) ?? '') as FechaISO,
    por: t(x.por),
    viaje: t(x.viaje),
    camionId: Number(x.camion_id),
    patente: t(x.patente) ?? '',
    choferId: n(x.chofer_id),
    chofer: t(x.chofer),
    estacionId: n(x.estacion_id),
    estacion: t(x.estacion),
    correo: t(x.correo),
    detalle: parsearDetalle(x.detalle),
    aCargar: t(x.a_cargar),
    litros: n(x.litros) ?? 0,
    recomendadoL: n(x.recomendado_l),
    paraLlegarL: n(x.para_llegar_l),
    paraLlenarL: n(x.para_llenar_l),
    observacion: t(x.observacion),
    mensaje: t(x.mensaje) ?? '',
  }));

/**
 * Migración 263 · Pedido y orden de carga. La recomendación (la calcula el sistema), el pedido (lo escribe
 * Telemetría) y la orden (la decide quien autoriza) pueden ser distintos: acá se dice cuánto se aparta un
 * número de otro, en palabras. null si falta alguno de los dos.
 */
export function compararLitros(valor: number | null, referencia: number | null): { diferencia: number; texto: string } | null {
  if (valor === null || referencia === null || !Number.isFinite(valor) || !Number.isFinite(referencia)) return null;
  const diferencia = Math.round(valor - referencia);
  return { diferencia, texto: diferencia === 0 ? 'igual' : `${Math.abs(diferencia).toLocaleString('es-AR')} L ${diferencia > 0 ? 'más' : 'menos'}` };
}

export const parsearOrdenes = (d: unknown): OrdenCarga[] =>
  a(d).map((x) => ({
    id: Number(x.id),
    numero: t(x.numero) ?? '',
    camionId: Number(x.camion_id),
    patente: t(x.patente) ?? '',
    chofer: t(x.chofer),
    estacion: t(x.estacion) ?? '',
    correo: t(x.correo),
    modo: modo(x.modo),
    autorizado: t(x.autorizado) ?? '',
    litrosCalculados: n(x.litros_calculados),
    estado: estado(x.estado),
    venceEn: (t(x.vence_en) ?? '') as FechaISO,
    creadaEn: (t(x.creada_en) ?? '') as FechaISO,
    creadaPor: t(x.creada_por),
    autorizadaEn: t(x.autorizada_en) as FechaISO | null,
    cargadaEn: t(x.cargada_en) as FechaISO | null,
    litrosCargados: n(x.litros_cargados),
    importeCargado: n(x.importe_cargado),
    moneda: t(x.moneda),
    diferenciaL: n(x.diferencia_l),
    alerta: t(x.alerta),
    revisadaEn: t(x.revisada_en) as FechaISO | null,
    tickets: a(x.tickets).map((y) => ({ ruta: t(y.ruta) ?? '' })),
    intentos: n(x.intentos) ?? 0,
    motivoAnulacion: t(x.motivo_anulacion),
    observacion: t(x.observacion),
    mailEstado: x.mail_estado === 'pendiente' || x.mail_estado === 'enviado' || x.mail_estado === 'error' ? x.mail_estado : null,
    mailError: t(x.mail_error),
  }));

export const parsearCreada = (d: unknown): CreadaOrden => {
  const x = o(d);
  return {
    id: Number(x.id),
    numero: t(x.numero) ?? '',
    palabra: t(x.palabra) ?? '',
    litrosCalculados: n(x.litros_calculados),
    mail: x.mail === 'en_cola' || x.mail === 'sin_correo' ? x.mail : 'sin_configurar',
    correo: t(x.correo),
  };
};

export const parsearMisOrdenes = (d: unknown): MiOrden[] =>
  a(d).map((x) => ({
    id: Number(x.id),
    numero: t(x.numero) ?? '',
    estado: x.estado === 'autorizada' ? 'autorizada' : 'emitida',
    token: t(x.token) ?? '',
    patente: t(x.patente) ?? '',
    estacion: t(x.estacion) ?? '',
    genset: x.genset === true,
  }));

export const parsearOrdenPublica = (d: unknown): OrdenPublica => {
  const x = o(d);
  return {
    estado: x.estado === 'no_existe' ? 'no_existe' : estado(x.estado),
    numero: t(x.numero),
    chofer: t(x.chofer),
    patente: t(x.patente),
    estacion: t(x.estacion),
    autorizado: t(x.autorizado),
    venceEn: t(x.vence_en) as FechaISO | null,
  };
};

/** Dirección del QR: la página pública donde el playero confirma la carga. */
export const urlQr = (origen: string, token: string) => `${origen.replace(/\/$/, '')}/qr/${token}`;
