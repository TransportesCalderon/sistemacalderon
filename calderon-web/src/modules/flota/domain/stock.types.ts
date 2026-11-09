import { formatearNumero } from '@/shared/lib/numeros';
import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migración 216 · Stock de insumos y repuestos: pañoles, catálogo, kardex con costo promedio ponderado (CLP),
 * compras desde facturas de Finanzas, consumo en las OT y cuadre con la cuenta contable 1.1.13.
 * Todo lo calcula y valida la base; acá solo se leen sus respuestas.
 */
export const VERSION_STOCK = 216;

export const UNIDADES = ['unidad', 'litro', 'kilo', 'metro', 'juego', 'caja'] as const;
export type Unidad = (typeof UNIDADES)[number];
export const CATEGORIAS = ['repuesto', 'filtro', 'lubricante', 'neumatico', 'electrico', 'herramienta', 'limpieza', 'otro'] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  repuesto: 'Repuesto',
  filtro: 'Filtro',
  lubricante: 'Lubricante',
  neumatico: 'Neumático',
  electrico: 'Eléctrico',
  herramienta: 'Herramienta',
  limpieza: 'Limpieza',
  otro: 'Otro',
};
export type TipoMovimiento = 'inicial' | 'compra' | 'consumo' | 'devolucion' | 'traspaso_salida' | 'traspaso_entrada' | 'ajuste';
export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  inicial: 'Ingreso manual',
  compra: 'Compra',
  consumo: 'Usado en OT',
  devolucion: 'Devuelto de OT',
  traspaso_salida: 'Traspaso (sale)',
  traspaso_entrada: 'Traspaso (entra)',
  ajuste: 'Ajuste de inventario',
};

export interface Panol {
  id: number;
  nombre: string;
  ubicacion: string | null;
  activo: boolean;
}
export interface StockPanol {
  panolId: number;
  panol: string;
  cantidad: number;
  costoPromedio: number;
  valor: number;
}
export interface Insumo {
  id: number;
  codigo: string;
  nombre: string;
  unidad: Unidad;
  categoria: Categoria;
  stockMinimo: number;
  observacion: string | null;
  activo: boolean;
  cantidad: number;
  valor: number;
  bajoMinimo: boolean;
  porPanol: StockPanol[];
}
export interface Stock {
  panoles: Panol[];
  insumos: Insumo[];
  valorTotal: number;
}
export interface MovimientoKardex {
  id: number;
  fecha: FechaISO;
  tipo: TipoMovimiento;
  panol: string;
  cantidad: number;
  costoUnitario: number;
  importe: number;
  saldoCantidad: number;
  saldoPromedio: number;
  motivo: string | null;
  ot: string | null;
  otId: number | null;
  factura: string | null;
  proveedor: string | null;
  usuario: string | null;
}
export interface FacturaInsumos {
  id: number;
  numero: string;
  documento: string | null;
  fecha: string;
  proveedor: string | null;
  descripcion: string | null;
  moneda: string;
  neto: number;
  tcClp: number;
  detallado: number;
  pendiente: number;
}
export interface ConsumoOt {
  id: number;
  fecha: FechaISO;
  insumo: string;
  codigo: string;
  unidad: Unidad;
  panol: string;
  cantidad: number;
  costoUnitario: number;
  importe: number;
  devuelto: number;
  usuario: string | null;
}
export interface InsumosOt {
  costo: number;
  consumos: ConsumoOt[];
}
export interface Cuadre {
  valorStock: number;
  saldoContable: number;
  facturasSinDetallar: number;
  antesDeLaContabilidad: number;
  diferencia: number;
  cuadra: boolean;
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));
const unidad = (v: unknown): Unidad => (UNIDADES as readonly string[]).includes(v as string) ? (v as Unidad) : 'unidad';
const categoria = (v: unknown): Categoria => ((CATEGORIAS as readonly string[]).includes(v as string) ? (v as Categoria) : 'otro');
const tipo = (v: unknown): TipoMovimiento => (v as string) in ETIQUETA_MOVIMIENTO ? (v as TipoMovimiento) : 'ajuste';

