/**
 * Cuenta corriente de clientes (pedido de Gerencia, 17/11/2026): saldos por cliente y moneda, y los movimientos de cada
 * cliente (factura = debe; cobro y anulación = haber) con saldo corrido. Los números los calcula la base.
 */
export interface SaldoCliente {
  clienteId: number;
  cliente: string;
  moneda: string;
  facturado: number;
  cobrado: number;
  saldo: number;
  vencido: number;
  facturasAbiertas: number;
  venceLaMasVieja: string | null;
  ultimaFactura: string | null;
  ultimoCobro: string | null;
}

export interface MovimientoCc {
  fecha: string;
  tipo: 'factura' | 'cobro' | 'anulacion';
  facturaId: number | null;
  documento: string;
  detalle: string | null;
  vence: string | null;
  debe: number;
  haber: number;
  saldo: number;
}

export interface CuentaMoneda {
  moneda: string;
  saldoAnterior: number;
  facturado: number;
  cobrado: number;
  saldo: number;
  saldoHoy: number;
  porVencer: number;
  vencido30: number;
  vencido60: number;
  vencidoMas60: number;
  movimientos: MovimientoCc[];
}

export interface CuentaCorriente {
  cliente: { id: number; nombre: string; razonSocial: string; plazoDias: number | null };
  desde: string;
  hasta: string;
  monedas: CuentaMoneda[];
}

type J = Record<string, unknown>;
const esObj = (x: unknown): x is J => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number => (x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) ? Number(x) : 0);
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);
const lista = (x: unknown): J[] => (Array.isArray(x) ? x.filter(esObj) : []);

export function parsearSaldosClientes(crudo: unknown): SaldoCliente[] {
  return lista(esObj(crudo) ? crudo.clientes : null).map((c) => ({
    clienteId: num(c.cliente_id),
    cliente: String(c.cliente ?? ''),
    moneda: String(c.moneda ?? ''),
    facturado: num(c.facturado),
    cobrado: num(c.cobrado),
    saldo: num(c.saldo),
    vencido: num(c.vencido),
    facturasAbiertas: num(c.facturas_abiertas),
    venceLaMasVieja: txt(c.vence_la_mas_vieja),
    ultimaFactura: txt(c.ultima_factura),
    ultimoCobro: txt(c.ultimo_cobro),
  }));
}

export function parsearCuentaCorriente(crudo: unknown): CuentaCorriente {
  const j = esObj(crudo) ? crudo : {};
  const c = esObj(j.cliente) ? j.cliente : {};
  return {
    cliente: { id: num(c.id), nombre: String(c.nombre ?? ''), razonSocial: String(c.razon_social ?? ''), plazoDias: c.plazo_dias === null || c.plazo_dias === undefined ? null : num(c.plazo_dias) },
    desde: String(j.desde ?? ''),
    hasta: String(j.hasta ?? ''),
    monedas: lista(j.monedas).map((m) => ({
      moneda: String(m.moneda ?? ''),
      saldoAnterior: num(m.saldo_anterior),
      facturado: num(m.facturado),
      cobrado: num(m.cobrado),
      saldo: num(m.saldo),
      saldoHoy: num(m.saldo_hoy),
      porVencer: num(m.por_vencer),
      vencido30: num(m.vencido_1_30),
      vencido60: num(m.vencido_31_60),
      vencidoMas60: num(m.vencido_mas_60),
      movimientos: lista(m.movimientos).map((x) => ({
        fecha: String(x.fecha ?? ''),
        tipo: x.tipo === 'cobro' || x.tipo === 'anulacion' ? x.tipo : ('factura' as const),
        facturaId: x.factura_id === null || x.factura_id === undefined ? null : num(x.factura_id),
        documento: String(x.documento ?? ''),
        detalle: txt(x.detalle),
        vence: txt(x.vence),
        debe: num(x.debe),
        haber: num(x.haber),
        saldo: num(x.saldo),
      })),
    })),
  };
}

/** Para bajar la cuenta a una planilla (CSV con punto y coma, como abre Excel en español). */
export function cuentaACsv(c: CuentaCorriente): string {
  const n = (v: number) => v.toFixed(2).replace('.', ',');
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const filas = [['Moneda', 'Fecha', 'Documento', 'Detalle', 'Vence', 'Debe', 'Haber', 'Saldo'].join(';')];
  for (const m of c.monedas) {
    filas.push([m.moneda, c.desde, q('Saldo anterior'), '', '', '', '', n(m.saldoAnterior)].join(';'));
    for (const x of m.movimientos) filas.push([m.moneda, x.fecha, q(x.documento), q(x.detalle ?? ''), x.vence ?? '', n(x.debe), n(x.haber), n(x.saldo)].join(';'));
  }
  return filas.join('\r\n');
}
