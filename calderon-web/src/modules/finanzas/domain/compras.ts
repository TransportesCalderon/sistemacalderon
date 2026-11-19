/**
 * Migración 280 · Compras: pedido de compra, cotizaciones, recomendación de Iris y orden de compra.
 * La base valida todo y hace la comparación (fin.fn_comparar_cotizaciones); acá solo se leen los datos.
 */
type Obj = Record<string, unknown>;
const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numONull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

export type EstadoPedidoCompra = 'cotizando' | 'para_aprobar' | 'aprobado' | 'rechazado' | 'anulado';
const ESTADOS: readonly EstadoPedidoCompra[] = ['cotizando', 'para_aprobar', 'aprobado', 'rechazado', 'anulado'];
const estado = (v: unknown): EstadoPedidoCompra => (ESTADOS.includes(v as EstadoPedidoCompra) ? (v as EstadoPedidoCompra) : 'cotizando');

export const ETIQUETA_ESTADO_COMPRA: Record<EstadoPedidoCompra, string> = {
  cotizando: 'Cotizando',
  para_aprobar: 'Para aprobar',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
};

export interface PedidoCompraFila {
  id: number;
  numero: string;
  fecha: string;
  descripcion: string;
  urgente: boolean;
  camion: string | null;
  estado: EstadoPedidoCompra;
  cotizaciones: number;
  orden: string | null;
  proveedorElegido: string | null;
  moneda: string | null;
  total: number | null;
}

export function parsearPedidosCompra(raw: unknown): PedidoCompraFila[] {
  return arr(raw).map((p) => ({
    id: num(p.id),
    numero: String(p.numero ?? ''),
    fecha: String(p.fecha ?? ''),
    descripcion: String(p.descripcion ?? ''),
    urgente: p.urgente === true,
    camion: txt(p.camion),
    estado: estado(p.estado),
    cotizaciones: num(p.cotizaciones),
    orden: txt(p.orden),
    proveedorElegido: txt(p.proveedor_elegido),
    moneda: txt(p.moneda),
    total: numONull(p.total),
  }));
}

export interface CotizacionCompra {
  id: number;
  proveedorId: number;
  proveedor: string;
  rut: string | null;
  numeroProveedor: string | null;
  fecha: string;
  validaHasta: string | null;
  moneda: string;
  total: number;
  flete: number;
  entregaInmediata: boolean;
  entregaDias: number | null;
  pagoDias: number;
  garantia: string | null;
  observacion: string | null;
  archivoRuta: string | null;
  archivoNombre: string | null;
  anulada: boolean;
  motivo: string | null;
}

/** Una fila de la comparación de Iris. */
export interface Comparada {
  id: number;
  proveedor: string;
  moneda: string;
  /** Total con IVA + flete, en pesos chilenos con el tipo de cambio de hoy (null si falta el tipo de cambio). */
  totalClp: number | null;
  comparable: boolean;
  vencida: boolean;
  puntaje: number | null;
  puntajes: { precio: number; entrega: number; pago: number; historial: number } | null;
  comprasAnteriores: number;
  ultimaCompra: string | null;
  recomendada: boolean;
}

export interface Comparacion {
  pesos: { precio: number; entrega: number; pago: number; historial: number };
  cotizaciones: Comparada[];
  recomendadaId: number | null;
  explicacion: string | null;
  advertencias: string[];
}

export interface OrdenCompra {
  id: number;
  numero: string;
  fecha: string;
  proveedor: string;
  rut: string | null;
  moneda: string;
  total: number;
  flete: number;
  entregaInmediata: boolean;
  entregaDias: number | null;
  pagoDias: number;
  anulada: boolean;
}

export interface PedidoCompra {
  id: number;
  numero: string;
  fecha: string;
  descripcion: string;
  detalle: string | null;
  camionId: number | null;
  camion: string | null;
  urgente: boolean;
  estado: EstadoPedidoCompra;
  nota: string | null;
  version: number;
  cotizacionElegidaId: number | null;
  recomendadaId: number | null;
  creadoPor: string | null;
  elevadoPor: string | null;
  resueltoPor: string | null;
  cotizaciones: CotizacionCompra[];
  comparacion: Comparacion;
  orden: OrdenCompra | null;
  puedoEditar: boolean;
  puedoResolver: boolean;
  puedoAnular: boolean;
}

const pesos = (v: unknown) => {
  const p = (v ?? {}) as Obj;
  return { precio: num(p.precio), entrega: num(p.entrega), pago: num(p.pago), historial: num(p.historial) };
};

