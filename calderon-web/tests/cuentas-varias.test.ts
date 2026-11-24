import { describe, expect, it } from 'vitest';
import { cuentaTransferenciaChoferSchema, parsearCuentas } from '@/modules/chofer/domain/cuenta-transferencia';

describe('migración 303: varias cuentas por chofer', () => {
  it('lee id y principal de cada cuenta', () => {
    const c = parsearCuentas([
      { id: 7, moneda: 'ARS', banco: 'Global66', numero: '0000003100099999999999', titular: 'Juan Perez', principal: true },
      { id: 8, moneda: 'ARS', banco: 'Mercado Pago', numero: 'juan.perez.mp', titular: 'Juan Perez', principal: false },
    ]);
    expect(c.map((x) => [x.id, x.principal])).toEqual([
      [7, true],
      [8, false],
    ]);
  });
  it('las cuentas viejas (sin id) siguen leyéndose como principales', () => {
    const [c] = parsearCuentas([{ moneda: 'CLP', banco: 'Banco Estado', numero: '123456', titular: 'Juan Perez' }]);
    expect(c?.id).toBeNull();
    expect(c?.principal).toBe(true);
  });
  it('el esquema acepta id, nueva y principal', () => {
    const r = cuentaTransferenciaChoferSchema.safeParse({
      choferId: 3, moneda: 'ARS', banco: 'Mercado Pago', tipoCuenta: '', numero: 'x.y.z', titular: 'Juan', titularDocumento: '', nueva: true, principal: false,
    });
    expect(r.success).toBe(true);
  });
});
