import { describe, expect, it } from 'vitest';
import { can, permisosDe } from '@/modules/core/permissions/resolver';
import { decimalLocal, parsearCuadre, parsearFacturasInsumos, parsearInsumosOt, parsearKardex, parsearStock, stockEn } from '@/modules/flota/domain/stock.types';
import { parsearOrdenes } from '@/modules/flota/domain/mantenimiento.types';

const agregado = { gerenciaDetalleAlertas: 'agregado' as const };

describe('migración 216 · stock de insumos', () => {
  it('el stock trae pañoles, insumos con su stock por pañol, valor y bajo mínimo', () => {
    const s = parsearStock({
      panoles: [{ id: 1, nombre: 'Mendoza', ubicacion: null, activo: true }],
      insumos: [
        {
          id: 7, codigo: 'F1', nombre: 'Filtro', unidad: 'unidad', categoria: 'filtro', stock_minimo: 25, activo: true, cantidad: 19, valor: 31666,
          bajo_minimo: true, por_panol: [{ panol_id: 1, panol: 'Mendoza', cantidad: 14, costo_promedio: 1666.65, valor: 23333 }],
        },
      ],
      valor_total: 31666,
    });
    const i = s.insumos[0];
    expect(i).toMatchObject({ codigo: 'F1', categoria: 'filtro', cantidad: 19, bajoMinimo: true, stockMinimo: 25 });
    expect(stockEn(i, 1)).toBe(14);
    expect(stockEn(i, 9)).toBe(0);
    expect(s.valorTotal).toBe(31666);
    expect(parsearStock(null)).toEqual({ panoles: [], insumos: [], valorTotal: 0 });
  });

  it('kardex, facturas, insumos de la OT y cuadre', () => {
    const [m] = parsearKardex([{ id: 3, fecha: '2026-11-09T10:00:00Z', tipo: 'consumo', panol: 'Mendoza', cantidad: -12, costo_unitario: 1666.6667, importe: -20000, ot: 'OT-1', ot_id: 4 }]);
    expect(m).toMatchObject({ tipo: 'consumo', cantidad: -12, importe: -20000, ot: 'OT-1', otId: 4 });
    const [f] = parsearFacturasInsumos([{ id: 2, numero: 'GA-1', moneda: 'CLP', neto: 40000, tc_clp: 1, detallado: 0, pendiente: 40000 }]);
    expect(f).toMatchObject({ numero: 'GA-1', pendiente: 40000, tcClp: 1 });
    const ot = parsearInsumosOt({ costo: 16667, consumos: [{ id: 3, insumo: 'Filtro', unidad: 'unidad', cantidad: 12, devuelto: 2, costo_unitario: 1666.6667, importe: 20000 }] });
    expect(ot.costo).toBe(16667);
    expect(ot.consumos[0]).toMatchObject({ cantidad: 12, devuelto: 2 });
    expect(parsearCuadre({ valor_stock: 5, saldo_contable: 5, cuadra: true })).toMatchObject({ cuadra: true, diferencia: 0 });
    expect(parsearOrdenes([{ id: 1, costo_insumos: 16667 }])[0]?.costoInsumos).toBe(16667);
    expect(parsearOrdenes([{ id: 1 }])[0]?.costoInsumos).toBeNull();
  });

  it('los números se escriben a la manera local', () => {
    expect(decimalLocal('1.234,5')).toBe(1234.5);
    expect(decimalLocal('12')).toBe(12);
    expect(decimalLocal('')).toBeNull();
    expect(decimalLocal('abc')).toBeNull();
  });

  it('lo manejan el Jefe y TI; Finanzas detalla compras; el mecánico lo ve y usa insumos desde la OT', () => {
    expect(can(permisosDe(['mantenimiento_jefe'], agregado), 'mantenimiento.stock:editar')).toBe(true);
    expect(can(permisosDe(['finanzas'], agregado), 'mantenimiento.stock:editar')).toBe(true);
    expect(can(permisosDe(['mecanico'], agregado), 'mantenimiento.stock:editar')).toBe(false);
    expect(can(permisosDe(['mecanico'], agregado), 'mantenimiento.stock:ver')).toBe(true);
    expect(can(permisosDe(['mecanico'], agregado), 'mantenimiento.ordenes:editar')).toBe(true);
    expect(can(permisosDe(['operaciones'], agregado), 'mantenimiento.stock:ver')).toBe(false);
  });
});