export function parsearStock(d: unknown): Stock {
  const o = obj(d);
  return {
    panoles: arr(o.panoles).map((p) => ({ id: num(p.id), nombre: txt(p.nombre) ?? '', ubicacion: txt(p.ubicacion), activo: p.activo !== false })),
    insumos: arr(o.insumos).map((i) => ({
      id: num(i.id),
      codigo: txt(i.codigo) ?? '',
      nombre: txt(i.nombre) ?? '',
      unidad: unidad(i.unidad),
      categoria: categoria(i.categoria),
      stockMinimo: num(i.stock_minimo),
      observacion: txt(i.observacion),
      activo: i.activo !== false,
      cantidad: num(i.cantidad),
      valor: num(i.valor),
      bajoMinimo: i.bajo_minimo === true,
      porPanol: arr(i.por_panol).map((p) => ({
        panolId: num(p.panol_id),
        panol: txt(p.panol) ?? '',
        cantidad: num(p.cantidad),
        costoPromedio: num(p.costo_promedio),
        valor: num(p.valor),
      })),
    })),
    valorTotal: num(o.valor_total),
  };
}

export const parsearKardex = (d: unknown): MovimientoKardex[] =>
  arr(d).map((m) => ({
    id: num(m.id),
    fecha: (txt(m.fecha) ?? '') as FechaISO,
    tipo: tipo(m.tipo),
    panol: txt(m.panol) ?? '',
    cantidad: num(m.cantidad),
    costoUnitario: num(m.costo_unitario),
    importe: num(m.importe),
    saldoCantidad: num(m.saldo_cantidad),
    saldoPromedio: num(m.saldo_promedio),
    motivo: txt(m.motivo),
    ot: txt(m.ot),
    otId: m.ot_id === null || m.ot_id === undefined ? null : num(m.ot_id),
    factura: txt(m.factura),
    proveedor: txt(m.proveedor),
    usuario: txt(m.usuario),
  }));

export const parsearFacturasInsumos = (d: unknown): FacturaInsumos[] =>
  arr(d).map((f) => ({
    id: num(f.id),
    numero: txt(f.numero) ?? '',
    documento: txt(f.documento),
    fecha: txt(f.fecha) ?? '',
    proveedor: txt(f.proveedor),
    descripcion: txt(f.descripcion),
    moneda: txt(f.moneda) ?? 'CLP',
    neto: num(f.neto),
    tcClp: num(f.tc_clp) || 1,
    detallado: num(f.detallado),
    pendiente: num(f.pendiente),
  }));

export function parsearInsumosOt(d: unknown): InsumosOt {
  const o = obj(d);
  return {
    costo: num(o.costo),
    consumos: arr(o.consumos).map((c) => ({
      id: num(c.id),
      fecha: (txt(c.fecha) ?? '') as FechaISO,
      insumo: txt(c.insumo) ?? '',
      codigo: txt(c.codigo) ?? '',
      unidad: unidad(c.unidad),
      panol: txt(c.panol) ?? '',
      cantidad: num(c.cantidad),
      costoUnitario: num(c.costo_unitario),
      importe: num(c.importe),
      devuelto: num(c.devuelto),
      usuario: txt(c.usuario),
    })),
  };
}

export function parsearCuadre(d: unknown): Cuadre {
  const o = obj(d);
  return {
    valorStock: num(o.valor_stock),
    saldoContable: num(o.saldo_contable),
    facturasSinDetallar: num(o.facturas_sin_detallar),
    antesDeLaContabilidad: num(o.antes_de_la_contabilidad),
    diferencia: num(o.diferencia),
    cuadra: o.cuadra === true,
  };
}

/** Lo que queda en cada pañol de un insumo (para elegir de dónde sacar). */
export const stockEn = (i: Insumo | undefined, panolId: number): number => i?.porPanol.find((p) => p.panolId === panolId)?.cantidad ?? 0;

export const pesos = (v: number) => `$ ${formatearNumero(v, 0)}`;
export const cant = (v: number) => formatearNumero(v, Number.isInteger(v) ? 0 : 2);
/** Número escrito a la manera local (1.234,5). Vacío o inválido = null. */
export const decimalLocal = (s: string) => {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  return t === '' || !Number.isFinite(Number(t)) ? null : Number(t);
};
