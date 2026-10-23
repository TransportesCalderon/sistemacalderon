import { describe, expect, it } from 'vitest';
import { cotizacionSchema, numeroOpc, tarifaSchema } from '@/modules/ventas/domain/ventas.schemas';
import { parsearCotizacion, parsearTablero, usd } from '@/modules/ventas/domain/ventas.types';
import { can, permisosDe } from '@/modules/core/permissions/resolver';

const agregado = { gerenciaDetalleAlertas: 'agregado' as const };

describe('ventas (migración 67)', () => {
  it('lee la cotización con su costo y margen tal como los calcula la base', () => {
    const c = parsearCotizacion({
      id: 1, numero: 'CT-000001', empresa_id: 3, empresa: 'PRUEBA SA', estado: 'enviada', total_usd: '3836', costo_usd: 2800, margen_usd: 1036, margen_pct: 37,
      renglones: [{ id: 9, tipo: 'flete', linea_id: 2, unidad: 'viaje', cantidad: 2, precio_usd: 1800, importe_usd: 3600, costo_usd: 2800, vuelta_vacia: true }],
    });
    expect(c?.totalUsd).toBe(3836);
    expect(c?.margenPct).toBe(37);
    expect(c?.renglones[0]?.vueltaVacia).toBe(true);
    expect(parsearTablero({ cotizaciones_mes: { hechas: 4, aceptadas: 1 } }).cotizacionesMes.hechas).toBe(4);
    expect(usd(1836)).toBe('USD 1.836');
  });

  it('números: «1.800» es mil ochocientos y «1.800,50» lleva decimales', () => {
    expect(numeroOpc.parse('1.800')).toBe(1800);
    expect(numeroOpc.parse('1.800,50')).toBe(1800.5);
    expect(numeroOpc.parse('1.25')).toBe(1.25);
    expect(tarifaSchema.safeParse({ lineaId: 1, clienteId: null, unidad: 'viaje', precioUsd: '', desde: '2026-10-01' }).success).toBe(false);
    expect(cotizacionSchema.safeParse({ id: null, version: null, empresaId: 1, contactoId: null, oportunidadId: null, fecha: null, validezDias: null, renglones: [] }).success).toBe(false);
  });

  it('permisos: Ventas cotiza; Finanzas factura; Operaciones no ve ventas', () => {
    const ven = permisosDe(['comercial'], agregado);
    expect(can(ven, 'ventas.cotizaciones:transicionar')).toBe(true);
    expect(can(ven, 'ventas.facturacion:editar')).toBe(false);
    expect(can(permisosDe(['finanzas'], agregado), 'ventas.facturacion:transicionar')).toBe(true);
    expect(can(permisosDe(['operaciones'], agregado), 'ventas.tablero:ver')).toBe(false);
    expect(can(permisosDe(['gerencia'], agregado), 'ventas.tablero:ver')).toBe(true);
  });
});
