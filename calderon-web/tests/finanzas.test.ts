import { describe, expect, it } from 'vitest';
import { can, permisosDe } from '@/modules/core/permissions/resolver';
import { buscarTitulos, filasParaImportar, leerCsv, mapeoCompleto, textoCelda } from '@/modules/finanzas/domain/cartola';
import { gastoSchema, movimientoSchema } from '@/modules/finanzas/domain/finanzas.schemas';
import { aCsv, cuentasParaGasto, dinero, dineroCorto, mesCorto, parsearPlan, parsearTablero } from '@/modules/finanzas/domain/finanzas.types';

const agregado = { gerenciaDetalleAlertas: 'agregado' as const };

describe('finanzas (migración 73)', () => {
  it('muestra la plata como en Chile', () => {
    expect(dinero(1234567)).toBe('$ 1.234.567');
    expect(dinero(-5000)).toBe('−$ 5.000');
    expect(dinero(1500.5, 'USD')).toBe('US$ 1.500,50');
    expect(dineroCorto(1_250_000)).toBe('$ 1,3 M');
    expect(dineroCorto(850_000)).toBe('$ 850 mil');
    expect(mesCorto('2026-10-01')).toBe('oct 26');
  });

  it('cartola: encuentra la fila de títulos y las columnas aunque haya encabezados arriba', () => {
    const filas = [
      ['Banco de Chile', null, null],
      ['Cartola de la cuenta 123', null, null],
      ['Fecha', 'Descripción', 'N° Documento', 'Cargos (CLP)', 'Abonos (CLP)', 'Saldo (CLP)'],
      [new Date(Date.UTC(2026, 9, 20)), 'TRANSF A PROVEEDOR', '001', 50000, null, 950000],
      ['21/10/2026', 'DEPOSITO', '', '', '1.200.000', '2.150.000'],
      [null, 'Total', null, 50000, 1200000, null],
    ];
    const t = buscarTitulos(filas);
    expect(t?.fila).toBe(2);
    expect(t?.mapeo).toEqual({ fecha: 0, descripcion: 1, documento: 2, cargo: 3, abono: 4, saldo: 5 });
    expect(mapeoCompleto(t!.mapeo)).toBe(true);
    const f = filasParaImportar(filas, 3, t!.mapeo);
    expect(f[0]).toEqual({ fecha: '2026-10-20', descripcion: 'TRANSF A PROVEEDOR', documento: '001', cargo: '50000', abono: '', monto: '', saldo: '950000' });
    expect(f[1]?.abono).toBe('1.200.000');
    // La fila de totales (sin fecha) igual se manda: la base la descarta o la informa
    expect(f).toHaveLength(3);
    expect(textoCelda(1234.5)).toBe('1234.50');
  });

  it('cartola en CSV con punto y coma y comillas', () => {
    expect(leerCsv('﻿Fecha;Detalle;Monto\r\n20/10/2026;"PAGO ""LUZ""; oficina";-12.345\r\n')).toEqual([
      ['Fecha', 'Detalle', 'Monto'],
      ['20/10/2026', 'PAGO "LUZ"; oficina', '-12.345'],
    ]);
    expect(leerCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('para un gasto solo ofrece cuentas que la base acepta', () => {
    const plan = parsearPlan([
      { id: 1, codigo: '1.1.03', nombre: 'Clientes', tipo: 'activo', imputable: true, uso: 'CXC' },
      { id: 2, codigo: '1.1.01.01', nombre: 'Banco', tipo: 'activo', imputable: true, banco: true },
      { id: 3, codigo: '6.1.03', nombre: 'Arriendos', tipo: 'gasto', imputable: true },
      { id: 4, codigo: '6', nombre: 'Gastos', tipo: 'gasto', imputable: false },
      { id: 5, codigo: '4.1.01', nombre: 'Fletes', tipo: 'ingreso', imputable: true, uso: 'VENTAS' },
    ]);
    expect(cuentasParaGasto(plan).map((c) => c.id)).toEqual([3]);
  });

  it('formularios: la categoría es obligatoria y los montos aceptan «1.234.567»', () => {
    const base = { id: null, version: null, fecha: '2026-10-20', vence: '', proveedorId: null, proveedorNombre: '', tipoDocumento: 'boleta', numeroDocumento: '', descripcion: 'Agua', camionId: null, moneda: 'CLP', neto: '', exento: '', total: '12.500' };
    expect(gastoSchema.safeParse({ ...base, cuentaId: 0 }).success).toBe(false);
    const ok = gastoSchema.parse({ ...base, cuentaId: 3 });
    expect(ok.total).toBe(12500);
    expect(ok.vence).toBeNull();
    expect(movimientoSchema.safeParse({ tipo: 'pago', fecha: '2026-10-20', cuentaDineroId: 0, monto: '1', facturaId: null, gastoId: 1, cuentaId: null, destinoId: null, montoDestino: null, montoDocumento: null, descripcion: null }).success).toBe(false);
  });

  it('tablero y CSV para Excel', () => {
    const t = parsearTablero({ disponible_clp: '1500000', meses: ['2026-10-01'], ingresos: [1], costos: ['2'], gastos: [3], resultado: [-4], bancos: [{ nombre: 'B', moneda: 'CLP', saldo: 5 }] });
    expect(t.disponibleClp).toBe(1500000);
    expect(t.costos).toEqual([2]);
    expect(t.bancos[0]?.saldoClp).toBeNull();
    expect(aCsv([['a;b', 1.5, null]])).toBe('﻿"a;b";1,5;');
  });

  it('permisos: Finanzas y TI cargan; Gerencia y Auditoría ven; los demás no', () => {
    const fin = permisosDe(['finanzas'], agregado);
    const ger = permisosDe(['gerencia'], agregado);
    const ope = permisosDe(['operaciones'], agregado);
    const ven = permisosDe(['comercial'], agregado);
    expect(can(fin, 'finanzas.gastos:editar')).toBe(true);
    expect(can(fin, 'finanzas.bancos:editar')).toBe(true);
    expect(can(ger, 'finanzas.resumen:ver')).toBe(true);
    expect(can(ger, 'finanzas.gastos:editar')).toBe(false);
    expect(can(ope, 'finanzas.resumen:ver')).toBe(false);
    expect(can(ven, 'finanzas.informes:ver')).toBe(false);
  });
});
