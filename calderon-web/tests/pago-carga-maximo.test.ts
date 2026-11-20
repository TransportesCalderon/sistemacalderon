import { describe, expect, it } from 'vitest';
import { parsearDetalle } from '@/modules/combustible/domain/orden-carga.types';
import { parsearPagosCarga } from '@/modules/finanzas/domain/pago-carga';

describe('cargas sin datos: litros a mano y máximo (migración 294)', () => {
  it('el detalle conserva los litros escritos a mano', () => {
    expect(parsearDetalle({ destino: 'tanques', tanques: { modo: 'lleno' }, litros_estimados: 600 })?.litros_estimados).toBe(600);
  });
  it('Finanzas recibe el máximo', () => {
    const p = parsearPagosCarga([{ id: 1, medio: 'transferencia', estado: 'pendiente', importe: null, litros_max: '830', importe_max: 1182750 }]);
    expect(p[0]).toMatchObject({ importe: null, litrosMax: 830, importeMax: 1182750 });
  });
});
