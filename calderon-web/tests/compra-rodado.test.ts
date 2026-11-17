import { describe, expect, it } from 'vitest';
import { aNumero, cuentaCompra, parsearComprasRodados } from '@/modules/finanzas/domain/compra-rodado';

const base = { valorNeto: 80_000_000, iva: 15_200_000, pie: 10_000_000, documentos: 36, montoDocumento: 2_600_000, vidaUtilMeses: 84, valorResidual: 8_000_000 };

describe('Finanzas › Compra de vehículos: la cuenta antes de guardar', () => {
  it('separa lo financiado, el interés y la depreciación del mes', () => {
    const c = cuentaCompra(base);
    expect(c.financiado).toBe(85_200_000);
    expect(c.totalDocumentos).toBe(93_600_000);
    expect(c.interes).toBe(8_400_000);
    expect(c.depreciacionMes).toBe(857_143);
    expect(c.aviso).toBeNull();
  });
  it('avisa si los documentos no alcanzan o si falta el pie', () => {
    expect(cuentaCompra({ ...base, montoDocumento: 1_000_000 }).aviso).toMatch(/suman menos/);
    expect(cuentaCompra({ ...base, documentos: 0 }).aviso).toMatch(/Sin documentos/);
    expect(cuentaCompra({ ...base, pie: 200_000_000 }).aviso).toMatch(/pie es más/);
    expect(cuentaCompra({ ...base, valorResidual: 80_000_000 }).aviso).toMatch(/residual/);
  });
  it('al contado (sin documentos) no hay interés', () => {
    const c = cuentaCompra({ ...base, pie: 95_200_000, documentos: 0, montoDocumento: 0 });
    expect(c.aviso).toBeNull();
    expect(c.interes).toBe(0);
  });
  it('lee montos escritos con puntos', () => {
    expect(aNumero('80.000.000')).toBe(80_000_000);
    expect(aNumero(' 1234567,5 ')).toBe(1234567.5);
    expect(aNumero('')).toBe(0);
  });
  it('lee lo que devuelve la base', () => {
    const r = parsearComprasRodados({
      tractores: [{ id: 1, patente: 'ZZAA11' }],
      semis: [],
      compras: [{ id: 2, tipo: 'semi', patente: 'ZZS001', fecha: '2024-03-15', valor_neto: 30000000, documentos: 36, documentos_pagados: 28, falta_pagar: 6400000, valor_libro: 22000000, gasto_fijo_id: 9 }],
    });
    expect(r.tractores).toHaveLength(1);
    expect(r.compras[0]).toMatchObject({ tipo: 'semi', patente: 'ZZS001', documentosPagados: 28, faltaPagar: 6_400_000, valorLibro: 22_000_000, gastoFijoId: 9 });
    expect(parsearComprasRodados({ compras: [{ id: 5, tipo: 'otro', patente: 'Camioneta ZZ Hilux' }] }).compras[0]).toMatchObject({ tipo: 'otro', patente: 'Camioneta ZZ Hilux' });
    expect(parsearComprasRodados(null).compras).toEqual([]);
  });
});
