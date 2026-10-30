import { describe, expect, it } from 'vitest';
import { glosaSiiSchema, parsearVistaPrevia } from '@/modules/ventas/domain/sii';

describe('Vista previa de la factura electrónica (migración 138)', () => {
  it('lee lo que arma la base', () => {
    const v = parsearVistaPrevia({
      ambiente: 'prueba',
      tipo: 34,
      tipo_nombre: 'Factura exenta electrónica',
      fecha: '2026-10-30',
      vence: '2026-11-29',
      moneda: 'CLP',
      tc_clp: '950.5',
      emisor: { rut: 'ZZ', razon_social: 'ZZ EMISOR' },
      receptor: { razon_social: 'ZZ CLIENTE', comuna: null },
      items: [{ n: 1, nombre: 'SERVICIO', descripcion: 'Op 1 · Valor flete U$D 1.600,00', cantidad: 1, precio: 1520800, monto: 1520800, importe_usd: 1600 }],
      total: 1520800,
      total_usd: 1600,
      glosa: 'El pago… U$D 1.600,00',
      glosa_automatica: true,
      glosa_lugar: 'renglon',
      faltantes: [],
    });
    expect(v.tipo).toBe(34);
    expect(v.tcClp).toBe(950.5);
    expect(v.receptor.comuna).toBe('');
    expect(v.items[0]?.importeUsd).toBe(1600);
    expect(v.glosaAutomatica).toBe(true);
    expect(v.glosaEnRenglon).toBe(true);
  });
  it('sin datos no se rompe', () => {
    const v = parsearVistaPrevia(null);
    expect(v.items).toEqual([]);
    expect(v.moneda).toBe('CLP');
    expect(v.glosa).toBeNull();
    expect(v.glosaEnRenglon).toBe(false);
  });
  it('la leyenda puede quedar automática (null)', () => {
    expect(glosaSiiSchema.safeParse({ id: 1, glosa: null }).success).toBe(true);
  });
});
