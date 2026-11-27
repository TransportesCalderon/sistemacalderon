import { describe, expect, it } from 'vitest';
import {
  anularTransferenciaSchema,
  cambioQueSale,
  montoEscrito,
  montosDe,
  parsearCuentasHoy,
  parsearTransferenciaHecha,
  pasarPlataSchema,
  pesosPor,
  totalEnPesos,
} from '@/modules/finanzas/domain/pasar-plata';

// Migración 388 · Las cuentas en «Hoy» y transferir entre cuentas (también dólares a pesos)

/** Lo que devuelve fin.fn_cuentas_hoy, con los nombres de la base. */
const crudo = {
  hoy: '2026-11-27',
  puede: true,
  desvio_max_pct: 30,
  cambios: { USD: 1002.07, BRL: null },
  cuentas: [
    { id: 4, nombre: 'ZZ Dólares A', tipo: 'banco', moneda: 'USD', saldo: 20775, saldo_clp: 20818004, cartola_fecha: '2026-11-26', tarjeta: false },
    { id: 9, nombre: 'ZZ Pesos A', tipo: 'banco', moneda: 'CLP', saldo: 59786, saldo_clp: 59786, cartola_fecha: '2026-11-26', tarjeta: false },
    { id: 11, nombre: 'ZZ Caja', tipo: 'caja', moneda: 'CLP', saldo: -1500, saldo_clp: -1500, cartola_fecha: null, tarjeta: false },
    { id: 12, nombre: 'ZZ Tarjeta', tipo: 'caja', moneda: 'CLP', saldo: 800000, saldo_clp: 800000, tarjeta: true },
    { id: 13, nombre: 'ZZ Reales', tipo: 'caja', moneda: 'BRL', saldo: 100, saldo_clp: null },
  ],
  ultimas: [
    {
      id: 1887, numero: 'MV-001887', fecha: '2026-11-27', desde: 'ZZ Dólares A', desde_moneda: 'USD', salio: 1000,
      hacia: 'ZZ Pesos A', hacia_moneda: 'CLP', llego: 990000, descripcion: 'Cambio USD 1.000,00 → CLP 990.000', conciliado: false, puede_anular: true,
    },
    {
      id: 958, numero: 'MV-000958', fecha: '2026-11-18', desde: 'ZZ Pesos A', desde_moneda: 'CLP', salio: 3000000,
      hacia: 'ZZ Caja', hacia_moneda: 'CLP', llego: 3000000, descripcion: null, conciliado: true, puede_anular: false,
    },
  ],
};

describe('las cuentas de «Hoy»', () => {
  const d = parsearCuentasHoy(crudo);

  it('cada cuenta queda en su moneda, con su equivalente en pesos', () => {
    expect(d.hoy).toBe('2026-11-27');
    expect(d.puede).toBe(true);
    expect(d.cuentas).toHaveLength(5);
    expect(d.cuentas[0]).toEqual({ id: 4, nombre: 'ZZ Dólares A', tipo: 'banco', moneda: 'USD', saldo: 20775, saldoClp: 20818004, cartolaFecha: '2026-11-26', tarjeta: false });
    expect(d.cuentas[2]?.tipo).toBe('caja');
    expect(d.cuentas[2]?.cartolaFecha).toBeNull();
    expect(d.cuentas[3]?.tarjeta).toBe(true);
    expect(d.cuentas[4]?.saldoClp).toBeNull();
  });

  it('del cambio del día quedan solo las monedas que lo tienen cargado', () => {
    expect(d.cambios).toEqual({ USD: 1002.07 });
    expect(pesosPor('CLP', d.cambios)).toBe(1);
    expect(pesosPor('USD', d.cambios)).toBe(1002.07);
    expect(pesosPor('BRL', d.cambios)).toBeNull();
  });

  it('las últimas transferencias', () => {
    expect(d.ultimas).toHaveLength(2);
    expect(d.ultimas[0]).toMatchObject({ id: 1887, numero: 'MV-001887', salio: 1000, llego: 990000, desdeMoneda: 'USD', haciaMoneda: 'CLP', conciliada: false, puedeAnular: true });
    expect(d.ultimas[1]).toMatchObject({ descripcion: null, conciliada: true, puedeAnular: false });
    expect(montosDe(d.ultimas[0]!)).toBe('US$ 1.000,00 → $ 990.000');
    expect(montosDe(d.ultimas[1]!)).toBe('$ 3.000.000');
  });

  it('el total en pesos no suma lo que no tiene cambio y dice qué moneda falta', () => {
    expect(totalEnPesos(d.cuentas)).toEqual({ total: 20818004 + 59786 - 1500 + 800000, sinCambio: ['BRL'] });
  });

  it('con datos vacíos o rotos no se cae', () => {
    const v = parsearCuentasHoy(null);
    expect(v).toEqual({ hoy: '', puede: false, cuentas: [], cambios: {}, desvioMaxPct: 30, ultimas: [] });
    expect(parsearCuentasHoy({ puede: 'sí', cuentas: 'x', cambios: [1], ultimas: {} }).puede).toBe(false);
  });
});

