import { z } from 'zod';

/**
 * Migración 124 · Facturación electrónica con Facturacion.cl (SII). La base arma el documento,
 * lo envía, guarda folio y PDF y decide qué tipo corresponde (34 exenta para clientes chilenos,
 * 110 exportación para extranjeros). Acá solo se convierten tipos.
 */
export const VERSION_SII = 124;

export type AmbienteSii = 'prueba' | 'produccion';
export type EstadoDte = 'aceptado' | 'rechazado' | 'sin_respuesta' | 'descartado';

export const NOMBRE_DTE: Record<number, string> = {
  34: 'Factura exenta',
  110: 'Factura de exportación',
  61: 'Nota de crédito',
  112: 'Nota de crédito de exportación',
};
export const ETIQUETA_ESTADO_DTE: Record<EstadoDte, string> = {
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  sin_respuesta: 'Sin respuesta',
  descartado: 'No se emitió',
};

export interface DocumentoSii {
  id: number;
  tipo: number;
  ambiente: AmbienteSii;
  estado: EstadoDte;
  folio: number | null;
  fecha: string;
  referenciaId: number | null;
  motivo: string | null;
  error: string | null;
  urlOriginal: string | null;
  urlCedible: string | null;
  creadoEn: string;
  creadoPor: string | null;
}

export interface ClienteSii {
  id: number;
  razonSocial: string;
  identificadorFiscal: string;
  pais: string;
  giro: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  correo: string;
}

export interface SiiFactura {
  ambiente: AmbienteSii;
  tipo: number;
  tipoNombre: string;
  faltantes: string[];
  cliente: ClienteSii;
  puedeEmitir: boolean;
  puedeAnular: boolean;
  /** Migración 125: la exenta (34) se emite en pesos chilenos al dólar del día. */
  tcClp: number | null;
  totalClp: number | null;
  documentos: DocumentoSii[];
}

export interface ResultadoSii {
  ok: boolean;
  id: number;
  estado: EstadoDte;
  ambiente: AmbienteSii;
  tipo: number;
  folio: number | null;
  urlOriginal: string | null;
  error: string | null;
}

export interface EstadoSii {
  ambiente: AmbienteSii;
  credenciales: boolean;
  conectado: boolean;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const strN = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const amb = (v: unknown): AmbienteSii => (v === 'produccion' ? 'produccion' : 'prueba');

export function parsearSiiFactura(raw: unknown): SiiFactura {
  const j = obj(raw);
  const c = obj(j.cliente);
  return {
    ambiente: amb(j.ambiente),
    tipo: Number(j.tipo),
    tipoNombre: str(j.tipo_nombre),
    faltantes: Array.isArray(j.faltantes) ? j.faltantes.map(String) : [],
    puedeEmitir: j.puede_emitir === true,
    puedeAnular: j.puede_anular === true,
    tcClp: numN(j.tc_clp),
    totalClp: numN(j.total_clp),
    cliente: {
      id: Number(c.id),
      razonSocial: str(c.razon_social),
      identificadorFiscal: str(c.identificador_fiscal),
      pais: str(c.pais),
      giro: str(c.giro),
      direccion: str(c.direccion),
      comuna: str(c.comuna),
      ciudad: str(c.ciudad),
      correo: str(c.correo),
    },
    documentos: arr(j.documentos).map((d) => ({
      id: Number(d.id),
      tipo: Number(d.tipo),
      ambiente: amb(d.ambiente),
      estado: str(d.estado) as EstadoDte,
      folio: numN(d.folio),
      fecha: str(d.fecha),
      referenciaId: numN(d.referencia_id),
      motivo: strN(d.motivo),
      error: strN(d.error),
      urlOriginal: strN(d.url_original),
      urlCedible: strN(d.url_cedible),
      creadoEn: str(d.creado_en),
      creadoPor: strN(d.creado_por),
    })),
  };
}

/** Migración 138: vista previa de la factura electrónica (lo mismo que se envía). */
export const VERSION_VISTA_PREVIA = 138;
export interface RenglonVistaPrevia {
  n: number;
  nombre: string;
  descripcion: string | null;
  cantidad: number;
  precio: number;
  monto: number;
  importeUsd: number;
}
export interface VistaPreviaSii {
  ambiente: AmbienteSii;
  tipo: number;
  tipoNombre: string;
  fecha: string;
  vence: string;
  moneda: 'CLP' | 'USD';
  tcClp: number | null;
  emisor: Record<string, string>;
  receptor: Record<string, string>;
  items: RenglonVistaPrevia[];
  total: number;
  totalUsd: number;
  glosa: string | null;
  glosaAutomatica: boolean;
  /** Migración 140: dónde va la leyenda: al final del último renglón o en «Observaciones». */
  glosaEnRenglon: boolean;
  faltantes: string[];
}
const textos = (v: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(obj(v)).map(([k, x]) => [k, x === null || x === undefined ? '' : String(x)]));
export function parsearVistaPrevia(raw: unknown): VistaPreviaSii {
  const j = obj(raw);
  return {
    ambiente: amb(j.ambiente),
    tipo: Number(j.tipo),
    tipoNombre: str(j.tipo_nombre),
    fecha: str(j.fecha),
    vence: str(j.vence),
    moneda: j.moneda === 'USD' ? 'USD' : 'CLP',
    tcClp: numN(j.tc_clp),
    emisor: textos(j.emisor),
    receptor: textos(j.receptor),
    items: arr(j.items).map((x) => ({
      n: Number(x.n),
      nombre: str(x.nombre),
      descripcion: strN(x.descripcion),
      cantidad: Number(x.cantidad),
      precio: Number(x.precio),
      monto: Number(x.monto),
      importeUsd: Number(x.importe_usd),
    })),
    total: Number(j.total ?? 0),
    totalUsd: Number(j.total_usd ?? 0),
    glosa: strN(j.glosa),
    glosaAutomatica: j.glosa_automatica === true,
    glosaEnRenglon: j.glosa_lugar === 'renglon',
    faltantes: Array.isArray(j.faltantes) ? j.faltantes.map(String) : [],
  };
}

export function parsearResultadoSii(raw: unknown): ResultadoSii {
  const j = obj(raw);
  return {
    ok: j.ok === true,
    id: Number(j.id),
    estado: str(j.estado) as EstadoDte,
    ambiente: amb(j.ambiente),
    tipo: Number(j.tipo),
    folio: numN(j.folio),
    urlOriginal: strN(j.url_original),
    error: strN(j.error),
  };
}

export function parsearEstadoSii(raw: unknown): EstadoSii {
  const j = obj(raw);
  return { ambiente: amb(j.ambiente), credenciales: j.credenciales === true, conectado: j.conectado === true };
}

// Entradas de las acciones (las reglas las valida la base)
const id = z.number().int().positive();
export const emitirSiiSchema = z.object({ id, version: z.number().int().positive(), fecha: z.string() });
export const notaCreditoSiiSchema = z.object({ dteId: id, motivo: z.string() });
export const resolverDteSchema = z.object({ dteId: id, folio: z.number().int().nullable() });
export const clienteSiiSchema = z.object({
  clienteId: id,
  giro: z.string(),
  direccion: z.string(),
  comuna: z.string(),
  ciudad: z.string(),
  correo: z.string(),
});
export type ClienteSiiEntrada = z.infer<typeof clienteSiiSchema>;
/** Migración 138: la leyenda (null = la automática; vacía = sin leyenda). */
export const glosaSiiSchema = z.object({ id, glosa: z.string().max(300).nullable() });
