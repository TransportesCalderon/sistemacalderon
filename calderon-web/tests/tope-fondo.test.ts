import { describe, expect, it } from 'vitest';
import { parsearAnalisisDePedidos, parsearAnalisisTope, porcentajeBarra } from '@/modules/chofer/domain/tope-fondo';

/** Migración 386 · El análisis del tope de los pedidos de dinero del chofer (la base hace la cuenta). */
const BASE = {
  estado: 'cerca', texto: 'Está llegando al límite de su liquidación…', texto_chofer: 'Ojo: estás llegando al límite…',
  generado: 230000, en_mano: 184000, fijo_generado: 60000, bono: 160000, adicional_km: 10000, descuento_pct: 20, aviso_pct: 80,
  sin_rendir_clp: '20000', pedidos_abiertos_clp: 120000, pide: { moneda: 'CLP', importe: 20000, clp: 20000 }, comprometido_clp: 160000,
  usado_pct: 87, puede_pedir_hasta_clp: 44000, dias: 30, dias_pasados: 2, monedas_sin_cambio: null,
};

describe('tope de los pedidos de dinero', () => {
  it('lee el análisis que devuelve la base', () => {
    const a = parsearAnalisisTope(BASE)!;
    expect(a).toMatchObject({ estado: 'cerca', enMano: 184000, sinRendirClp: 20000, pideClp: 20000, usadoPct: 87, puedePedirHastaClp: 44000, pedidoPor: null });
    expect(a.textoChofer).toBe('Ojo: estás llegando al límite…');
    expect(a.monedasSinCambio).toEqual([]);
    expect(porcentajeBarra(a)).toBe(87);
  });
  it('sin pedido ni porcentaje, la barra sale de lo comprometido y no pasa de 100', () => {
    const a = parsearAnalisisTope({ ...BASE, estado: 'pasado', pide: null, usado_pct: null, comprometido_clp: 500000, monedas_sin_cambio: ['EUR'] })!;
    expect(a.pideClp).toBe(0);
    expect(porcentajeBarra(a)).toBe(100);
    expect(a.monedasSinCambio).toEqual(['EUR']);
    expect(porcentajeBarra({ ...a, usadoPct: 140 })).toBe(100);
  });
  it('lo que no es un análisis queda afuera (control apagado = null)', () => {
    expect(parsearAnalisisTope(null)).toBeNull();
    expect(parsearAnalisisTope({ estado: 'raro' })).toBeNull();
    expect(parsearAnalisisTope([])).toBeNull();
  });
  it('lee el análisis guardado de cada pedido, con quién lo pidió', () => {
    const r = parsearAnalisisDePedidos({ '12': { ...BASE, estado: 'pasado', pedido_por: 'oficina' }, '13': { estado: 'x' }, abc: BASE });
    expect(Object.keys(r)).toEqual(['12']);
    expect(r[12]).toMatchObject({ estado: 'pasado', pedidoPor: 'oficina' });
    expect(parsearAnalisisDePedidos([])).toEqual({});
  });
});
