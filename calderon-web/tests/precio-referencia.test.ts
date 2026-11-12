import { describe, expect, it } from 'vitest';
import { evaluarPrecio, parsearReferencia } from '@/modules/combustible/domain/precio-referencia';

const base = { resultado: 'sin_precio', pais: 'CL', pais_nombre: 'Chile', moneda_esperada: 'CLP', referencia: 1400, cargas_referencia: 7, pct_aviso: 20, factor_bloqueo: 2 };

describe('control de precio de la carga (migración 258)', () => {
  it('lee la referencia de la base', () => {
    expect(parsearReferencia(base)).toEqual({ moneda: 'CLP', pais: 'Chile', precio: 1400, cargas: 7, pctAviso: 20, factorBloqueo: 2 });
    expect(parsearReferencia({ resultado: 'no_aplica' })).toBeNull();
    expect(parsearReferencia(null)).toBeNull();
    expect(parsearReferencia({ resultado: 'sin_referencia', pais: 'AR', moneda_esperada: 'ARS', cargas_referencia: 1 })?.precio).toBeNull();
  });

  it('el total del ticket en el precio es imposible y propone el precio por litro', () => {
    const ref = parsearReferencia(base)!;
    expect(evaluarPrecio(ref, 95288, 60)).toEqual({ nivel: 'imposible', desvioPct: 6706.3, porLitro: 1588.13 });
    expect(evaluarPrecio(ref, 1.5, 100)?.nivel).toBe('imposible');
    expect(evaluarPrecio(ref, 1.5, 100)?.porLitro).toBeNull();
  });

  it('más de 20 % de diferencia es dudoso; dentro, normal', () => {
    const ref = parsearReferencia(base)!;
    expect(evaluarPrecio(ref, 1750, 300)?.nivel).toBe('dudoso');
    expect(evaluarPrecio(ref, 1060, 300)?.nivel).toBe('dudoso');
    expect(evaluarPrecio(ref, 1450, 300)?.nivel).toBe('normal');
    expect(evaluarPrecio(ref, null, 300)).toBeNull();
    expect(evaluarPrecio({ ...ref, precio: null }, 1450, 300)).toBeNull();
  });
});
