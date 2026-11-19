import { describe, expect, it } from 'vitest';
import { parsearPedidoCompra, parsearPedidosCompra, textoEntrega, textoPago, textoPesos } from '@/modules/finanzas/domain/compras';
import { PESTANAS_GASTOS } from '@/shared/ui/pestanas-secciones';

/** Migración 280 · Compras: pedido, cotizaciones, recomendación de Iris y orden de compra. */
describe('Compras y cotizaciones', () => {
  it('lee la lista de pedidos', () => {
    const l = parsearPedidosCompra([
      { id: 1, numero: 'PC-000001', fecha: '2026-11-19', descripcion: 'Pastillas', urgente: true, camion: null, estado: 'aprobado', cotizaciones: 3, orden: 'OCP-000001', proveedor_elegido: 'ZZ Frenos', moneda: 'CLP', total: 1250000 },
    ]);
    expect(l[0]?.estado).toBe('aprobado');
    expect(l[0]?.total).toBe(1250000);
    expect(parsearPedidosCompra(null)).toEqual([]);
  });

  it('lee el pedido con la comparación de Iris', () => {
    const p = parsearPedidoCompra({
      id: 1,
      numero: 'PC-000001',
      estado: 'para_aprobar',
      cotizaciones: [{ id: 3, proveedor_id: 9, proveedor: 'ZZ Frenos', moneda: 'CLP', total: 1250000, flete: 0, entrega_inmediata: true, entrega_dias: 0, pago_dias: 30, estado: 'vigente' }],
      comparacion: {
        pesos: { precio: 0.5, entrega: 0.2, pago: 0.15, historial: 0.15 },
        cotizaciones: [{ id: 3, proveedor: 'ZZ Frenos', total_clp: 1250000, comparable: true, puntaje: 87, puntajes: { precio: 89, entrega: 100, pago: 100, historial: 50 }, compras_anteriores: 0, recomendada: true }],
        recomendada_id: 3,
        explicacion: 'Iris recomienda ZZ Frenos',
        advertencias: ['Hay una sola cotización para comparar: conviene pedir otra'],
      },
      orden: null,
      puedo_resolver: true,
    });
    expect(p.comparacion.recomendadaId).toBe(3);
    expect(p.comparacion.cotizaciones[0]?.puntajes?.entrega).toBe(100);
    expect(p.comparacion.advertencias).toHaveLength(1);
    expect(p.cotizaciones[0]?.anulada).toBe(false);
    expect(p.puedoResolver).toBe(true);
    expect(p.puedoEditar).toBe(false);
  });

  it('textos de entrega, pago y pesos', () => {
    expect(textoEntrega(true, null)).toBe('Entrega inmediata');
    expect(textoEntrega(false, 1)).toBe('Entrega en 1 día');
    expect(textoEntrega(false, 10)).toBe('Entrega en 10 días');
    expect(textoPago(0)).toBe('Al contado');
    expect(textoPago(30)).toBe('A 30 días');
    expect(textoPesos({ precio: 0.5, entrega: 0.2, pago: 0.15, historial: 0.15 })).toBe('Precio 50 % · Entrega 20 % · Días para pagar 15 % · Historial 15 %');
  });

  it('Compras es una pestaña de Gastos', () => {
    expect(PESTANAS_GASTOS.some((p) => p.href === '/analisis/gastos?vista=compras' && p.etiqueta === 'Compras')).toBe(true);
  });
});
