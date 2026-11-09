import type { FechaISO } from '@/shared/types/dominio';
import type { Equipo as EquipoVenc } from './vencimientos.types';

/** Migración 215: los gensets también tienen mantenimiento (por horas del horómetro). */
export type Equipo = EquipoVenc | 'genset';
export const VERSION_MANT_GENSET = 215;
/** Migración 218: «no aplica a este equipo» en el plan. */
export const VERSION_NO_APLICA = 218;
export const ETIQUETA_EQUIPO: Record<Equipo, string> = { tractor: 'Tractor', semi: 'Semi', genset: 'Genset' };
/** Unidad de la medida del equipo: km del tractor, horas del genset (el semi no tiene). */
export const unidadDe = (e: Equipo): 'km' | 'h' => (e === 'genset' ? 'h' : 'km');

/**
 * Migración 199 · Mantenimiento (M2): plan de mantenimiento y órdenes de trabajo.
 * La base calcula cuándo toca cada tarea, genera las OT, controla quién hace qué y arma el mensaje.
 * Acá solo se convierten tipos.
 */
export const VERSION_MANTENIMIENTO = 199;

export type EstadoOt = 'pendiente' | 'en_curso' | 'terminada' | 'verificada' | 'anulada';
export type Prioridad = 'normal' | 'alta' | 'urgente';
export type OrigenOt = 'plan' | 'vencimiento' | 'puntual';
/** Migración 220: «sin_registro» = no se sabe cuándo se hizo (última vez vacía, no sale la OT sola). */
export type EstadoPlan = 'vencida' | 'proxima' | 'al_dia' | 'sin_km' | 'sin_registro';

export const ETIQUETA_ESTADO_OT: Record<EstadoOt, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  terminada: 'Terminada',
  verificada: 'Verificada',
  anulada: 'Anulada',
};
export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
export const ETIQUETA_ORIGEN: Record<OrigenOt, string> = { plan: 'Plan', vencimiento: 'Vencimiento', puntual: 'Pedida' };
export const ETIQUETA_ESTADO_PLAN: Record<EstadoPlan, string> = {
  vencida: 'Toca ya',
  proxima: 'Se acerca',
  al_dia: 'Al día',
  sin_km: 'Sin km',
  sin_registro: 'Sin registro',
};

export interface Zona {
  codigo: string;
  nombre: string;
  tractor: boolean;
  semi: boolean;
  genset: boolean;
}
export interface EquipoMant {
  equipo: Equipo;
  id: number;
  patente: string;
  descripcion: string | null;
}
export interface Persona {
  id: number;
  nombre: string;
}
export interface NotaOt {
  texto: string;
  por: string | null;
  en: FechaISO;
}

export interface OrdenTrabajo {
  id: number;
  numero: string;
  origen: OrigenOt;
  equipo: Equipo;
  equipoId: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  tipoSemi: string | null;
  titulo: string;
  descripcion: string | null;
  zonas: string[];
  prioridad: Prioridad;
  fechaLimite: string | null;
  kmLimite: number | null;
  kmActual: number | null;
  atrasada: boolean;
  estado: EstadoOt;
  asignadoA: number | null;
  asignado: string | null;
  mia: boolean;
  creadoPor: string | null;
  creadoPorId: number | null;
  creadoEn: FechaISO;
  terminadaEn: FechaISO | null;
  terminadaPor: string | null;
  terminadaPorId: number | null;
  trabajoRealizado: string | null;
  kmAlTerminar: number | null;
  repuestos: string | null;
  costo: number | null;
  moneda: string | null;
  proveedor: string | null;
  verificadaPor: string | null;
  motivoAnulacion: string | null;
  mensaje: string;
  /** Migración 216: costo (CLP) de los insumos del stock usados en la orden (null si no se usó ninguno). */
  costoInsumos: number | null;
  notas: NotaOt[];
}

export interface EquipoPlan {
  equipo: Equipo;
  equipoId: number;
  patente: string;
  baseFecha: string | null;
  baseKm: number | null;
  baseOrigen: 'ot' | 'cargada' | 'alta_tarea' | 'sin_registro';
  proximaFecha: string | null;
  proximoKm: number | null;
  kmActual: number | null;
  estado: EstadoPlan;
  otAbierta: number | null;
  otNumero: string | null;
}

