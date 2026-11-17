/**
 * 17/11/2026 · Cobros y pagos: lo que nos deben (por cliente) y lo que debemos (por proveedor), con lo vencido
 * y lo que todavía no venció, por tercero y en total. Cada moneda se suma aparte (no se mezclan).
 */
export interface Saldo {
  moneda: string;
  vencido: number;
  porVencer: number;
  total: number;
}
export interface GrupoSaldos<T> {
  nombre: string;
  items: T[];
  saldos: Saldo[];
}

const ORDEN_MONEDA = ['CLP', 'USD', 'ARS'];
const ordenMoneda = (a: Saldo, b: Saldo) => {
  const ia = ORDEN_MONEDA.indexOf(a.moneda);
  const ib = ORDEN_MONEDA.indexOf(b.moneda);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.moneda.localeCompare(b.moneda);
};

function sumar(destino: Map<string, Saldo>, moneda: string, saldo: number, vencido: boolean) {
  const s = destino.get(moneda) ?? { moneda, vencido: 0, porVencer: 0, total: 0 };
  if (vencido) s.vencido += saldo;
  else s.porVencer += saldo;
  s.total += saldo;
  destino.set(moneda, s);
}

export function agruparSaldos<T>(
  items: readonly T[],
  f: { nombre: (x: T) => string; moneda: (x: T) => string; saldo: (x: T) => number; vencido: (x: T) => boolean; orden?: (a: T, b: T) => number },
): { grupos: GrupoSaldos<T>[]; totales: Saldo[] } {
  const grupos = new Map<string, { items: T[]; saldos: Map<string, Saldo> }>();
  const totales = new Map<string, Saldo>();
  for (const x of items) {
    const nombre = f.nombre(x);
    const g = grupos.get(nombre) ?? { items: [], saldos: new Map<string, Saldo>() };
    g.items.push(x);
    sumar(g.saldos, f.moneda(x), f.saldo(x), f.vencido(x));
    sumar(totales, f.moneda(x), f.saldo(x), f.vencido(x));
    grupos.set(nombre, g);
  }
  return {
    grupos: [...grupos.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      .map(([nombre, g]) => ({ nombre, items: f.orden ? [...g.items].sort(f.orden) : g.items, saldos: [...g.saldos.values()].sort(ordenMoneda) })),
    totales: [...totales.values()].sort(ordenMoneda),
  };
}