export function parsearComparacion(raw: unknown): Comparacion {
  const j = (raw ?? {}) as Obj;
  return {
    pesos: pesos(j.pesos),
    cotizaciones: arr(j.cotizaciones).map((c) => ({
      id: num(c.id),
      proveedor: String(c.proveedor ?? ''),
      moneda: String(c.moneda ?? ''),
      totalClp: numONull(c.total_clp),
      comparable: c.comparable === true,
      vencida: c.vencida === true,
      puntaje: numONull(c.puntaje),
      puntajes: c.puntajes && typeof c.puntajes === 'object' ? pesos(c.puntajes) : null,
      comprasAnteriores: num(c.compras_anteriores),
      ultimaCompra: txt(c.ultima_compra),
      recomendada: c.recomendada === true,
    })),
    recomendadaId: numONull(j.recomendada_id),
    explicacion: txt(j.explicacion),
    advertencias: Array.isArray(j.advertencias) ? (j.advertencias as unknown[]).map(String) : [],
  };
}

export function parsearPedidoCompra(raw: unknown): PedidoCompra {
  const j = (raw ?? {}) as Obj;
  const o = j.orden && typeof j.orden === 'object' ? (j.orden as Obj) : null;
  return {
    id: num(j.id),
    numero: String(j.numero ?? ''),
    fecha: String(j.fecha ?? ''),
    descripcion: String(j.descripcion ?? ''),
    detalle: txt(j.detalle),
    camionId: numONull(j.camion_id),
    camion: txt(j.camion),
    urgente: j.urgente === true,
    estado: estado(j.estado),
    nota: txt(j.nota),
    version: num(j.version),
    cotizacionElegidaId: numONull(j.cotizacion_elegida_id),
    recomendadaId: numONull(j.recomendada_id),
    creadoPor: txt(j.creado_por),
    elevadoPor: txt(j.elevado_por),
    resueltoPor: txt(j.resuelto_por),
    cotizaciones: arr(j.cotizaciones).map((c) => ({
      id: num(c.id),
      proveedorId: num(c.proveedor_id),
      proveedor: String(c.proveedor ?? ''),
      rut: txt(c.rut),
      numeroProveedor: txt(c.numero_proveedor),
      fecha: String(c.fecha ?? ''),
      validaHasta: txt(c.valida_hasta),
      moneda: String(c.moneda ?? ''),
      total: num(c.total),
      flete: num(c.flete),
      entregaInmediata: c.entrega_inmediata === true,
      entregaDias: numONull(c.entrega_dias),
      pagoDias: num(c.pago_dias),
      garantia: txt(c.garantia),
      observacion: txt(c.observacion),
      archivoRuta: txt(c.archivo_ruta),
      archivoNombre: txt(c.archivo_nombre),
      anulada: c.estado === 'anulada',
      motivo: txt(c.motivo),
    })),
    comparacion: parsearComparacion(j.comparacion),
    orden: o
      ? {
          id: num(o.id),
          numero: String(o.numero ?? ''),
          fecha: String(o.fecha ?? ''),
          proveedor: String(o.proveedor ?? ''),
          rut: txt(o.rut),
          moneda: String(o.moneda ?? ''),
          total: num(o.total),
          flete: num(o.flete),
          entregaInmediata: o.entrega_inmediata === true,
          entregaDias: numONull(o.entrega_dias),
          pagoDias: num(o.pago_dias),
          anulada: o.estado === 'anulada',
        }
      : null,
    puedoEditar: j.puedo_editar === true,
    puedoResolver: j.puedo_resolver === true,
    puedoAnular: j.puedo_anular === true,
  };
}

/** «Entrega inmediata», «Entrega en 1 día», «Entrega en 5 días». */
export function textoEntrega(inmediata: boolean, dias: number | null): string {
  if (inmediata || dias === 0) return 'Entrega inmediata';
  if (dias === null) return 'Entrega sin dato';
  return dias === 1 ? 'Entrega en 1 día' : `Entrega en ${dias} días`;
}

/** «Al contado» o «A 30 días». */
export function textoPago(dias: number): string {
  return dias === 0 ? 'Al contado' : `A ${dias} días`;
}

/** Los pesos de la comparación en palabras, para mostrar cómo decide Iris. */
export function textoPesos(p: Comparacion['pesos']): string {
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  return `Precio ${pct(p.precio)} · Entrega ${pct(p.entrega)} · Días para pagar ${pct(p.pago)} · Historial ${pct(p.historial)}`;
}
