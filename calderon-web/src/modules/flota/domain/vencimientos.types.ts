import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migración 198 · Mantenimiento (M1): vencimientos de revisiones técnicas y matafuegos.
 * La base calcula el estado, si el equipo está en la Región Metropolitana y a quién avisar.
 * Acá solo se convierten tipos.
 */

export interface CorreccionVencimiento {
  realizadoAntes: string | null;
  venceAntes: string;
  realizado: string | null;
  vence: string;
  motivo: string;
  usuario: string | null;
  en: FechaISO;
}
/** Carpeta del certificado de un vencimiento (bucket documentos-operacion; la base exige esta carpeta). */
export const carpetaVencimiento = (id: number) => `vencimientos/${id}`;

export type EstadoVencimiento = 'vencido' | 'por_vencer' | 'al_dia' | 'sin_dato';
export type Equipo = 'tractor' | 'semi';

export const ETIQUETA_ESTADO_VENC: Record<EstadoVencimiento, string> = {
  vencido: 'Vencido',
  por_vencer: 'Por vencer',
  al_dia: 'Al día',
  sin_dato: 'Sin cargar',
};

export interface TipoVencimiento {
  codigo: string;
  nombre: string;
  aplicaTractor: boolean;
  aplicaSemi: boolean;
  pideDetalle: boolean;
  diasAviso: number;
}

export interface ItemVencimiento {
  id: number | null;
  tipo: string;
  tipoNombre: string;
  detalle: string | null;
  realizado: string | null;
  vence: string | null;
  dias: number | null;
  estado: EstadoVencimiento;
  observacion: string | null;
  cargadoPor: string | null;
  cargadoEn: FechaISO | null;
  archivoRuta: string | null;
  archivoNombre: string | null;
  correcciones: CorreccionVencimiento[];
}

export interface EquipoVencimientos {
  equipo: Equipo;
  id: number;
  patente: string;
  codigo: string;
  descripcion: string | null;
  ubicacion: string | null;
  tractor: string | null;
  posicionTs: FechaISO | null;
  enZona: boolean;
  peor: EstadoVencimiento;
  items: ItemVencimiento[];
}

export interface Vencimientos {
  hoy: string;
  tipos: TipoVencimiento[];
  equipos: EquipoVencimientos[];
}

export interface HistorialVencimiento {
  id: number;
  tipoNombre: string;
  detalle: string | null;
  realizado: string | null;
  vence: string;
  observacion: string | null;
  cargadoPor: string | null;
  cargadoEn: FechaISO;
  situacion: 'vigente' | 'reemplazado' | 'anulado';
  archivoRuta: string | null;
  correcciones: CorreccionVencimiento[];
  anuladoPor: string | null;
  motivoAnulacion: string | null;
}

export interface AvisoVencimiento {
  id: number;
  tipo: string;
  detalle: string | null;
  equipo: Equipo;
  patente: string;
  vence: string;
  dias: number;
  estado: 'vencido' | 'por_vencer';
  enZona: boolean;
  ubicacion: string | null;
  tractor: string | null;
  lat: number | null;
  lng: number | null;
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const estado = (v: unknown): EstadoVencimiento => (v === 'vencido' || v === 'por_vencer' || v === 'al_dia' ? v : 'sin_dato');
const equipo = (v: unknown): Equipo => (v === 'semi' ? 'semi' : 'tractor');

const correcciones = (v: unknown): CorreccionVencimiento[] =>
  arr(v).map((c) => ({
    realizadoAntes: txt(c.realizado_antes),
    venceAntes: txt(c.vence_antes) ?? '',
    realizado: txt(c.realizado),
    vence: txt(c.vence) ?? '',
    motivo: txt(c.motivo) ?? '',
    usuario: txt(c.usuario),
    en: (txt(c.en) ?? '') as FechaISO,
  }));

export function parsearVencimientos(d: unknown): Vencimientos {
  const x = obj(d);
  return {
    hoy: txt(x.hoy) ?? '',
    tipos: arr(x.tipos).map((t) => ({
      codigo: txt(t.codigo) ?? '',
      nombre: txt(t.nombre) ?? '',
      aplicaTractor: t.aplica_tractor === true,
      aplicaSemi: t.aplica_semi === true,
      pideDetalle: t.pide_detalle === true,
      diasAviso: Number(t.dias_aviso ?? 30),
    })),
    equipos: arr(x.equipos).map((e) => ({
      equipo: equipo(e.equipo),
      id: Number(e.id),
      patente: txt(e.patente) ?? '',
      codigo: txt(e.codigo) ?? '',
      descripcion: txt(e.descripcion),
      ubicacion: txt(e.ubicacion),
      tractor: txt(e.tractor),
      posicionTs: txt(e.posicion_ts) as FechaISO | null,
      enZona: e.en_zona === true,
      peor: estado(e.peor),
      items: arr(e.items).map((i) => ({
        id: n(i.id),
        tipo: txt(i.tipo) ?? '',
        tipoNombre: txt(i.tipo_nombre) ?? '',
        detalle: txt(i.detalle),
        realizado: txt(i.realizado),
        vence: txt(i.vence),
        dias: n(i.dias),
        estado: estado(i.estado),
        observacion: txt(i.observacion),
        cargadoPor: txt(i.cargado_por),
        cargadoEn: txt(i.cargado_en) as FechaISO | null,
        archivoRuta: txt(i.archivo_ruta),
        archivoNombre: txt(i.archivo_nombre),
        correcciones: correcciones(i.correcciones),
      })),
    })),
  };
}

export const parsearHistorialVencimientos = (d: unknown): HistorialVencimiento[] =>
  arr(d).map((h) => ({
    id: Number(h.id),
    tipoNombre: txt(h.tipo_nombre) ?? '',
    detalle: txt(h.detalle),
    realizado: txt(h.realizado),
    vence: txt(h.vence) ?? '',
    observacion: txt(h.observacion),
    cargadoPor: txt(h.cargado_por),
    cargadoEn: (txt(h.cargado_en) ?? '') as FechaISO,
    situacion: h.situacion === 'anulado' ? 'anulado' : h.situacion === 'reemplazado' ? 'reemplazado' : 'vigente',
    archivoRuta: txt(h.archivo_ruta),
    correcciones: correcciones(h.correcciones),
    anuladoPor: txt(h.anulado_por),
    motivoAnulacion: txt(h.motivo_anulacion),
  }));

export const parsearAvisosVencimiento = (d: unknown): AvisoVencimiento[] =>
  arr(d).map((a) => ({
    id: Number(a.id),
    tipo: txt(a.tipo) ?? '',
    detalle: txt(a.detalle),
    equipo: equipo(a.equipo),
    patente: txt(a.patente) ?? '',
    vence: txt(a.vence) ?? '',
    dias: Number(a.dias ?? 0),
    estado: a.estado === 'vencido' ? 'vencido' : 'por_vencer',
    enZona: a.en_zona === true,
    ubicacion: txt(a.ubicacion),
    tractor: txt(a.tractor),
    lat: n(a.latitud),
    lng: n(a.longitud),
  }));

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' (sin zona horaria: es una fecha de calendario). */
export const fechaDia = (f: string | null) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');

/** «vence en 20 días», «venció hace 3 días», «vence hoy». */
export function textoDias(dias: number | null): string {
  if (dias === null) return '';
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  if (dias > 0) return `vence en ${dias} días`;
  return dias === -1 ? 'venció ayer' : `venció hace ${-dias} días`;
}
