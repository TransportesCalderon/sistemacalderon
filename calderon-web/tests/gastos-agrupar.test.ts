import { describe, expect, it } from 'vitest';
import { agrupar } from '@/modules/finanzas/domain/gastos-agrupar';

const g = (id: number, descripcion: string, fijo = true, proveedor: string | null = 'ZZ Banco') => ({ id, fijo, proveedor, descripcion });

describe('Finanzas › Gastos: las cuotas de un mismo gasto fijo van plegadas', () => {
  it('junta las cuotas del mismo leasing y deja sueltos los demás', () => {
    const r = agrupar([
      g(3, 'Leasing ZZ · 08/2026 · cuota 49 de 49'),
      g(9, 'Factura de repuestos', false, 'ZZ Repuestos'),
      g(2, 'Leasing ZZ · 07/2026 · cuota 48 de 49'),
      g(1, 'Leasing ZZ · 06/2026 · cuota 47 de 49'),
      g(5, 'Arriendo oficina · 11/2026'),
    ]);
    expect(r.length).toBe(3);
    const grupo = r[0]!;
    expect('gastos' in grupo && grupo.gastos.map((x) => x.id)).toEqual([3, 2, 1]);
    expect('gastos' in grupo && grupo.nombre).toBe('Leasing ZZ');
    expect('gastos' in r[1]!).toBe(false);
    expect('gastos' in r[2]!).toBe(false);
  });

  it('no mezcla proveedores distintos ni gastos que no son fijos', () => {
    const r = agrupar([g(1, 'Seguro · 10/2026', true, 'A'), g(2, 'Seguro · 11/2026', true, 'B'), g(3, 'Seguro · 10/2026', false, 'A')]);
    expect(r.length).toBe(3);
  });
});
