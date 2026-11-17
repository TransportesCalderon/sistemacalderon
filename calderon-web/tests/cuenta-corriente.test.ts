import { describe, expect, it } from 'vitest';
import { cuentaACsv, parsearCuentaCorriente, parsearSaldosClientes } from '@/modules/ventas/domain/cuenta-corriente';

describe('Cuenta corriente de clientes', () => {
  it('lee los saldos y la cuenta de un cliente', () => {
    const s = parsearSaldosClientes({ clientes: [{ cliente_id: 35, cliente: 'ZZ SA', moneda: 'USD', facturado: '7500.00', cobrado: 5000, saldo: 2500, vencido: 2500, facturas_abiertas: 1, ultimo_cobro: '2026-11-15' }] });
    expect(s[0]?.saldo).toBe(2500);
    expect(s[0]?.venceLaMasVieja).toBeNull();
    expect(parsearSaldosClientes(null)).toEqual([]);

    const c = parsearCuentaCorriente({
      cliente: { id: 35, nombre: 'ZZ SA', razon_social: 'ZZ SA', plazo_dias: 30 },
      desde: '2026-10-01',
      hasta: '2026-11-17',
      monedas: [
        {
          moneda: 'USD',
          saldo_anterior: 100,
          facturado: 2500,
          cobrado: 2500,
          saldo: 100,
          saldo_hoy: 100,
          vencido_1_30: 100,
          movimientos: [
            { fecha: '2026-10-04', tipo: 'factura', factura_id: 3, documento: 'Factura 33', vence: '2026-11-03', debe: 2500, haber: 0, saldo: 2600 },
            { fecha: '2026-11-15', tipo: 'cobro', factura_id: 3, documento: 'Cobro', detalle: 'Cobro de "33"', debe: 0, haber: 2500, saldo: 100 },
          ],
        },
      ],
    });
    expect(c.monedas[0]?.movimientos[1]?.tipo).toBe('cobro');
    expect(c.monedas[0]?.vencido30).toBe(100);
    const csv = cuentaACsv(c).split('\r\n');
    expect(csv.length).toBe(4);
    expect(csv[1]).toBe('USD;2026-10-01;"Saldo anterior";;;;;100,00');
    expect(csv[3]).toBe('USD;2026-11-15;"Cobro";"Cobro de ""33""";;0,00;2500,00;100,00');
  });
});
