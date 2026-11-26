import { describe, expect, it } from 'vitest';
import { parsearEstimadoChoferes, principalesConEstimado } from '@/modules/finanzas/domain/estimado-choferes';

// Migración 366 · Estimado de bono y km de los choferes en «En qué se fue la plata este mes»
describe('estimado de los choferes del mes', () => {
  const e = parsearEstimadoChoferes({
    periodo: '2026-11-01', desde: '2026-10-27', hasta: '2026-11-26', moneda: 'CLP',
    bono: 1600000, adicional_km: 1000000, km: 20000, total: 2600000, choferes: 3, calculado_en: '2026-11-26T15:00:00Z',
  });

  it('parsea lo que devuelve la base', () => {
    expect(e).toMatchObject({ bono: 1600000, adicionalKm: 1000000, km: 20000, total: 2600000, choferes: 3, desde: '2026-10-27' });
  });

  it('se agrega ordenado y marcado como estimado', () => {
    const items = principalesConEstimado([{ nombre: 'Combustible', valor: 5000000 }, { nombre: 'Peajes', valor: 300000 }], e);
    expect(items.map((i) => i.nombre)).toEqual(['Combustible', 'Choferes: bono por tramo y km (estimado, sin liquidar)', 'Peajes']);
    expect(items[1]?.estimado).toBe(true);
  });

  it('sin estimado o en cero no cambia nada', () => {
    const base = [{ nombre: 'Combustible', valor: 1 }];
    expect(principalesConEstimado(base, null)).toBe(base);
    expect(principalesConEstimado(base, { ...e, total: 0 })).toBe(base);
  });
});
