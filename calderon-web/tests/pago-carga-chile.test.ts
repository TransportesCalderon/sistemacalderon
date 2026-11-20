import { describe, expect, it } from 'vitest';
import { parsearPagosCarga, pagoCargaTransferirSchema } from '@/modules/finanzas/domain/pago-carga';
import { parsearDetalle } from '@/modules/combustible/domain/orden-carga.types';

describe('carga en Chile: tarjeta o transferencia (migración 290)', () => {
  it('el detalle conserva cómo se paga', () => {
    expect(parsearDetalle({ destino: 'tanques', tanques: { modo: 'lleno' }, medio_pago: 'transferencia' })?.medio_pago).toBe('transferencia');
    expect(parsearDetalle({ destino: 'tanques', tanques: { modo: 'lleno' }, medio_pago: 'efectivo' })?.medio_pago).toBeUndefined();
  });

  it('lee lo que tiene que hacer Finanzas', () => {
    const p = parsearPagosCarga([{ id: 1, medio: 'transferencia', estado: 'pendiente', orden: 'OC-000002', estacion: 'Shell Lo Espejo', litros: '300', precio: 1548.84, moneda: 'CLP', importe: 464652 }]);
    expect(p[0]).toMatchObject({ medio: 'transferencia', estado: 'pendiente', litros: 300, importe: 464652, proveedor: null });
    expect(parsearPagosCarga(null)).toEqual([]);
    expect(pagoCargaTransferirSchema.safeParse({ id: 1, cuentaId: 8, fecha: '2026-11-20', monto: 464652, montoDeuda: null, observacion: '' }).success).toBe(true);
  });
});