export interface TareaPlan {
  id: number;
  nombre: string;
  descripcion: string | null;
  aplica: Equipo;
  marca: string | null;
  tipoSemi: string | null;
  cadaDias: number | null;
  cadaKm: number | null;
  avisoDias: number;
  avisoKm: number;
  /** Migración 215: gensets. */
  cadaHoras: number | null;
  avisoHoras: number;
  zonas: string[];
  prioridad: Prioridad;
  activo: boolean;
  version: number;
  equipos: EquipoPlan[];
  /** Migración 218: equipos a los que la tarea no se aplica (con el motivo). */
  noAplica: { equipo: Equipo; equipoId: number; patente: string; motivo: string }[];
}

export interface AvisoOt {
  id: number;
  numero: string;
  tipo: 'nueva' | 'atrasada';
  patente: string;
  equipo: Equipo;
  titulo: string;
  prioridad: Prioridad;
  fechaLimite: string | null;
  kmLimite: number | null;
  asignada: boolean;
  mensaje: string;
}

type J = Record<string, unknown>;
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const equipo = (v: unknown): Equipo => (v === 'semi' ? 'semi' : v === 'genset' ? 'genset' : 'tractor');
const prioridad = (v: unknown): Prioridad => (v === 'alta' || v === 'urgente' ? v : 'normal');
const estadoOt = (v: unknown): EstadoOt => (v === 'en_curso' || v === 'terminada' || v === 'verificada' || v === 'anulada' ? v : 'pendiente');
const origen = (v: unknown): OrigenOt => (v === 'plan' || v === 'vencimiento' ? v : 'puntual');
const estadoPlan = (v: unknown): EstadoPlan => (v === 'vencida' || v === 'proxima' || v === 'sin_km' || v === 'sin_registro' ? v : 'al_dia');

export const parsearZonas = (d: unknown): Zona[] =>
  arr(d).map((z) => ({ codigo: txt(z.codigo) ?? '', nombre: txt(z.nombre) ?? '', tractor: z.tractor === true, semi: z.semi === true, genset: z.genset === true }));
export const parsearEquiposMant = (d: unknown): EquipoMant[] =>
  arr(d).map((e) => ({ equipo: equipo(e.equipo), id: Number(e.id), patente: txt(e.patente) ?? '', descripcion: txt(e.descripcion) }));