describe('lo que contesta la base al transferir', () => {
  it('trae el número, el resumen y los avisos', () => {
    const h = parsearTransferenciaHecha({ id: 1887, numero: 'MV-001887', resumen: 'USD 1.000,00 de A → CLP 990.000 en B', avisos: ['Según el sistema, A queda en USD -999,50'] });
    expect(h).toEqual({ id: 1887, numero: 'MV-001887', resumen: 'USD 1.000,00 de A → CLP 990.000 en B', avisos: ['Según el sistema, A queda en USD -999,50'] });
    expect(parsearTransferenciaHecha({})).toEqual({ id: null, numero: null, resumen: '', avisos: [] });
  });
});

describe('el cambio que sale de los montos', () => {
  const cambios = { USD: 1000 };
  const usd = { moneda: 'USD' };
  const clp = { moneda: 'CLP' };

  it('lee los montos como se escriben acá', () => {
    expect(montoEscrito('1.000,50')).toBe(1000.5);
    expect(montoEscrito('990.000')).toBe(990000);
    expect(montoEscrito('2000000')).toBe(2000000);
    expect(montoEscrito('')).toBeNull();
    expect(montoEscrito('0')).toBeNull();
    expect(montoEscrito('mil')).toBeNull();
  });

  it('de dólares a pesos se dice «1 USD = … CLP» y se compara con el del día', () => {
    const c = cambioQueSale(usd, clp, 1000, 990000, cambios);
    expect(c?.texto).toBe('1 USD = 990,00 CLP');
    expect(c?.delDia).toBe('1 USD = 1.000,00 CLP');
    expect(c?.desvioPct).toBeCloseTo(-1, 6);
  });

  it('de pesos a dólares se dice igual (adelante va la moneda que vale más)', () => {
    const c = cambioQueSale(clp, usd, 1010000, 1000, cambios);
    expect(c?.texto).toBe('1 USD = 1.010,00 CLP');
    expect(c?.desvioPct).toBeCloseTo(1, 6);
  });

  it('los montos al revés dan un cambio muy lejos del día', () => {
    const c = cambioQueSale(usd, clp, 990000, 1000, cambios);
    expect(Math.abs(c?.desvioPct ?? 0)).toBeGreaterThan(30);
  });

  it('sin el cambio del día muestra solo el que sale de los montos', () => {
    const c = cambioQueSale({ moneda: 'BRL' }, clp, 100, 17000, cambios);
    expect(c).toEqual({ texto: '1 BRL = 170,00 CLP', delDia: null, desvioPct: null });
  });

  it('con la misma moneda o sin los dos montos no hay cambio que mostrar', () => {
    expect(cambioQueSale(clp, clp, 1000, 1000, cambios)).toBeNull();
    expect(cambioQueSale(usd, clp, 1000, null, cambios)).toBeNull();
    expect(cambioQueSale(usd, clp, null, 990000, cambios)).toBeNull();
    expect(cambioQueSale(usd, clp, 0, 990000, cambios)).toBeNull();
  });

  it('un cambio chico se muestra con cuatro decimales', () => {
    const c = cambioQueSale(clp, { moneda: 'ARS' }, 100000, 163000, { ARS: 0.61 });
    expect(c?.texto).toBe('1 CLP = 1,6300 ARS');
    expect(c?.delDia).toBe('1 CLP = 1,6393 ARS');
  });
});

describe('los formularios', () => {
  const base = { desdeId: 4, haciaId: 9, fecha: '2026-11-27', salio: '1.000', llego: '990.000', descripcion: '  venta de dólares ' };

  it('acepta los montos escritos con puntos y comas', () => {
    const r = pasarPlataSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ desdeId: 4, haciaId: 9, fecha: '2026-11-27', salio: 1000, llego: 990000, descripcion: 'venta de dólares' });
  });

  it('sin «llegó» y sin descripción también vale (misma moneda)', () => {
    const r = pasarPlataSchema.safeParse({ ...base, llego: null, descripcion: '' });
    expect(r.success).toBe(true);
    expect(r.data?.llego).toBeNull();
    expect(r.data?.descripcion).toBeNull();
  });

  it('pide las dos cuentas, la fecha y lo que salió', () => {
    const r = pasarPlataSchema.safeParse({ ...base, desdeId: 0, haciaId: 0, fecha: '', salio: '' });
    expect(r.success).toBe(false);
    const campos = new Set(r.error?.issues.map((i) => i.path.join('.')));
    expect(campos).toEqual(new Set(['desdeId', 'haciaId', 'fecha', 'salio']));
  });

  it('para anular pide el motivo', () => {
    expect(anularTransferenciaSchema.safeParse({ id: 1887, motivo: '  ' }).success).toBe(false);
    expect(anularTransferenciaSchema.safeParse({ id: 1887, motivo: 'me equivoqué de cuenta' }).success).toBe(true);
  });
});
