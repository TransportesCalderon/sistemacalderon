import { describe, expect, it } from 'vitest';
import { parsearGastosPorRevisar } from '@/modules/chofer/domain/chofer.types';

describe('migración 296: moneda según RUT o CUIT', () => {
  it('lee la moneda sugerida y habilita el cambio solo si la base la manda', () => {
    const a = parsearGastosPorRevisar([{ id: 1, moneda: 'ARS', importe: 5500, emisor_fiscal: '61.202.000-0', moneda_sugerida: 'CLP' }])[0]!;
    expect(a.monedaSugerida).toBe('CLP');
    expect(a.emisorFiscal).toBe('61.202.000-0');
    expect(a.puedeCambiarMoneda).toBe(true);
    const b = parsearGastosPorRevisar([{ id: 2, moneda: 'ARS', importe: 10 }])[0]!;
    expect(b.puedeCambiarMoneda).toBe(false);
    expect(b.monedaSugerida).toBeNull();
  });
});