export const parsearPersonas = (d: unknown): Persona[] =>
  arr(d)
    .map((p) => ({ id: Number(p.id), nombre: txt(p.nombre) ?? '' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

export const parsearOrdenes = (d: unknown): OrdenTrabajo[] =>
  arr(d).map((o) => ({
    id: Number(o.id),
    numero: txt(o.numero) ?? '',
    origen: origen(o.origen),
    equipo: equipo(o.equipo),
    equipoId: Number(o.equipo_id),
    patente: txt(o.patente) ?? '',
    marca: txt(o.marca),
    modelo: txt(o.modelo),
    tipoSemi: txt(o.tipo_semi),
    titulo: txt(o.titulo) ?? '',
    descripcion: txt(o.descripcion),
    zonas: textos(o.zonas),
    prioridad: prioridad(o.prioridad),
    fechaLimite: txt(o.fecha_limite),
    kmLimite: n(o.km_limite),
    kmActual: n(o.km_actual),
    atrasada: o.atrasada === true,
    estado: estadoOt(o.estado),
    asignadoA: n(o.asignado_a),
    asignado: txt(o.asignado),
    mia: o.mia === true,
    creadoPor: txt(o.creado_por),
    creadoPorId: n(o.creado_por_id),
    creadoEn: (txt(o.creado_en) ?? '') as FechaISO,
    terminadaEn: txt(o.terminada_en) as FechaISO | null,
    terminadaPor: txt(o.terminada_por),
    terminadaPorId: n(o.terminada_por_id),
    trabajoRealizado: txt(o.trabajo_realizado),
    kmAlTerminar: n(o.km_al_terminar),
    repuestos: txt(o.repuestos),
    costo: n(o.costo),
    moneda: txt(o.moneda),
    proveedor: txt(o.proveedor),
    verificadaPor: txt(o.verificada_por),
    motivoAnulacion: txt(o.motivo_anulacion),
    mensaje: txt(o.mensaje) ?? '',
    costoInsumos: n(o.costo_insumos),
    notas: arr(o.notas).map((x) => ({ texto: txt(x.texto) ?? '', por: txt(x.por), en: (txt(x.en) ?? '') as FechaISO })),
  }));

export const parsearPlan = (d: unknown): TareaPlan[] =>
  arr(d).map((t) => ({
    id: Number(t.id),
    nombre: txt(t.nombre) ?? '',
    descripcion: txt(t.descripcion),
    aplica: equipo(t.aplica),
    marca: txt(t.marca),
    tipoSemi: txt(t.tipo_semi),
    cadaDias: n(t.cada_dias),
    cadaKm: n(t.cada_km),
    avisoDias: Number(t.aviso_dias ?? 7),
    avisoKm: Number(t.aviso_km ?? 1000),
    cadaHoras: n(t.cada_horas),
    avisoHoras: Number(t.aviso_horas ?? 50),
    zonas: textos(t.zonas),
    prioridad: prioridad(t.prioridad),
    activo: t.activo !== false,
    version: Number(t.version ?? 1),
    equipos: arr(t.equipos).map((e) => ({
      equipo: equipo(e.equipo),
      equipoId: Number(e.equipo_id),
      patente: txt(e.patente) ?? '',
      baseFecha: txt(e.base_fecha),
      baseKm: n(e.base_km),
      baseOrigen: e.base_origen === 'ot' ? 'ot' : e.base_origen === 'cargada' ? 'cargada' : e.base_origen === 'sin_registro' ? 'sin_registro' : 'alta_tarea',
      proximaFecha: txt(e.proxima_fecha),
      proximoKm: n(e.proximo_km),
      kmActual: n(e.km_actual),
      estado: estadoPlan(e.estado),
      otAbierta: n(e.ot_abierta),
      otNumero: txt(e.ot_numero),
    })),
    noAplica: arr(t.no_aplica).map((x) => ({
      equipo: equipo(x.equipo),
      equipoId: Number(x.equipo_id),
      patente: txt(x.patente) ?? '',
      motivo: txt(x.motivo) ?? '',
    })),
  }));

export const parsearAvisosOt = (d: unknown): AvisoOt[] =>
  arr(d).map((a) => ({
    id: Number(a.id),
    numero: txt(a.numero) ?? '',
    tipo: a.tipo === 'atrasada' ? 'atrasada' : 'nueva',
    patente: txt(a.patente) ?? '',
    equipo: equipo(a.equipo),
    titulo: txt(a.titulo) ?? '',
    prioridad: prioridad(a.prioridad),
    fechaLimite: txt(a.fecha_limite),
    kmLimite: n(a.km_limite),
    asignada: a.asignada === true,
    mensaje: txt(a.mensaje) ?? '',
  }));

/** «cada 30 días o cada 30.000 km» (texto para mostrar; la base guarda los números). */
export function textoFrecuencia(t: { cadaDias: number | null; cadaKm: number | null; cadaHoras?: number | null }): string {
  const p = [
    t.cadaDias !== null ? `cada ${t.cadaDias} días` : null,
    t.cadaKm !== null ? `cada ${t.cadaKm.toLocaleString('es-AR')} km` : null,
    t.cadaHoras != null ? `cada ${t.cadaHoras.toLocaleString('es-AR')} horas` : null,
  ].filter(Boolean);
  return p.join(' o ') + (p.length > 1 ? ' (lo que pase primero)' : '');
}

/** Tareas habituales para elegir el nombre al armar el plan (la frecuencia la define el Jefe). */
export const SUGERENCIAS_TAREA: Record<Equipo, readonly string[]> = {
  tractor: [
    'Cambio de aceite y filtros de motor',
    'Filtro de combustible y separador de agua',
    'Filtro de aire',
    'Engrase y quinta rueda',
    'Revisión de frenos',
    'Neumáticos: presión, desgaste y rotación',
    'Alineación',
    'Aceite de caja y diferenciales',
    'Refrigerante',
    'Correas',
    'Baterías',
    'Luces',
    'Purga de tanques de aire',
    'Aire acondicionado',
  ],
  semi: ['Revisión de frenos', 'Mazas y rodamientos', 'Suspensión', 'Perno rey', 'Patas de apoyo', 'Luces', 'Piso y carrocería', 'Neumáticos', 'Equipo de frío'],
  genset: ['Cambio de aceite y filtros', 'Filtro de gasoil', 'Filtro de aire', 'Correas', 'Refrigerante y radiador', 'Baterías', 'Generador y conexiones eléctricas', 'Limpieza del tanque'],
};
