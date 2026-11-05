import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migraciones 188 y 189 · Fase 2: carga imposible y gestión de alertas (responsable, fecha límite,
 * avances, prórroga y escalamiento). Las reglas las controla la base; acá solo se convierten tipos.
 */
export const VERSION_GESTION_ALERTAS = 189;
export const VERSION_CARGA_IMPOSIBLE = 188;

export const EQUIPOS = [
  { rol: 'adm_combustible', nombre: 'Administración de combustible' },
  { rol: 'analista_control', nombre: 'Telemetría' },
  { rol: 'ti', nombre: 'TI' },
] as const;

/** Datos de gestión de una alerta para la bandeja. */
export interface GestionAlerta {
  id: number;
  responsable: string | null;
  responsableRol: string | null;
  responsableId: number | null;
  venceEn: FechaISO | null;
  vencida: boolean;
  escalada: boolean;
  diasAbierta: number;
  reasignaciones: number;
  prorrogaPendiente: boolean;
  ultimoFalta: string | null;
  esMia: boolean;
}

export interface HistorialGestion {
  responsable: string | null;
  responsableRol: string | null;
  responsableId: number | null;
  creada: FechaISO | null;
  venceEn: FechaISO | null;
  vencida: boolean;
  escaladaEn: FechaISO | null;
  diasAbierta: number;
  reasignaciones: number;
  prorrogas: number;
  avances: { hecho: string; falta: string | null; usuario: string | null; en: FechaISO }[];
  eventos: { tipo: string; detalle: string | null; usuario: string | null; en: FechaISO }[];
  prorroga: { id: number; hasta: FechaISO; motivo: string; pedidaPor: string | null; pedidaEn: FechaISO; puedoResolver: boolean } | null;
  esMia: boolean;
  reciboEscalamiento: boolean;
}

export interface AvisoEscalamiento {
  id: number;
  motivo: 'escalada' | 'prorroga';
  tipo: string;
  severidad: string;
  estado: string;
  patente: string | null;
  chofer: string | null;
  ocurrio: FechaISO | null;
  gestion: HistorialGestion;
}

export interface ResponsablesAlerta {
  tipos: { codigo: string; nombre: string; categoria: string; rol: string; usuarioId: number | null; responsable: string | null }[];
  usuarios: { id: number; nombre: string; roles: string[] }[];
  puedoCambiar: boolean;
  plazoHoras: number;
}

export interface ResumenCargaImposible {
  revisadas: number;
  normales: number;
  imposibles: number;
  sinDato: number;
  abiertas: number;
  confirmadas: number;
  /** Migración 190: válidas con explicación legítima (no son falso positivo). */
  justificadas: number;
  /** Solo las descartadas: la alerta no debía existir. */
  falsosPositivos: number;
  pctFalsosPositivos: number | null;
  litrosExceso: number;
  sinDatoMotivos: { motivo: string; cantidad: number }[];
}

export const ETIQUETA_EVENTO: Record<string, string> = {
  plazo_inicial: 'Plazo inicial',
  reasignada: 'Reasignada',
  prorroga_pedida: 'Pidió prórroga',
  prorroga_aprobada: 'Prórroga aprobada',
  prorroga_rechazada: 'Prórroga rechazada',
  escalada: 'Venció y escaló',
};

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const fecha = (v: unknown) => txt(v) as FechaISO | null;

export const parsearGestiones = (d: unknown): GestionAlerta[] =>
  arr(d).map((g) => ({
    id: Number(g.id),
    responsable: txt(g.responsable),
    responsableRol: txt(g.responsable_rol),
    responsableId: numN(g.responsable_id),
    venceEn: fecha(g.vence_en),
    vencida: g.vencida === true,
    escalada: g.escalada === true,
    diasAbierta: Number(g.dias_abierta ?? 0),
    reasignaciones: Number(g.reasignaciones ?? 0),
    prorrogaPendiente: g.prorroga_pendiente === true,
    ultimoFalta: txt(g.ultimo_falta),
    esMia: g.es_mia === true,
  }));

