/**
 * Finanzas › Compra de vehículos con documentos. La base arma el activo, la deuda, los intereses y la depreciación;
 * acá solo se leen los datos y se hace la cuenta que el formulario muestra antes de guardar.
 */
type Obj = Record<string, unknown>;
const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v));
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

export interface UnidadCompra {
  id: number;
  patente: string;
}
export interface CompraRodado {
  id: number;
  /** «otro» = camioneta, auto u otro vehículo que no es de la flota: «patente» trae su descripción. */
  tipo: 'tractor' | 'semi' | 'otro';
  patente: string;
  fecha: string;
  proveedor: string | null;
  valorNeto: number;
  iva: number;
  pie: number;
  documentos: number;
  montoDocumento: number;
  documentosPagados: number;
  interesTotal: number;
  depreciacionAcumulada: number;
  depreciacionMes: number;
  valorLibro: number;
  faltaPagar: number;
  vencido: number;
  gastoFijoId: number | null;
  observacion: string | null;
}
export interface ComprasRodados {
  tractores: UnidadCompra[];
  semis: UnidadCompra[];
  compras: CompraRodado[];
}

const unidad = (u: Obj): UnidadCompra => ({ id: num(u.id), patente: String(u.patente ?? '') });
export function parsearComprasRodados(raw: unknown): ComprasRodados {
  const j = (raw ?? {}) as Obj;
  return {
    tractores: arr(j.tractores).map(unidad),
    semis: arr(j.semis).map(unidad),
    compras: arr(j.compras).map((c) => ({
      id: num(c.id),
      tipo: c.tipo === 'semi' ? 'semi' : c.tipo === 'otro' ? 'otro' : 'tractor',
      patente: String(c.patente ?? ''),
      fecha: String(c.fecha ?? ''),
      proveedor: txt(c.proveedor),
      valorNeto: num(c.valor_neto),
      iva: num(c.iva),
      pie: num(c.pie),
      documentos: num(c.documentos),
      montoDocumento: num(c.monto_documento),
      documentosPagados: num(c.documentos_pagados),
      interesTotal: num(c.interes_total),
      depreciacionAcumulada: num(c.depreciacion_acumulada),
      depreciacionMes: num(c.depreciacion_mes),
      valorLibro: num(c.valor_libro),
      faltaPagar: num(c.falta_pagar),
      vencido: num(c.vencido),
      gastoFijoId: c.gasto_fijo_id === null || c.gasto_fijo_id === undefined ? null : num(c.gasto_fijo_id),
      observacion: txt(c.observacion),
    })),
  };
}

/** «1.234.567», «1234567» o «1234567,5» → número. Vacío o no válido → 0. */
export function aNumero(v: string): number {
  const t = v.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return t !== '' && Number.isFinite(n) ? n : 0;
}

export interface CuentaCompra {
  /** Valor + IVA − pie: lo que se paga con documentos. */
  financiado: number;
  totalDocumentos: number;
  /** Lo documentado de más sobre lo financiado. */
  interes: number;
  depreciacionMes: number;
  /** Por qué no cierra (misma regla que la base), o null si está bien. */
  aviso: string | null;
}

/** La cuenta que el formulario muestra antes de guardar. La base vuelve a validar todo. */
export function cuentaCompra(d: { valorNeto: number; iva: number; pie: number; documentos: number; montoDocumento: number; vidaUtilMeses: number; valorResidual: number }): CuentaCompra {
  const financiado = d.valorNeto + d.iva - d.pie;
  const totalDocumentos = d.documentos * d.montoDocumento;
  let aviso: string | null = null;
  if (d.valorNeto <= 0) aviso = 'Falta el valor contado del vehículo.';
  else if (financiado < 0) aviso = 'El pie es más que el valor del vehículo con IVA.';
  else if (d.documentos === 0 && financiado > 0) aviso = 'Sin documentos, el pie tiene que cubrir todo el valor con IVA.';
  else if (d.documentos > 0 && financiado === 0) aviso = 'El pie ya cubre todo el valor: no quedan documentos por cargar.';
  else if (d.documentos > 0 && totalDocumentos < financiado) aviso = 'Los documentos suman menos que lo financiado: revisá los montos.';
  else if (d.vidaUtilMeses < 1) aviso = 'Falta la vida útil en meses.';
  else if (d.valorResidual >= d.valorNeto) aviso = 'El valor residual tiene que ser menor que el valor del vehículo.';
  return {
    financiado,
    totalDocumentos,
    interes: Math.max(totalDocumentos - financiado, 0),
    depreciacionMes: d.vidaUtilMeses >= 1 ? Math.round((d.valorNeto - d.valorResidual) / d.vidaUtilMeses) : 0,
    aviso,
  };
}
