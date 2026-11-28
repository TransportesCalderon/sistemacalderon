import { z } from 'zod';
import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migración 122 · Actas de infracción. La base decide todo: quién las hace, quién pone el monto,
 * cuándo se puede descontar y el descuento en la liquidación. Acá solo se convierten tipos y se
 * eligen etiquetas para mostrar.
 */
export const VERSION_ACTAS = 122;

/**
 * Migración 389: los tipos salen del catálogo de la base (ops.tipo_acta) y se pueden agregar. Esta lista es la que trae
 * la migración, para mostrar algo mientras se lee el catálogo; un tipo nuevo se muestra con el nombre que manda la base.
 */
export type TipoActa = string;
export const TIPOS_ACTA = [
  'consumo_excesivo',
  'danos_unidad',
  'exceso_velocidad',
  'fuera_horario',
  'ralenti_excesivo',
  'faltante_combustible',
  'desvio_ruta',
  'limpieza',
  'documentacion',
  'procedimiento',
  'conducta',
  'otra',
] as const;
export const ETIQUETA_TIPO_ACTA: Record<string, string> = {
  consumo_excesivo: 'Consumo excesivo',
  danos_unidad: 'Daños en la unidad',
  exceso_velocidad: 'Velocidad excesiva',
  fuera_horario: 'Manejo fuera de horario sin permiso',
  ralenti_excesivo: 'Ralentí excesivo',
  faltante_combustible: 'Faltante de combustible',
  desvio_ruta: 'Desvío de la ruta asignada',
  limpieza: 'Falta de limpieza e higiene de la unidad',
  documentacion: 'Documentación o rendición incompleta',
  procedimiento: 'Incumplimiento de un procedimiento',
  conducta: 'Conducta o trato inadecuado',
  otra: 'Otra infracción',
};
export const esTipoActa = (v: unknown): v is TipoActa => typeof v === 'string' && /^[a-z][a-z0-9_]{2,40}$/.test(v);

export interface TipoActaCatalogo {
  codigo: TipoActa;
  nombre: string;
  activo: boolean;
}
export interface TiposActa {
  tipos: TipoActaCatalogo[];
  puedeAgregar: boolean;
}
/** Los tipos de la base; si todavía no está la migración 389, la lista de siempre. */
export function parsearTiposActa(raw: unknown): TiposActa {
  const j = obj(raw);
  const tipos = (Array.isArray(j.tipos) ? (j.tipos as unknown[]) : [])
    .map(obj)
    .filter((t) => esTipoActa(t.codigo) && typeof t.nombre === 'string')
    .map((t) => ({ codigo: String(t.codigo), nombre: String(t.nombre), activo: t.activo !== false }));
  return {
    tipos: tipos.length > 0 ? tipos : TIPOS_ACTA.map((c) => ({ codigo: c, nombre: ETIQUETA_TIPO_ACTA[c] ?? c, activo: true })),
    puedeAgregar: j.puede_agregar === true,
  };
}
/** El nombre de un tipo: el del catálogo, el conocido o el código legible. */
export function etiquetaTipoActa(tipo: string, tipos?: readonly TipoActaCatalogo[], nombreBase?: string | null): string {
  return nombreBase || tipos?.find((t) => t.codigo === tipo)?.nombre || ETIQUETA_TIPO_ACTA[tipo] || tipo.replace(/_/g, ' ');
}

export type EstadoActa = 'registrada' | 'firmada' | 'anulada';
export const ETIQUETA_ESTADO_ACTA: Record<EstadoActa, string> = { registrada: 'Sin firmar', firmada: 'Firmada', anulada: 'Anulada' };

export interface FotoActa {
  id: number;
  ruta: string;
  nombre: string | null;
}

export interface Acta {
  id: number;
  numero: string;
  tipo: TipoActa;
  /** Migración 389: el nombre del tipo según el catálogo. */
  tipoNombre: string;
  estado: EstadoActa;
  fecha: FechaISO;
  choferId: number;
  chofer: string;
  legajo: string | null;
  camionId: number | null;
  patente: string | null;
  alertaId: number | null;
  alerta: string | null;
  lugar: string | null;
  descripcion: string;
  evidencia: Record<string, unknown>;
  monto: number | null;
  moneda: string | null;
  montoPor: string | null;
  descontar: boolean;
  importeDescuento: number | null;
  periodoDescuento: string | null;
  liquidacion: { numero: string; estado: string } | null;
  firmadaEn: FechaISO | null;
  firmadaRuta: string | null;
  descargo: string | null;
  seNegoFirmar: boolean;
  anuladaEn: FechaISO | null;
  motivoAnulacion: string | null;
  creadoEn: FechaISO;
  creadoPor: string | null;
  version: number;
  fotos: FotoActa[];
}

