import { describe, expect, it } from 'vitest';
import { parsearCuentasDinero, tarjetaDelProveedor } from '@/modules/finanzas/domain/finanzas.types';

const base = { nombre: 'X', tipo: 'caja', moneda: 'CLP', saldo_inicial: 0, saldo_inicial_fecha: '2026-11-18', saldo: 100, por_conciliar: 0 };

describe('tarjeta de flota prepaga (376)', () => {
  it('lee lo que queda en el proveedor', () => {
    const [c] = parsearCuentasDinero([{ ...base, id: 7, tarjeta: { proveedor_id: 44, proveedor: 'ENEX SA', sin_facturar: '30', disponible: '70' } }]);
    expect(c?.tarjeta).toEqual({ proveedorId: 44, proveedor: 'ENEX SA', sinFacturar: 30, disponible: 70 });
  });
  it('una cuenta común no tiene tarjeta', () => {
    expect(parsearCuentasDinero([{ ...base, id: 1 }])[0]?.tarjeta).toBeNull();
  });
  it('encuentra la tarjeta del proveedor', () => {
    const cuentas = parsearCuentasDinero([
      { ...base, id: 1 },
      { ...base, id: 7, tarjeta: { proveedor_id: 44, proveedor: 'ENEX SA', sin_facturar: 0, disponible: 100 } },
    ]);
    expect(tarjetaDelProveedor(cuentas, 44)?.id).toBe(7);
    expect(tarjetaDelProveedor(cuentas, 5)).toBeUndefined();
    expect(tarjetaDelProveedor(cuentas, null)).toBeUndefined();
  });
});
