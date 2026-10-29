import { z } from 'zod';
import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migración 122 · Actas de infracción. La base decide todo: quién las hace, quién pone el monto,
 * cuándo se puede descontar y el descuento en la liquidación. Acá solo se convierten tipos y se
 * eligen etiquetas para mostrar.
 */
export const VERSION_ACTAS = 122;

export const TIPOS_ACTA = ['consumo_excesivo', 'danos_unidad', 'exceso_velocidad'] as const;
export type TipoActa = (typeof TIPOS_ACTA)[number];
export const ETIQUETA_TIPO_ACTA: Record<TipoActa, string> = {
  consumo_excesivo: 'Consumo excesivo',
  danos_unidad: 'Daños en la unidad',
  exceso_velocidad: 'Velocidad excesiva',
};
export const esTipoActa = (v: unknown): v is TipoActa => typeof v === 'string' && (TIPOS_ACTA as readonly string[]).includes(v);

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
  porTipo: Record<TipoActa, number> | null;
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
    tipo: esTipoActa(a.tipo) ? a.tipo : 'danos_unidad',
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
    porTipo: pt ? { consumo_excesivo: Number(pt.consumo_excesivo ?? 0), danos_unidad: Number(pt.danos_unidad ?? 0), exceso_velocidad: Number(pt.exceso_velocidad ?? 0) } : null,
  };
}

/** Datos de la evidencia que se muestran (los nombres legibles salen del mismo diccionario de las alertas). */
export const EVIDENCIA_OCULTA = new Set(['regla', 'desde', 'hasta']);

/** Carpeta de las fotos y la copia firmada de un acta (bucket documentos-operacion; la base exige esta carpeta). */
export const carpetaActa = (id: number) => `actas/${id}`;

// ---- Esquemas: solo forma (lo demás lo valida la base) ----
const monto = z.number().positive().nullable();
export const crearActaSchema = z.object({
  alertaId: z.number().int().positive().nullable(),
  tipo: z.enum(TIPOS_ACTA).nullable(),
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
