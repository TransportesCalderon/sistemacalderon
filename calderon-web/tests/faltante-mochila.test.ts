import { describe, expect, it } from 'vitest';
import { parsearTanqueCierre, repartoFaltante } from '@/modules/combustible/domain/cierre-tanque.types';

describe('Migración 268 · el faltante para lleno con su parte de mochila', () => {
  it('dice cuánto faltó en la mochila y cuánto en los tanques', () => {
    expect(repartoFaltante(189, 169)).toBe('169 L en la mochila · 20 L en los tanques');
  });

  it('todo en la mochila o todo en los tanques', () => {
    expect(repartoFaltante(220, 220)).toBe('todo en la mochila');
    expect(repartoFaltante(20, 0)).toBe('todo en los tanques');
  });

  it('sin faltante o sin el dato no dice nada', () => {
    expect(repartoFaltante(0, 0)).toBeNull();
    expect(repartoFaltante(null, null)).toBeNull();
    expect(repartoFaltante(150, null)).toBeNull();
  });

  it('el balance del cierre trae la parte de mochila (y queda vacía con una base anterior)', () => {
    const con = parsearTanqueCierre({ disponible: true, faltante_salida_l: 100, faltante_salida_mochila_l: 100, faltante_llegada_l: 0, faltante_llegada_mochila_l: null });
    expect(con.faltanteSalidaMochilaL).toBe(100);
    expect(con.faltanteLlegadaMochilaL).toBeNull();
    const sin = parsearTanqueCierre({ disponible: true, faltante_salida_l: 100 });
    expect(sin.faltanteSalidaMochilaL).toBeNull();
  });
});
