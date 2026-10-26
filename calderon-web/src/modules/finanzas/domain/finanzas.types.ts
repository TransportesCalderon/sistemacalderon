import { formatearNumero } from '@/shared/lib/numeros';

/**
 * Finanzas (migración 73): libros de Chile en pesos. La base arma los asientos y calcula
 * saldos, informes y tablero; la pantalla solo muestra lo que devuelve.
 */
type Obj = Record<string, unknown>;
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => Number(x ?? 0)) : []);

/** «$ 1.234.567» (CLP sin decimales), «US$ 1.234,56», «PYG 1.000,00». */
export function dinero(valor: number | null | undefined, moneda = 'CLP'): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  const signo = valor < 0 ? '−' : '';
  const v = Math.abs(valor);
  if (moneda === 'CLP') return `${signo}$ ${formatearNumero(v, 0)}`;
  if (moneda === 'USD') return `${signo}US$ ${formatearNumero(v, 2)}`;
  return `${signo}${moneda} ${formatearNumero(v, 2)}`;
}

/** «$ 1,2 M», «$ 850 mil» para ejes y tarjetas chicas. */
export function dineroCorto(valor: number): string {
  const a = Math.abs(valor);
  const s = valor < 0 ? '−' : '';
  const dec = (x: number) => (x >= 10 || Number.isInteger(Math.round(x * 10) / 10) ? 0 : 1);
  if (a >= 1_000_000_000) return `${s}$ ${formatearNumero(a / 1_000_000_000, dec(a / 1_000_000_000))} mil M`;
  if (a >= 1_000_000) return `${s}$ ${formatearNumero(a / 1_000_000, dec(a / 1_000_000))} M`;
  if (a >= 1_000) return `${s}$ ${formatearNumero(a / 1_000, 0)} mil`;
  return `${s}$ ${formatearNumero(a, 0)}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Para el eje: «ene 26» en enero o en la primera barra, y solo el mes en las demás. */
export function mesEje(iso: string, i: number): string {
  const [a, m] = iso.split('-');
  const nombre = MESES[Number(m) - 1] ?? String(m);
  return i === 0 || m === '01' ? `${nombre} ${String(a).slice(2)}` : nombre;
}

/** «2026-10-01» → «oct 26». */
export function mesCorto(iso: string): string {
  const [a, m] = iso.split('-');
  return `${MESES[Number(m) - 1] ?? m} ${String(a).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Plan de cuentas
// ---------------------------------------------------------------------------
export type TipoCuenta = 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto';
export const ETIQUETA_TIPO_CUENTA: Record<TipoCuenta, string> = {
  activo: 'Activo',
  pasivo: 'Pasivo',
  patrimonio: 'Patrimonio',
  ingreso: 'Ingreso',
  costo: 'Costo',
  gasto: 'Gasto',
};
export interface CuentaContable {
  id: number;
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  padreId: number | null;
  imputable: boolean;
  uso: string | null;
  activa: boolean;
  banco: boolean;
  conMovimientos: boolean;
  /** Lo decide la base (migración 74): sirve para un gasto / para otro ingreso o egreso. */
  paraGasto: boolean;
  paraMovimiento: boolean;
  saldo: number;
}
export const parsearPlan = (raw: unknown): CuentaContable[] =>
  arr(raw).map((c) => ({
    id: num(c.id),
    codigo: String(c.codigo),
    nombre: String(c.nombre),
    tipo: c.tipo as TipoCuenta,
    padreId: numN(c.padre_id),
    imputable: c.imputable === true,
    uso: txt(c.uso),
    activa: c.activa !== false,
    banco: c.banco === true,
    conMovimientos: c.con_movimientos === true,
    paraGasto: c.para_gasto === true,
    paraMovimiento: c.para_movimiento === true,
    saldo: num(c.saldo),
  }));
/** Cuentas que sirven para un gasto (la base lo marca en el plan). */
export const cuentasParaGasto = (plan: CuentaContable[]) => plan.filter((c) => c.paraGasto);
/** Cuentas para otro ingreso u otro egreso (la base lo marca en el plan). */
export const cuentasParaMovimiento = (plan: CuentaContable[]) => plan.filter((c) => c.paraMovimiento);

// ---------------------------------------------------------------------------
// Bancos y cajas
// ---------------------------------------------------------------------------
export interface CuentaDinero {
  id: number;
  nombre: string;
  tipo: 'banco' | 'caja';
  banco: string | null;
  numero: string | null;
  moneda: string;
  saldoInicial: number;
  saldoInicialFecha: string;
  activa: boolean;
  saldo: number;
  saldoClp: number | null;
  cartolaSaldo: number | null;
  cartolaFecha: string | null;
  porConciliar: number;
}
export const parsearCuentasDinero = (raw: unknown): CuentaDinero[] =>
  arr(raw).map((c) => ({
    id: num(c.id),
    nombre: String(c.nombre),
    tipo: c.tipo === 'caja' ? 'caja' : 'banco',
    banco: txt(c.banco),
    numero: txt(c.numero),
    moneda: String(c.moneda),
    saldoInicial: num(c.saldo_inicial),
    saldoInicialFecha: String(c.saldo_inicial_fecha),
    activa: c.activa !== false,
    saldo: num(c.saldo),
    saldoClp: numN(c.saldo_clp),
    cartolaSaldo: numN(c.cartola_saldo),
    cartolaFecha: txt(c.cartola_fecha),
    porConciliar: num(c.por_conciliar),
  }));

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------
export type TipoDocumento = 'factura' | 'factura_exenta' | 'boleta' | 'boleta_honorarios' | 'sin_documento' | 'otro';
export const TIPOS_DOCUMENTO: { valor: TipoDocumento; etiqueta: string; ayuda: string }[] = [
  { valor: 'factura', etiqueta: 'Factura (con IVA)', ayuda: 'Escribí el neto: el IVA lo calcula el sistema.' },
  { valor: 'factura_exenta', etiqueta: 'Factura exenta', ayuda: 'Sin IVA.' },
  { valor: 'boleta', etiqueta: 'Boleta', ayuda: 'Total de la boleta (el IVA de una boleta no se recupera).' },
  { valor: 'boleta_honorarios', etiqueta: 'Boleta de honorarios', ayuda: 'Escribí el bruto: la retención la calcula el sistema.' },
  { valor: 'sin_documento', etiqueta: 'Sin documento', ayuda: 'Total pagado.' },
  { valor: 'otro', etiqueta: 'Otro (extranjero, recibo…)', ayuda: 'Total del documento.' },
];
export const etiquetaDocumento = (t: string) => TIPOS_DOCUMENTO.find((x) => x.valor === t)?.etiqueta ?? t;

export type SituacionGasto = 'pendiente' | 'vencido' | 'pagado' | 'anulado';
export interface GastoFila {
  id: number;
  numero: string;
  fecha: string;
  vence: string;
  descripcion: string;
  proveedor: string | null;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string | null;
  cuenta: string;
  camion: string | null;
  moneda: string;
  total: number;
  totalClp: number;
  saldo: number;
  situacion: SituacionGasto;
  fijo: boolean;
}
export const parsearGastos = (raw: unknown): GastoFila[] =>
  arr(raw).map((g) => ({
    id: num(g.id),
    numero: String(g.numero),
    fecha: String(g.fecha),
    vence: String(g.vence),
    descripcion: String(g.descripcion),
    proveedor: txt(g.proveedor),
    tipoDocumento: g.tipo_documento as TipoDocumento,
    numeroDocumento: txt(g.numero_documento),
    cuenta: String(g.cuenta),
    camion: txt(g.camion),
    moneda: String(g.moneda),
    total: num(g.total),
    totalClp: num(g.total_clp),
    saldo: num(g.saldo),
    situacion: g.situacion as SituacionGasto,
    fijo: g.fijo === true,
  }));

export interface LineaAsiento {
  codigo: string;
  cuenta: string;
  debe: number;
  haber: number;
  detalle: string | null;
}
export interface Asiento {
  fecha: string;
  glosa: string;
  lineas: LineaAsiento[];
}
const parsearAsiento = (raw: unknown): Asiento | null => {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Obj;
  return {
    fecha: String(a.fecha),
    glosa: String(a.glosa),
    lineas: arr(a.lineas).map((l) => ({ codigo: String(l.codigo), cuenta: String(l.cuenta), debe: num(l.debe), haber: num(l.haber), detalle: txt(l.detalle) })),
  };
};

export interface PagoDeGasto {
  id: number;
  numero: string;
  fecha: string;
  cuenta: string;
  moneda: string;
  monto: number;
  montoDocumento: number;
  estado: 'vigente' | 'anulado';
  conciliado: boolean;
}
export interface Gasto {
  id: number;
  numero: string;
  version: number;
  fecha: string;
  vence: string;
  proveedorId: number | null;
  proveedor: string | null;
  proveedorNombre: string | null;
  proveedorRut: string | null;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string | null;
  descripcion: string;
  cuentaId: number;
  cuenta: string;
  camionId: number | null;
  moneda: string;
  exento: number;
  neto: number;
  iva: number;
  retencion: number;
  total: number;
  tcClp: number;
  totalClp: number;
  saldo: number;
  estado: 'vigente' | 'anulado';
  motivo: string | null;
  fijo: string | null;
  periodo: string | null;
  pagos: PagoDeGasto[];
  asiento: Asiento | null;
  cargas: CargaCombustible[];
}
export function parsearGasto(raw: unknown): Gasto {
  const g = (raw ?? {}) as Obj;
  return {
    id: num(g.id),
    numero: String(g.numero),
    version: num(g.version),
    fecha: String(g.fecha),
    vence: String(g.vence),
    proveedorId: numN(g.proveedor_id),
    proveedor: txt(g.proveedor),
    proveedorNombre: txt(g.proveedor_nombre),
    proveedorRut: txt(g.proveedor_rut),
    tipoDocumento: g.tipo_documento as TipoDocumento,
    numeroDocumento: txt(g.numero_documento),
    descripcion: String(g.descripcion),
    cuentaId: num(g.cuenta_id),
    cuenta: String(g.cuenta),
    camionId: numN(g.camion_id),
    moneda: String(g.moneda),
    exento: num(g.exento),
    neto: num(g.neto),
    iva: num(g.iva),
    retencion: num(g.retencion),
    total: num(g.total),
    tcClp: num(g.tc_clp),
    totalClp: num(g.total_clp),
    saldo: num(g.saldo),
    estado: g.estado === 'anulado' ? 'anulado' : 'vigente',
    motivo: txt(g.motivo),
    fijo: txt(g.fijo),
    periodo: txt(g.periodo),
    pagos: arr(g.pagos).map((p) => ({
      id: num(p.id),
      numero: String(p.numero),
      fecha: String(p.fecha),
      cuenta: String(p.cuenta),
      moneda: String(p.moneda),
      monto: num(p.monto),
      montoDocumento: num(p.monto_documento),
      estado: p.estado === 'anulado' ? 'anulado' : 'vigente',
      conciliado: p.conciliado === true,
    })),
    asiento: parsearAsiento(g.asiento),
    cargas: parsearCargas(g.cargas),
  };
}

export interface GastoFijo {
  id: number;
  nombre: string;
  proveedorId: number | null;
  proveedor: string | null;
  cuentaId: number;
  cuenta: string;
  tipoDocumento: TipoDocumento;
  moneda: string;
  monto: number;
  montoClp: number | null;
  diaVence: number;
  camionId: number | null;
  camion: string | null;
  desde: string;
  hasta: string | null;
  activo: boolean;
  observacion: string | null;
  generadoMes: boolean;
}
export interface GastosFijos {
  mes: string;
  faltanMes: number;
  fijos: GastoFijo[];
}
export function parsearGastosFijos(raw: unknown): GastosFijos {
  const j = (raw ?? {}) as Obj;
  return {
    mes: String(j.mes ?? ''),
    faltanMes: num(j.faltan_mes),
    fijos: arr(j.fijos).map((f) => ({
      id: num(f.id),
      nombre: String(f.nombre),
      proveedorId: numN(f.proveedor_id),
      proveedor: txt(f.proveedor),
      cuentaId: num(f.cuenta_id),
      cuenta: String(f.cuenta),
      tipoDocumento: f.tipo_documento as TipoDocumento,
      moneda: String(f.moneda),
      monto: num(f.monto),
      montoClp: numN(f.monto_clp),
      diaVence: num(f.dia_vence),
      camionId: numN(f.camion_id),
      camion: txt(f.camion),
      desde: String(f.desde),
      hasta: txt(f.hasta),
      activo: f.activo !== false,
      observacion: txt(f.observacion),
      generadoMes: f.generado_mes === true,
    })),
  };
}

// ---------------------------------------------------------------------------
// Movimientos, por cobrar y por pagar
// ---------------------------------------------------------------------------
export type TipoMovimiento = 'cobro' | 'pago' | 'ingreso' | 'egreso' | 'transferencia';
export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  cobro: 'Cobro de factura',
  pago: 'Pago de gasto',
  ingreso: 'Otro ingreso',
  egreso: 'Otro egreso',
  transferencia: 'Transferencia',
};
export interface Movimiento {
  id: number;
  numero: string;
  fecha: string;
  tipo: TipoMovimiento;
  estado: 'vigente' | 'anulado';
  motivo: string | null;
  cuenta: string;
  cuentaDineroId: number;
  moneda: string;
  monto: number;
  destino: string | null;
  detalle: string;
  conciliado: boolean;
}
export const parsearMovimientos = (raw: unknown): Movimiento[] =>
  arr(raw).map((m) => ({
    id: num(m.id),
    numero: String(m.numero),
    fecha: String(m.fecha),
    tipo: m.tipo as TipoMovimiento,
    estado: m.estado === 'anulado' ? 'anulado' : 'vigente',
    motivo: txt(m.motivo),
    cuenta: String(m.cuenta),
    cuentaDineroId: num(m.cuenta_dinero_id),
    moneda: String(m.moneda),
    monto: num(m.monto),
    destino: txt(m.destino),
    detalle: String(m.detalle ?? ''),
    conciliado: m.conciliado === true,
  }));

export interface PorCobrar {
  id: number;
  numero: string;
  numeroFiscal: string | null;
  cliente: string;
  fecha: string;
  vence: string;
  moneda: string;
  total: number;
  saldo: number;
  saldoClp: number | null;
  diasVencida: number;
  /** Cobrada desde Ventas sin decir a qué banco entró (queda en «Cobros sin cuenta bancaria»). */
  sinCuenta: boolean;
  cobradaEn: string | null;
}
export const parsearPorCobrar = (raw: unknown): PorCobrar[] =>
  arr(raw).map((f) => ({
    id: num(f.id),
    numero: String(f.numero),
    numeroFiscal: txt(f.numero_fiscal),
    cliente: String(f.cliente),
    fecha: String(f.fecha),
    vence: String(f.vence),
    moneda: String(f.moneda),
    total: num(f.total),
    saldo: num(f.saldo),
    saldoClp: numN(f.saldo_clp),
    diasVencida: num(f.dias_vencida),
    sinCuenta: f.sin_cuenta === true,
    cobradaEn: txt(f.cobrada_en),
  }));

export interface PorPagar {
  id: number;
  numero: string;
  descripcion: string;
  proveedor: string | null;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string | null;
  fecha: string;
  vence: string;
  moneda: string;
  total: number;
  saldo: number;
  saldoClp: number;
  diasVencido: number;
  fijo: boolean;
}
export const parsearPorPagar = (raw: unknown): PorPagar[] =>
  arr(raw).map((g) => ({
    id: num(g.id),
    numero: String(g.numero),
    descripcion: String(g.descripcion),
    proveedor: txt(g.proveedor),
    tipoDocumento: g.tipo_documento as TipoDocumento,
    numeroDocumento: txt(g.numero_documento),
    fecha: String(g.fecha),
    vence: String(g.vence),
    moneda: String(g.moneda),
    total: num(g.total),
    saldo: num(g.saldo),
    saldoClp: num(g.saldo_clp),
    diasVencido: num(g.dias_vencido),
    fijo: g.fijo === true,
  }));

// ---------------------------------------------------------------------------
// Cartola
// ---------------------------------------------------------------------------
export interface Sugerencia {
  clase: 'movimiento' | 'gasto' | 'factura';
  id: number;
  texto: string;
}
export interface LineaCartola {
  id: number;
  fecha: string;
  descripcion: string;
  documento: string | null;
  monto: number;
  saldo: number | null;
  ignorada: boolean;
  movimientoId: number | null;
  movimiento: string | null;
  sugerencias: Sugerencia[];
}
export const parsearCartola = (raw: unknown): LineaCartola[] =>
  arr(raw).map((l) => ({
    id: num(l.id),
    fecha: String(l.fecha),
    descripcion: String(l.descripcion),
    documento: txt(l.documento),
    monto: num(l.monto),
    saldo: numN(l.saldo),
    ignorada: l.ignorada === true,
    movimientoId: numN(l.movimiento_id),
    movimiento: txt(l.movimiento),
    sugerencias: arr(l.sugerencias).map((s) => ({ clase: s.clase as Sugerencia['clase'], id: num(s.id), texto: String(s.texto) })),
  }));

export interface ResultadoImportacion {
  nuevas: number;
  repetidas: number;
  errores: { fila: number; motivo: string }[];
}
export function parsearImportacion(raw: unknown): ResultadoImportacion {
  const j = (raw ?? {}) as Obj;
  return { nuevas: num(j.nuevas), repetidas: num(j.repetidas), errores: arr(j.errores).map((e) => ({ fila: num(e.fila), motivo: String(e.motivo) })) };
}

// ---------------------------------------------------------------------------
// Informes y tablero
// ---------------------------------------------------------------------------
export interface FilaResultado {
  cuentaId: number;
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  valores: number[];
  total: number;
}
export interface EstadoResultados {
  meses: string[];
  filas: FilaResultado[];
  ingresos: number[];
  costos: number[];
  gastos: number[];
  margen: number[];
  resultado: number[];
}
export function parsearEstadoResultados(raw: unknown): EstadoResultados {
  const j = (raw ?? {}) as Obj;
  return {
    meses: Array.isArray(j.meses) ? (j.meses as string[]) : [],
    filas: arr(j.filas).map((f) => ({
      cuentaId: num(f.cuenta_id),
      codigo: String(f.codigo),
      nombre: String(f.nombre),
      tipo: f.tipo as TipoCuenta,
      valores: nums(f.valores),
      total: num(f.total),
    })),
    ingresos: nums(j.ingresos),
    costos: nums(j.costos),
    gastos: nums(j.gastos),
    margen: nums(j.margen),
    resultado: nums(j.resultado),
  };
}

export interface FlujoCaja {
  meses: string[];
  saldoInicial: number[];
  apertura: number[];
  entradas: number[];
  salidas: number[];
  saldoFinal: number[];
  lineas: { concepto: string; entrada: boolean; valores: number[]; total: number }[];
}
export function parsearFlujoCaja(raw: unknown): FlujoCaja {
  const j = (raw ?? {}) as Obj;
  return {
    meses: Array.isArray(j.meses) ? (j.meses as string[]) : [],
    saldoInicial: nums(j.saldo_inicial),
    apertura: nums(j.apertura),
    entradas: nums(j.entradas),
    salidas: nums(j.salidas),
    saldoFinal: nums(j.saldo_final),
    lineas: arr(j.lineas).map((l) => ({ concepto: String(l.concepto), entrada: l.entrada === true, valores: nums(l.valores), total: num(l.total) })),
  };
}

export interface RenglonDiario {
  asiento: number;
  fecha: string;
  glosa: string;
  codigo: string;
  cuenta: string;
  debe: number;
  haber: number;
  detalle: string | null;
}
export const parsearLibroDiario = (raw: unknown): RenglonDiario[] =>
  arr(raw).map((l) => ({
    asiento: num(l.asiento),
    fecha: String(l.fecha),
    glosa: String(l.glosa),
    codigo: String(l.codigo),
    cuenta: String(l.cuenta),
    debe: num(l.debe),
    haber: num(l.haber),
    detalle: txt(l.detalle),
  }));

export interface TableroFinanzas {
  fletesPorFacturarClp: number;
  combustiblePorFacturarClp: number;
  fondosChoferesClp: number;
  sueldosPorPagarClp: number;
  pendientesContables: number;
  hoy: string;
  bancos: { nombre: string; moneda: string; saldo: number; saldoClp: number | null }[];
  disponibleClp: number;
  porCobrarClp: number;
  porCobrarVencidoClp: number;
  facturasVencidas: number;
  porPagarClp: number;
  porPagarVencidoClp: number;
  porPagar7DiasClp: number;
  gastosVencidos: number;
  meses: string[];
  ingresos: number[];
  costos: number[];
  gastos: number[];
  resultado: number[];
  principalesGastos: { nombre: string; valor: number }[];
  porConciliar: number;
  fijosSinGenerar: number;
  facturasSinAsiento: number;
  cobrosSinCuentaClp: number;
}
export function parsearTablero(raw: unknown): TableroFinanzas {
  const j = (raw ?? {}) as Obj;
  return {
    fletesPorFacturarClp: num(j.fletes_por_facturar_clp),
    combustiblePorFacturarClp: num(j.combustible_por_facturar_clp),
    fondosChoferesClp: num(j.fondos_choferes_clp),
    sueldosPorPagarClp: num(j.sueldos_por_pagar_clp),
    pendientesContables: num(j.pendientes_contables),
    hoy: String(j.hoy ?? ''),
    bancos: arr(j.bancos).map((b) => ({ nombre: String(b.nombre), moneda: String(b.moneda), saldo: num(b.saldo), saldoClp: numN(b.saldo_clp) })),
    disponibleClp: num(j.disponible_clp),
    porCobrarClp: num(j.por_cobrar_clp),
    porCobrarVencidoClp: num(j.por_cobrar_vencido_clp),
    facturasVencidas: num(j.facturas_vencidas),
    porPagarClp: num(j.por_pagar_clp),
    porPagarVencidoClp: num(j.por_pagar_vencido_clp),
    porPagar7DiasClp: num(j.por_pagar_7_dias_clp),
    gastosVencidos: num(j.gastos_vencidos),
    meses: Array.isArray(j.meses) ? (j.meses as string[]) : [],
    ingresos: nums(j.ingresos),
    costos: nums(j.costos),
    gastos: nums(j.gastos),
    resultado: nums(j.resultado),
    principalesGastos: arr(j.principales_gastos).map((p) => ({ nombre: String(p.nombre), valor: num(p.valor) })),
    porConciliar: num(j.por_conciliar),
    fijosSinGenerar: num(j.fijos_sin_generar),
    facturasSinAsiento: num(j.facturas_sin_asiento),
    cobrosSinCuentaClp: num(j.cobros_sin_cuenta_clp),
  };
}

/** CSV con punto y coma (Excel en español) y BOM para los acentos. */
export function aCsv(filas: (string | number | null)[][]): string {
  const celda = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
}

// ---------------------------------------------------------------------------
// Migración 74: contabilidad integrada (combustible, fondos, sueldos, fletes)
// ---------------------------------------------------------------------------
export interface CuentaElegible {
  id: number;
  nombre: string;
  moneda: string;
  tipo: 'banco' | 'caja';
}
export const parsearCuentasElegibles = (raw: unknown): CuentaElegible[] =>
  arr(raw).map((c) => ({ id: num(c.id), nombre: String(c.nombre), moneda: String(c.moneda), tipo: c.tipo === 'caja' ? 'caja' : 'banco' }));

export interface CargaCombustible {
  id: number;
  fecha: string;
  camion: string | null;
  estacion: string | null;
  litros: number;
  moneda: string;
  importe: number;
  clp: number;
  guia: string | null;
  enEsta: boolean;
}
export function parsearCargas(raw: unknown): CargaCombustible[] {
  return arr(raw).map((c) => ({
    id: num(c.id),
    fecha: String(c.fecha),
    camion: txt(c.camion),
    estacion: txt(c.estacion),
    litros: num(c.litros),
    moneda: String(c.moneda ?? 'CLP'),
    importe: num(c.importe),
    clp: num(c.clp),
    guia: txt(c.guia),
    enEsta: c.en_esta === true,
  }));
}

export type TipoMedioPago = 'factura_posterior' | 'prepago' | 'caja' | 'tanque_propio';
export const ETIQUETA_TIPO_MEDIO: Record<TipoMedioPago, string> = {
  factura_posterior: 'Factura después (cuenta corriente o tarjeta con factura)',
  prepago: 'Tarjeta prepaga (descuenta saldo)',
  caja: 'Sale de una caja o banco en el momento',
  tanque_propio: 'Tanque propio (al costo medio)',
};
export const ETIQUETA_MEDIO_CARGA: Record<string, string> = {
  cuenta_corriente: 'Cuenta corriente',
  tarjeta: 'Tarjeta',
  efectivo: 'Efectivo',
  surtidor_propio: 'Surtidor propio',
  fondo_chofer: 'Fondo del chofer',
};
export interface MedioPago {
  id: number;
  nombre: string;
  medio: string;
  proveedorId: number | null;
  proveedor: string | null;
  tipo: TipoMedioPago;
  cuentaDineroId: number | null;
  cuentaDinero: string | null;
  cuenta: string | null;
  activo: boolean;
  saldoPrepago: number | null;
}
export interface CombustibleFinanzas {
  medios: MedioPago[];
  porFacturar: { proveedorId: number | null; proveedor: string | null; saldo: number; cargas: number; desde: string | null }[];
  pendientes: number;
}
export function parsearCombustible(raw: unknown): CombustibleFinanzas {
  const j = (raw ?? {}) as Obj;
  return {
    medios: arr(j.medios).map((m) => ({
      id: num(m.id),
      nombre: String(m.nombre),
      medio: String(m.medio),
      proveedorId: numN(m.proveedor_id),
      proveedor: txt(m.proveedor),
      tipo: m.tipo as TipoMedioPago,
      cuentaDineroId: numN(m.cuenta_dinero_id),
      cuentaDinero: txt(m.cuenta_dinero),
      cuenta: txt(m.cuenta),
      activo: m.activo !== false,
      saldoPrepago: numN(m.saldo_prepago),
    })),
    porFacturar: arr(j.por_facturar).map((p) => ({
      proveedorId: numN(p.proveedor_id),
      proveedor: txt(p.proveedor),
      saldo: num(p.saldo),
      cargas: num(p.cargas),
      desde: txt(p.desde),
    })),
    pendientes: num(j.pendientes),
  };
}

export interface RenglonMayor {
  fecha: string;
  asiento: number;
  glosa: string;
  cuenta: string;
  detalle: string | null;
  tercero: string | null;
  camion: string | null;
  debe: number;
  haber: number;
  saldo: number;
  origen: string;
  origenId: number;
  ruta: string | null;
}
export interface Mayor {
  cuenta: { id: number; codigo: string; nombre: string; tipo: TipoCuenta };
  tercero: string | null;
  saldoInicial: number;
  renglones: RenglonMayor[];
}
export function parsearMayor(raw: unknown): Mayor {
  const j = (raw ?? {}) as Obj;
  const c = (j.cuenta ?? {}) as Obj;
  return {
    cuenta: { id: num(c.id), codigo: String(c.codigo ?? ''), nombre: String(c.nombre ?? ''), tipo: c.tipo as TipoCuenta },
    tercero: txt(j.tercero),
    saldoInicial: num(j.saldo_inicial),
    renglones: arr(j.renglones).map((r) => ({
      fecha: String(r.fecha),
      asiento: num(r.asiento),
      glosa: String(r.glosa),
      cuenta: String(r.cuenta),
      detalle: txt(r.detalle),
      tercero: txt(r.tercero),
      camion: txt(r.camion),
      debe: num(r.debe),
      haber: num(r.haber),
      saldo: num(r.saldo),
      origen: String(r.origen),
      origenId: num(r.origen_id),
      ruta: txt(r.ruta),
    })),
  };
}

export interface SaldoTercero {
  cuentaId: number;
  cuenta: string;
  uso: string | null;
  terceroTipo: 'cliente' | 'proveedor' | 'chofer' | null;
  terceroId: number | null;
  tercero: string;
  saldo: number;
  desde: string | null;
}
export const parsearAuxiliares = (raw: unknown): SaldoTercero[] =>
  arr(raw).map((a) => ({
    cuentaId: num(a.cuenta_id),
    cuenta: String(a.cuenta),
    uso: txt(a.uso),
    terceroTipo: (txt(a.tercero_tipo) as SaldoTercero['terceroTipo']) ?? null,
    terceroId: numN(a.tercero_id),
    tercero: String(a.tercero),
    saldo: num(a.saldo),
    desde: txt(a.desde),
  }));

/**
 * Qué significa el saldo de cada cuenta con auxiliar, en palabras. La base da el saldo como
 * debe − haber; en las cuentas de deuda (acreedora) se muestra dado vuelta.
 */
export const SENTIDO_AUXILIAR: Record<string, { titulo: string; positivo: string; acreedora: boolean }> = {
  CXC: { titulo: 'Clientes (facturas por cobrar)', positivo: 'nos debe', acreedora: false },
  FLETES_POR_FACTURAR: { titulo: 'Fletes entregados sin facturar', positivo: 'falta facturar', acreedora: false },
  CXP: { titulo: 'Proveedores (facturas por pagar)', positivo: 'le debemos', acreedora: true },
  POR_FACTURAR: { titulo: 'Combustible y compras sin factura del proveedor', positivo: 'falta la factura', acreedora: true },
  FONDOS_CHOFERES: { titulo: 'Fondos de choferes por rendir', positivo: 'tiene para rendir', acreedora: false },
  REM_POR_PAGAR: { titulo: 'Sueldos por pagar', positivo: 'le debemos', acreedora: true },
  LEYES_SOCIALES: { titulo: 'Leyes sociales por pagar (Previred)', positivo: 'por pagar', acreedora: true },
};
/** Saldo de un auxiliar en el sentido natural de su cuenta (positivo = lo normal). */
export const saldoNatural = (a: SaldoTercero) => (SENTIDO_AUXILIAR[a.uso ?? '']?.acreedora ? -a.saldo : a.saldo);

export interface Traza {
  asientos: (Asiento & { origen: string; id: number })[];
  relacionados: { clase: string; id: number; texto: string; ruta: string | null }[];
  movimientos: { id: number; numero: string; fecha: string; tipo: string; estado: string; cuenta: string; moneda: string; monto: number;
    cartola: { fecha: string; descripcion: string; monto: number } | null }[];
  pendiente: string | null;
}
export function parsearTraza(raw: unknown): Traza {
  const j = (raw ?? {}) as Obj;
  return {
    asientos: arr(j.asientos).map((a) => ({ ...(parsearAsiento(a) as Asiento), origen: String(a.origen), id: num(a.id) })),
    relacionados: arr(j.relacionados).map((r) => ({ clase: String(r.clase), id: num(r.id), texto: String(r.texto), ruta: txt(r.ruta) })),
    movimientos: arr(j.movimientos).map((m) => ({
      id: num(m.id),
      numero: String(m.numero),
      fecha: String(m.fecha),
      tipo: String(m.tipo),
      estado: String(m.estado),
      cuenta: String(m.cuenta),
      moneda: String(m.moneda),
      monto: num(m.monto),
      cartola: m.cartola ? { fecha: String((m.cartola as Obj).fecha), descripcion: String((m.cartola as Obj).descripcion), monto: num((m.cartola as Obj).monto) } : null,
    })),
    pendiente: txt(j.pendiente),
  };
}

export interface PendienteContable {
  origen: string;
  origenId: number;
  motivo: string;
  desde: string;
  ruta: string | null;
}
export const parsearPendientes = (raw: unknown): PendienteContable[] =>
  arr(raw).map((p) => ({ origen: String(p.origen), origenId: num(p.origen_id), motivo: String(p.motivo), desde: String(p.desde), ruta: txt(p.ruta) }));
export const ETIQUETA_ORIGEN: Record<string, string> = {
  factura: 'Factura de venta',
  factura_cobro: 'Cobro sin banco',
  gasto: 'Gasto',
  movimiento: 'Movimiento de dinero',
  apertura: 'Saldo inicial',
  carga: 'Carga de combustible',
  fondo: 'Fondo de chofer',
  liquidacion: 'Liquidación',
  liquidacion_pago: 'Sueldo pagado sin banco',
  servicio: 'Flete entregado',
};
