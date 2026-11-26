import type { TableroFinanzas } from './finanzas.types';

/**
 * Migración 372 · El tablero financiero en pesos chilenos o en dólares. La contabilidad está en pesos: para verlo en
 * dólares se dividen los saldos de hoy por el dólar de hoy y los números de cada mes por el dólar promedio de ese mes.
 */
export type MonedaTablero = 'CLP' | 'USD';

/** Dólar de cada mes; si un mes no tiene, el del mes más cercano que sí tenga (o el de hoy). */
export function dolarDeCadaMes(t: TableroFinanzas): number[] {
  const hoy = t.tcUsd ?? 0;
  const base = t.meses.map((_, i) => t.tcUsdMeses[i] ?? null);
  return base.map((v, i) => {
    if (v && v > 0) return v;
    const despues = base.slice(i + 1).find((x): x is number => !!x && x > 0);
    const antes = [...base.slice(0, i)].reverse().find((x): x is number => !!x && x > 0);
    return despues ?? antes ?? hoy;
  });
}

/** El tablero pasado a dólares. Sin dólar cargado, lo deja en pesos. */
export function tableroEnUsd(t: TableroFinanzas): TableroFinanzas {
  const hoy = t.tcUsd;
  if (!hoy || hoy <= 0) return t;
  const a = (v: number) => v / hoy;
  const meses = dolarDeCadaMes(t);
  const porMes = (serie: number[]) => serie.map((v, i) => v / (meses[i] || hoy));
  const delMes = meses[meses.length - 1] || hoy;
  return {
    ...t,
    fletesPorFacturarClp: a(t.fletesPorFacturarClp),
    combustiblePorFacturarClp: a(t.combustiblePorFacturarClp),
    fondosChoferesClp: a(t.fondosChoferesClp),
    sueldosPorPagarClp: a(t.sueldosPorPagarClp),
    bancos: t.bancos.map((b) => ({ ...b, saldoClp: b.saldoClp === null ? null : a(b.saldoClp) })),
    disponibleClp: a(t.disponibleClp),
    porCobrarClp: a(t.porCobrarClp),
    porCobrarVencidoClp: a(t.porCobrarVencidoClp),
    porPagarClp: a(t.porPagarClp),
    porPagarVencidoClp: a(t.porPagarVencidoClp),
    porPagar7DiasClp: a(t.porPagar7DiasClp),
    cobrosSinCuentaClp: a(t.cobrosSinCuentaClp),
    ingresos: porMes(t.ingresos),
    costos: porMes(t.costos),
    gastos: porMes(t.gastos),
    resultado: porMes(t.resultado),
    principalesGastos: t.principalesGastos.map((p) => ({ ...p, valor: p.valor / delMes })),
  };
}

/** El tablero en la moneda elegida. */
export function tableroEn(t: TableroFinanzas, moneda: MonedaTablero): TableroFinanzas {
  return moneda === 'USD' ? tableroEnUsd(t) : t;
}
