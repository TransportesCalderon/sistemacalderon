import { describe, expect, it } from 'vitest';
import { cargoChoferSchema, parsearCargos } from '@/modules/chofer/domain/cargo-chofer';

describe('cargos al chofer en cuotas (migración 289)', () => {
  it('lee el saldo y la cuota del mes', () => {
    const c = parsearCargos([{ id: 1, numero: 'CC-000001', concepto: 'Visa de trabajo', moneda: 'CLP', total: '500000', cuotas: 3, estado: 'vigente', cuotas_descontadas: 1, saldo: '333333.33', cuota_de_este_mes: { numero: 2, importe: 166666.67 } }]);
    expect(c[0]).toMatchObject({ total: 500000, cuotas: 3, cuotasDescontadas: 1, saldo: 333333.33, cuotaDeEsteMes: { numero: 2, importe: 166666.67 }, gasto: null });
    expect(parsearCargos('x')).toEqual([]);
  });

  it('pide los datos con la forma correcta', () => {
    const ok = cargoChoferSchema.safeParse({ choferId: 1, concepto: 'Visa de trabajo', fecha: '2026-11-10', moneda: 'CLP', total: 500000, cuotas: 6, desde: '2026-11', gasto: '', observacion: '' });
    expect(ok.success).toBe(true);
    const mal = cargoChoferSchema.safeParse({ choferId: 1, concepto: 'Visa', fecha: '2026-11-10', moneda: 'CLP', total: 0, cuotas: 40, desde: '2026-11-01', gasto: '', observacion: '' });
    expect(mal.success).toBe(false);
  });
});
