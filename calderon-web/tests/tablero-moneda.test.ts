import { describe, expect, it } from 'vitest';
import { dineroCorto, parsearTablero } from '@/modules/finanzas/domain/finanzas.types';
import { dolarDeCadaMes, tableroEn, tableroEnUsd } from '@/modules/finanzas/domain/tablero-moneda';

// Migración 372 · El tablero financiero en pesos o en dólares
const t = parsearTablero({
  hoy: '2026-11-26', disponible_clp: -72403518, por_cobrar_clp: 333186808, por_pagar_clp: 206140776,
  bancos: [{ nombre: 'Dólares Aurea', moneda: 'USD', saldo: 5000, saldo_clp: 5010350 }],
  meses: ['2026-09-01', '2026-10-01', '2026-11-01'],
  ingresos: [0, 196000000, 205000000], costos: [0, 190000000, 100000000], gastos: [0, 10000000, 9000000], resultado: [0, -4000000, 96000000],
  principales_gastos: [{ nombre: 'Combustible', valor: 59855714 }],
  tc_usd: 1002.07, tc_usd_fecha: '2026-11-19', tc_usd_meses: [null, 980, 1000],
});

describe('tablero en dólares', () => {
  it('lee el dólar de hoy y el de cada mes', () => {
    expect(t.tcUsd).toBe(1002.07);
    expect(t.tcUsdFecha).toBe('2026-11-19');
    expect(t.tcUsdMeses).toEqual([null, 980, 1000]);
  });

  it('un mes sin dólar usa el del mes más cercano', () => {
    expect(dolarDeCadaMes(t)).toEqual([980, 980, 1000]);
  });

  it('los saldos van al dólar de hoy y los meses al de cada mes', () => {
    const u = tableroEnUsd(t);
    expect(u.porCobrarClp).toBeCloseTo(333186808 / 1002.07, 6);
    expect(u.disponibleClp).toBeCloseTo(-72403518 / 1002.07, 6);
    expect(u.bancos[0]?.saldo).toBe(5000);
    expect(u.ingresos[1]).toBeCloseTo(196000000 / 980, 6);
    expect(u.resultado[2]).toBeCloseTo(96000, 6);
    expect(u.principalesGastos[0]?.valor).toBeCloseTo(59855.714, 6);
  });

  it('en pesos, o sin dólar cargado, queda igual', () => {
    expect(tableroEn(t, 'CLP')).toBe(t);
    const sin = { ...t, tcUsd: null };
    expect(tableroEnUsd(sin)).toBe(sin);
  });

  it('el número corto lleva la moneda', () => {
    expect(dineroCorto(96000000)).toBe('$ 96 M');
    expect(dineroCorto(96000, 'USD')).toBe('US$ 96 mil');
    expect(dineroCorto(-4000, 'USD')).toBe('−US$ 4 mil');
  });
});