export function parsearHistorialGestion(d: unknown): HistorialGestion | null {
  if (!d || typeof d !== 'object') return null;
  const g = obj(d);
  const p = g.prorroga ? obj(g.prorroga) : null;
  return {
    responsable: txt(g.responsable),
    responsableRol: txt(g.responsable_rol),
    responsableId: numN(g.responsable_id),
    creada: fecha(g.creada),
    venceEn: fecha(g.vence_en),
    vencida: g.vencida === true,
    escaladaEn: fecha(g.escalada_en),
    diasAbierta: Number(g.dias_abierta ?? 0),
    reasignaciones: Number(g.reasignaciones ?? 0),
    prorrogas: Number(g.prorrogas ?? 0),
    avances: arr(g.avances).map((v) => ({ hecho: txt(v.hecho) ?? '', falta: txt(v.falta), usuario: txt(v.usuario), en: (txt(v.en) ?? '') as FechaISO })),
    eventos: arr(g.eventos).map((e) => ({ tipo: txt(e.tipo) ?? '', detalle: txt(e.detalle), usuario: txt(e.usuario), en: (txt(e.en) ?? '') as FechaISO })),
    prorroga: p
      ? {
          id: Number(p.id),
          hasta: (txt(p.hasta) ?? '') as FechaISO,
          motivo: txt(p.motivo) ?? '',
          pedidaPor: txt(p.pedida_por),
          pedidaEn: (txt(p.pedida_en) ?? '') as FechaISO,
          puedoResolver: p.puedo_resolver === true,
        }
      : null,
    esMia: g.es_mia === true,
    reciboEscalamiento: g.recibo_escalamiento === true,
  };
}

export const parsearAvisosEscalamiento = (d: unknown): AvisoEscalamiento[] =>
  arr(d).flatMap((a) => {
    const gestion = parsearHistorialGestion(a.gestion);
    if (!gestion) return [];
    return [
      {
        id: Number(a.id),
        motivo: a.motivo === 'prorroga' ? 'prorroga' : 'escalada',
        tipo: txt(a.tipo) ?? '',
        severidad: txt(a.severidad) ?? '',
        estado: txt(a.estado) ?? '',
        patente: txt(a.patente),
        chofer: txt(a.chofer),
        ocurrio: fecha(a.ocurrio),
        gestion,
      } satisfies AvisoEscalamiento,
    ];
  });

export function parsearResponsables(d: unknown): ResponsablesAlerta {
  const x = obj(d);
  return {
    tipos: arr(x.tipos).map((t) => ({
      codigo: txt(t.codigo) ?? '',
      nombre: txt(t.nombre) ?? '',
      categoria: txt(t.categoria) ?? '',
      rol: txt(t.rol) ?? '',
      usuarioId: numN(t.usuario_id),
      responsable: txt(t.responsable),
    })),
    usuarios: arr(x.usuarios).map((u) => ({ id: Number(u.id), nombre: txt(u.nombre) ?? '', roles: Array.isArray(u.roles) ? u.roles.map(String) : [] })),
    puedoCambiar: x.puedo_cambiar === true,
    plazoHoras: Number(x.plazo_horas ?? 48),
  };
}

export function parsearResumenCargaImposible(d: unknown): ResumenCargaImposible {
  const x = obj(d);
  return {
    revisadas: Number(x.revisadas ?? 0),
    normales: Number(x.normales ?? 0),
    imposibles: Number(x.imposibles ?? 0),
    sinDato: Number(x.sin_dato ?? 0),
    abiertas: Number(x.abiertas ?? 0),
    confirmadas: Number(x.confirmadas ?? 0),
    justificadas: Number(x.justificadas ?? 0),
    falsosPositivos: Number(x.falsos_positivos ?? 0),
    pctFalsosPositivos: numN(x.pct_falsos_positivos),
    litrosExceso: Number(x.litros_exceso ?? 0),
    sinDatoMotivos: Object.entries(obj(x.sin_dato_motivos)).map(([motivo, n]) => ({ motivo, cantidad: Number(n) })),
  };
}
