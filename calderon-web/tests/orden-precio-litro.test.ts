import { describe, expect, it } from 'vitest';
import { parsearDetalle } from '@/modules/combustible/domain/orden-carga.types';

describe('precio por litro en la orden (migración 292)', () => {
  it('el detalle conserva el precio', () => {
    expect(parsearDetalle({ destino: 'tanques', tanques: { modo: 'lleno' }, precio_litro: '1495.5' })?.precio_litro).toBe(1495.5);
    expect(parsearDetalle({ destino: 'tanques', tanques: { modo: 'lleno' } })?.precio_litro).toBeUndefined();
  });
});
