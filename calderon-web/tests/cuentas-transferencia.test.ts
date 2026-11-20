import { describe, expect, it } from 'vitest';
import { parsearCuentas } from '@/modules/chofer/domain/cuenta-transferencia';

describe('cuentas del chofer para transferir (migración 288)', () => {
  it('lee una por moneda y descarta las incompletas', () => {
    const c = parsearCuentas([
      { moneda: 'ARS', banco: 'Banco ZZ', numero: 'alias.zz', titular: 'Titular ZZ', tipo_cuenta: null },
      { moneda: 'CLP', banco: 'Banco Estado', numero: '', titular: 'Titular ZZ' },
    ]);
    expect(c).toEqual([{ moneda: 'ARS', banco: 'Banco ZZ', tipoCuenta: null, numero: 'alias.zz', titular: 'Titular ZZ', titularDocumento: null }]);
    expect(parsearCuentas(null)).toEqual([]);
  });
});
