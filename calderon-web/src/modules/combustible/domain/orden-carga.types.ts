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
  modo: 'cuenta' | 'empresa' | null;
}

export interface PreparadoOrden {
  patente: string;
  choferId: number | null;
  chofer: string | null;
  litrosParaLlenar: number | null;
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
}

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
    modo: x.modo === 'cuenta' || x.modo === 'empresa' ? x.modo : null,
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
