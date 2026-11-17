import { describe, expect, it } from 'vitest';
import { parsearCuentaEstaciones } from '@/modules/finanzas/domain/finanzas.types';

/** Migración 274 · Debemos › Cuenta corriente con estaciones. */
describe('cuenta corriente con estaciones', () => {
  it('lee cargas sin factura, facturas sin pagar y total por proveedor y moneda', () => {
    const [x] = parsearCuentaEstaciones([
      {
        proveedor_id: 5, proveedor: 'Shell', estaciones: 'Shell Rodríguez Peña', moneda: 'ARS', cargas: 1, cargas_importe: '1304500.00',
        cargas_sin_importe: 0, litros: '500.00', desde: '2026-11-10', hasta: '2026-11-10', facturas: 1, facturas_saldo: '2000000.00',
        vencido: '2000000.00', total: '3304500.00',
      },
    ]);
    expect(x).toMatchObject({ proveedorId: 5, moneda: 'ARS', cargasImporte: 1304500, facturasSaldo: 2000000, total: 3304500, vencido: 2000000 });
    expect(parsearCuentaEstaciones(null)).toEqual([]);
  });
});
