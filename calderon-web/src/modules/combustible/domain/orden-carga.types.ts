import type { FechaISO } from '@/shared/types/dominio';

/** Migración 234: orden de carga de combustible (Gerencia) con QR para el chofer y palabra de seguridad para la estación. */
export const VERSION_ORDEN_CARGA = 234;

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
  mail: EstadoMail;
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
    mail: parsearEstadoMail(x.mail),
  };
};

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
