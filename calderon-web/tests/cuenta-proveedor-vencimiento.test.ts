import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsearCuentaProveedor } from '@/modules/finanzas/domain/orden-pago';

/**
 * Migración 370 · Por pagar › Cuenta corriente de proveedores: al abrir un proveedor, sus movimientos salen por
 * vencimiento, de lo más viejo a lo más nuevo. El orden y el saldo acumulado los manda la base.
 */
const mov = (id: number, vence: string | null, fecha: string, saldo: number, tipo = 'factura') => ({
  tipo, id, fecha, numero: `GA-ZZ${id}`, detalle: 'ZZ Leasing', debe: tipo === 'factura' ? 100 : 0, haber: tipo === 'factura' ? 0 : 100, saldo, vence, pendiente: tipo === 'factura' ? 100 : null,
});

describe('migración 370: la cuenta del proveedor por vencimiento', () => {
  const crudo = {
    proveedor_id: 9906, proveedor: 'ZZ Banco Cuatro', moneda: 'CLP', saldo: 200, a_cuenta: 0, orden: 'vencimiento',
    movimientos: [mov(2, '2026-07-15', '2026-07-01', 100), mov(9, null, '2026-07-20', 0, 'pago'), mov(1, '2026-08-15', '2026-08-01', 100), mov(7, '2027-01-10', '2026-05-10', 200)],
  };

  it('sabe que la base ya manda el orden por vencimiento', () => {
    expect(parsearCuentaProveedor(crudo).porVencimiento).toBe(true);
    expect(parsearCuentaProveedor({ ...crudo, orden: undefined }).porVencimiento).toBe(false);
    expect(parsearCuentaProveedor(null).porVencimiento).toBe(false);
  });

  it('no reordena: muestra los movimientos y el saldo acumulado como llegan', () => {
    const c = parsearCuentaProveedor(crudo);
    expect(c.movimientos.map((m) => m.id)).toEqual([2, 9, 1, 7]);
    expect(c.movimientos.map((m) => m.vence)).toEqual(['2026-07-15', null, '2026-08-15', '2027-01-10']);
    // La última fila trae el saldo del proveedor
    expect(c.movimientos.at(-1)!.saldo).toBe(c.saldo);
  });

  it('la pantalla tiene la columna «Vence» y no ordena por su cuenta', () => {
    const src = readFileSync('src/modules/finanzas/components/cuenta-proveedores.tsx', 'utf8');
    expect(src).toContain('<th className="py-1 pr-3 font-medium">Vence</th>');
    expect(src).toContain('Ordenado por vencimiento, de lo más viejo a lo más nuevo');
    expect(src).not.toContain('· vence {fecha(m.vence)}');
    expect(src).not.toContain('movimientos.sort(');
    expect(src).not.toContain('toSorted(');
  });
});