export interface Actas {
  puedeCrear: boolean;
  puedeMonto: boolean;
  actas: Acta[];
  porTipo: Record<string, number> | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function parsearActa(raw: unknown): Acta {
  const a = obj(raw);
  const liq = a.liquidacion ? obj(a.liquidacion) : null;
  return {
    id: Number(a.id),
    numero: String(a.numero ?? ''),
    tipo: esTipoActa(a.tipo) ? a.tipo : 'otra',
    tipoNombre: etiquetaTipoActa(esTipoActa(a.tipo) ? a.tipo : 'otra', undefined, txt(a.tipo_nombre)),
    estado: (a.estado === 'firmada' || a.estado === 'anulada' ? a.estado : 'registrada') as EstadoActa,
    fecha: String(a.fecha ?? '') as FechaISO,
    choferId: Number(a.chofer_id),
    chofer: String(a.chofer ?? ''),
    legajo: txt(a.legajo),
    camionId: num(a.camion_id),
    patente: txt(a.patente),
    alertaId: num(a.alerta_id),
    alerta: txt(a.alerta),
    lugar: txt(a.lugar),
    descripcion: String(a.descripcion ?? ''),
    evidencia: obj(a.evidencia),
    monto: num(a.monto),
    moneda: txt(a.moneda),
    montoPor: txt(a.monto_por),
    descontar: a.descontar === true,
    importeDescuento: num(a.importe_descuento),
    periodoDescuento: txt(a.periodo_descuento),
    liquidacion: liq ? { numero: String(liq.numero ?? ''), estado: String(liq.estado ?? '') } : null,
    firmadaEn: txt(a.firmada_en) as FechaISO | null,
    firmadaRuta: txt(a.firmada_ruta),
    descargo: txt(a.descargo),
    seNegoFirmar: a.se_nego_firmar === true,
    anuladaEn: txt(a.anulada_en) as FechaISO | null,
    motivoAnulacion: txt(a.motivo_anulacion),
    creadoEn: String(a.creado_en ?? '') as FechaISO,
    creadoPor: txt(a.creado_por),
    version: Number(a.version ?? 1),
    fotos: (Array.isArray(a.fotos) ? (a.fotos as Obj[]) : []).map((f) => ({ id: Number(f.id), ruta: String(f.ruta), nombre: txt(f.nombre) })),
  };
}

export function parsearActas(raw: unknown): Actas {
  const j = obj(raw);
  const pt = j.por_tipo ? obj(j.por_tipo) : null;
  return {
    puedeCrear: j.puede_crear === true,
    puedeMonto: j.puede_monto === true,
    actas: (Array.isArray(j.actas) ? j.actas : []).map(parsearActa),
    porTipo: pt ? Object.fromEntries(Object.entries(pt).map(([k, v]) => [k, Number(v ?? 0) || 0])) : null,
  };
}

/** «2 de velocidad excesiva, 1 de daños en la unidad»: solo los tipos que tiene (sin las anuladas). */
export function resumenPorTipo(porTipo: Record<string, number> | null, tipos?: readonly TipoActaCatalogo[]): string {
  const con = Object.entries(porTipo ?? {}).filter(([, n]) => n > 0);
  if (con.length === 0) return 'ninguna acta';
  return con.map(([t, n]) => `${n} de ${etiquetaTipoActa(t, tipos).toLowerCase()}`).join(', ');
}

export const agregarTipoActaSchema = z.object({ nombre: z.string().trim().min(3, 'Escribí el nombre del tipo').max(80, 'Hasta 80 letras') });

/** Datos de la evidencia que se muestran (los nombres legibles salen del mismo diccionario de las alertas). */
export const EVIDENCIA_OCULTA = new Set(['regla', 'desde', 'hasta']);

/** Carpeta de las fotos y la copia firmada de un acta (bucket documentos-operacion; la base exige esta carpeta). */
export const carpetaActa = (id: number) => `actas/${id}`;

// ---- Esquemas: solo forma (lo demás lo valida la base) ----
const monto = z.number().positive().nullable();
export const crearActaSchema = z.object({
  alertaId: z.number().int().positive().nullable(),
  tipo: z.string().regex(/^[a-z][a-z0-9_]{2,40}$/, 'Elegí el tipo').nullable(),
  choferId: z.number().int().positive().nullable(),
  camionId: z.number().int().positive().nullable(),
  fecha: z.string().nullable(),
  lugar: z.string().max(200),
  descripcion: z.string().max(2000),
  monto,
  moneda: z.string().max(3).nullable(),
  descontar: z.boolean(),
  importeDescuento: monto,
  periodoDescuento: z.string().nullable(),
});
export type CrearActa = z.output<typeof crearActaSchema>;

export const cambiarActaSchema = z.object({
  id: z.number().int().positive(),
  version: z.number().int().positive(),
  lugar: z.string().max(200),
  descripcion: z.string().max(2000),
  /** Solo si se tocó el monto o el descuento (lo pueden Gerencia u Operaciones). */
  dinero: z
    .object({ monto, moneda: z.string().max(3).nullable(), descontar: z.boolean(), importeDescuento: monto, periodoDescuento: z.string().nullable() })
    .nullable(),
});
export type CambiarActa = z.output<typeof cambiarActaSchema>;

export const fotoActaSchema = z.object({ actaId: z.number().int().positive(), ruta: z.string().min(1).max(300), nombre: z.string().max(200).nullable() });
export const quitarFotoSchema = z.object({ fotoId: z.number().int().positive() });
export const firmarActaSchema = z.object({
  id: z.number().int().positive(),
  ruta: z.string().max(300).nullable(),
  descargo: z.string().max(2000),
  seNego: z.boolean(),
});
export const anularActaSchema = z.object({ id: z.number().int().positive(), motivo: z.string().max(500) });
