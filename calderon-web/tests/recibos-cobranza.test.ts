import { describe, expect, it } from 'vitest';
import { armarRecibo, leerMonto, parsearReciboCreado, parsearRecibos } from '@/modules/finanzas/domain/finanzas.types';
import { reciboSchema } from '@/modules/finanzas/domain/finanzas.schemas';

/** Migración 275 · Recibos de cobranza con varias facturas del mismo cliente. */
describe('recibos de cobranza', () => {
  it('lee los recibos con sus facturas', () => {
    const [r] = parsearRecibos([
      {
        id: 3, numero: 'RC-000003', fecha: '2026-11-17', cliente_id: 9, cliente: 'Erios', cuenta: 'Banco USD', moneda: 'USD',
        observacion: null, estado: 'vigente', motivo_anulacion: null, creado_por: 'Ana', total: '1200.00',
        facturas: [
          { factura_id: 38, numero: 'E-1', fecha: '2026-10-01', monto: '1000.00', anulado: false },
          { factura_id: 39, numero: 'E-2', fecha: '2026-10-05', monto: '200.00', anulado: true },
        ],
      },
    ]);
    expect(r!.numero).toBe('RC-000003');
    expect(r!.total).toBe(1200);
    expect(r!.estado).toBe('vigente');
    expect(r!.facturas.map((f) => [f.facturaId, f.monto, f.anulado])).toEqual([[38, 1000, false], [39, 200, true]]);
    expect(parsearRecibos(null)).toEqual([]);
  });

  it('lee lo que devuelve la base al registrar', () => {
    expect(parsearReciboCreado({ id: 1, numero: 'RC-000001', facturas: 2, total: 1200, moneda: 'USD' })).toEqual({
      id: 1, numero: 'RC-000001', facturas: 2, total: 1200, moneda: 'USD',
    });
  });

  it('propone el saldo de cada factura y suma lo escrito', () => {
    const facturas = [
      { id: 1, moneda: 'CLP', saldo: 100000 },
      { id: 2, moneda: 'CLP', saldo: 50000 },
    ];
    expect(armarRecibo(facturas, {}, 'CLP')).toEqual({ total: 150000, otraMoneda: [], vacias: [] });
    expect(armarRecibo(facturas, { 2: '20.000' }, 'CLP').total).toBe(120000);
    expect(armarRecibo(facturas, { 2: '' }, 'CLP').vacias).toEqual([2]);
    expect(armarRecibo([...facturas, { id: 3, moneda: 'USD', saldo: 10 }], {}, 'CLP').otraMoneda).toEqual([3]);
  });

  it('entiende montos con coma o puntos de miles', () => {
    expect(leerMonto('1.234,56')).toBe(1234.56);
    expect(leerMonto('1234.56')).toBe(1234.56);
    expect(leerMonto('1.234')).toBe(1234);
    expect(leerMonto(' ')).toBeNull();
    expect(leerMonto('abc')).toBeNull();
  });

  it('pide al menos una factura y el banco', () => {
    const base = { fecha: '2026-11-17', cuentaDineroId: 4, observacion: '', facturas: [{ facturaId: 1, monto: '1.000' }] };
    const ok = reciboSchema.parse(base);
    expect(ok.facturas[0]!.monto).toBe(1000);
    expect(ok.observacion).toBeNull();
    expect(reciboSchema.safeParse({ ...base, facturas: [] }).success).toBe(false);
    expect(reciboSchema.safeParse({ ...base, cuentaDineroId: 0 }).success).toBe(false);
  });
});
