import { describe, expect, it } from 'vitest';
import { agruparSaldos } from '@/modules/finanzas/domain/saldos-por-tercero';

/** 17/11/2026 · Nos deben por cliente y Debemos por proveedor, con vencido y por vencer. */
describe('saldos por cliente o proveedor', () => {
  const facturas = [
    { cliente: 'Tropical Argentina SRL', moneda: 'USD', saldo: 7500, vencida: true, vence: '2026-10-11' },
    { cliente: 'andina SpA', moneda: 'CLP', saldo: 100000, vencida: false, vence: '2026-12-01' },
    { cliente: 'Tropical Argentina SRL', moneda: 'USD', saldo: 4850, vencida: false, vence: '2026-11-30' },
    { cliente: 'Tropical Argentina SRL', moneda: 'CLP', saldo: 50000, vencida: true, vence: '2026-10-01' },
  ];
  const r = agruparSaldos(facturas, {
    nombre: (f) => f.cliente,
    moneda: (f) => f.moneda,
    saldo: (f) => f.saldo,
    vencido: (f) => f.vencida,
    orden: (a, b) => a.vence.localeCompare(b.vence),
  });

  it('ordena por nombre y cada grupo por vencimiento', () => {
    expect(r.grupos.map((g) => g.nombre)).toEqual(['andina SpA', 'Tropical Argentina SRL']);
    expect(r.grupos[1]!.items.map((f) => f.vence)).toEqual(['2026-10-01', '2026-10-11', '2026-11-30']);
  });

  it('suma vencido y por vencer por moneda, por cliente y en total', () => {
    expect(r.grupos[1]!.saldos).toEqual([
      { moneda: 'CLP', vencido: 50000, porVencer: 0, total: 50000 },
      { moneda: 'USD', vencido: 7500, porVencer: 4850, total: 12350 },
    ]);
    expect(r.totales).toEqual([
      { moneda: 'CLP', vencido: 50000, porVencer: 100000, total: 150000 },
      { moneda: 'USD', vencido: 7500, porVencer: 4850, total: 12350 },
    ]);
  });
});
