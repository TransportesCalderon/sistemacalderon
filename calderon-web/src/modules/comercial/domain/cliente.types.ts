import type { Auditable, ClienteId } from '@/shared/types/dominio';

/**
 * Dominio del cliente (mae.cliente). Las listas de valores reflejan los CHECK del DDL:
 *   ck_cliente_estado          estado IN ('activo','inactivo','bloqueado')
 *   ck_cliente_condicion_pago  condicion_pago_dias BETWEEN 0 AND 365
 * Índices únicos: código (ux_cliente_codigo) e identificador fiscal por país (ux_cliente_fiscal).
 */
export const ESTADOS_CLIENTE = ['activo', 'inactivo', 'bloqueado'] as const;
export type EstadoCliente = (typeof ESTADOS_CLIENTE)[number];

export const ETIQUETA_ESTADO_CLIENTE: Record<EstadoCliente, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  bloqueado: 'Bloqueado',
};

/** Efecto de cada estado en el resto del sistema (especificación §14). */
export const AYUDA_ESTADO_CLIENTE: Record<EstadoCliente, string> = {
  activo: 'Se ofrece al crear servicios comerciales.',
  inactivo: 'Sin operación actual; se conserva en historiales.',
  bloqueado: 'No se ofrece al crear servicios comerciales.',
};

export const CONDICION_PAGO_MAX = 365;

export interface Cliente extends Auditable {
  id: ClienteId;
  codigo: string;
  razonSocial: string;
  /** CUIT (AR) / RUT (CL), normalizado. Único por país. */
  identificadorFiscal: string;
  pais: string;
  monedaFacturacion: string;
  condicionPagoDias: number;
  segmento: string | null;
  estado: EstadoCliente;
}

/** Fila de la lista (P-CLI-01): la ficha completa es chica, se reutiliza. */
export type ClienteResumen = Omit<Cliente, 'creadoEn' | 'creadoPor' | 'actualizadoEn' | 'actualizadoPor'>;

/** Sugerencia de cliente parecido (al escribir la razón social). */
export interface ClienteParecido {
  id: ClienteId;
  codigo: string;
  razonSocial: string;
  pais: string;
  estado: EstadoCliente;
  /** Cantidad de palabras de la búsqueda que coinciden. */
  coincidencias: number;
}

export interface ClienteFiltros {
  /** Busca en código, razón social e identificador fiscal. */
  texto?: string;
  estado?: EstadoCliente;
  pais?: string;
  moneda?: string;
  segmento?: string;
  incluirEliminados?: boolean;
}

export const ORDENES_CLIENTE = ['razon_social', 'codigo', 'condicion_pago_dias', 'estado'] as const;
export type CampoOrdenCliente = (typeof ORDENES_CLIENTE)[number];

export interface ClienteListaParams extends ClienteFiltros {
  orden: CampoOrdenCliente;
  dir: 'asc' | 'desc';
  pagina: number;
}

export const TAMANO_PAGINA_CLIENTES = 25;

/** Catálogos del módulo Comercial (ref.pais con su moneda por defecto y ref.moneda). */
export interface CatalogosComercial {
  paises: { iso2: string; nombre: string; monedaDefecto: string }[];
  monedas: { codigo: string; nombre: string; simbolo: string | null }[];
}

export function esEstadoCliente(v: unknown): v is EstadoCliente {
  return typeof v === 'string' && (ESTADOS_CLIENTE as readonly string[]).includes(v);
}

export function textoCondicionPago(dias: number): string {
  return dias === 0 ? 'Contado' : dias === 1 ? '1 día' : `${dias} días`;
}
