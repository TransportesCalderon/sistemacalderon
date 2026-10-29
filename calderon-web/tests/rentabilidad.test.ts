import { describe, expect, it } from 'vitest';
import { pantallaDeRuta } from '@/modules/core/navigation/rutas';
import { can, permisosDe } from '@/modules/core/permissions/resolver';
import { esAgrupacion, parsearRentabilidad, VERSION_RENTABILIDAD } from '@/modules/finanzas/domain/rentabilidad';

describe('IA-1 · Rentabilidad (migración 119)', () => {
  it('lee lo que devuelve la base sin calcular nada', () => {
    const r = parsearRentabilidad({
      aviso: 'Margen de contribución. No incluye costos indirectos ni gastos generales.',
      moneda: 'CLP',
      desde: '2026-10-01',
      hasta: '2026-10-31',
      agrupar: 'chofer',
      filas: [
        { id: 2, nombre: 'ZZ Dos', viajes: 1, completos: 1, incompletos: 0, ingreso: '900000', costo: '100000', margen: '800000', margen_pct: '88.9', km: 1000, margen_km: '800', motivos: [] },
        { id: 1, nombre: 'ZZ Uno', viajes: 2, completos: 1, incompletos: 1, ingreso: 360000, costo: 40000, margen: 320000, margen_pct: 88.9, km: 400, margen_km: 800, motivos: ['La operación ZZ-2 no está facturada'] },
        { id: 3, nombre: 'ZZ Tres', viajes: 1, completos: 0, incompletos: 1, ingreso: null, costo: null, margen: null, margen_pct: null, km: null, margen_km: null, motivos: ['El viaje todavía está en curso'] },
      ],
      totales: { viajes: 4, completos: 2, incompletos: 2, ingreso: 1260000, costo: 140000, margen: 1120000 },
    });
    expect(r.aviso).toBe('Margen de contribución. No incluye costos indirectos ni gastos generales.');
    expect(r.filas[0]?.margen).toBe(800000);
    expect(r.filas[1]?.motivos).toEqual(['La operación ZZ-2 no está facturada']);
    expect(r.filas[2]?.margen).toBeNull();
    expect(r.totales.margen).toBe(1120000);
  });

  it('una respuesta vacía no rompe la pantalla', () => {
    const r = parsearRentabilidad(null);
    expect(r.filas).toEqual([]);
    expect(r.agrupar).toBe('chofer');
  });

  it('solo agrupa por chofer, camión o viaje', () => {
    expect(esAgrupacion('camion')).toBe(true);
    expect(esAgrupacion('cliente')).toBe(false);
    expect(VERSION_RENTABILIDAD).toBe(119);
  });

  it('la protege finanzas.rentabilidad: la ve Gerencia y no Comercial', () => {
    expect(pantallaDeRuta('/analisis/rentabilidad')).toBe('finanzas.rentabilidad');
    const ver = (rol: Parameters<typeof permisosDe>[0][number]) => can(permisosDe([rol], { gerenciaDetalleAlertas: 'agregado' }), 'finanzas.rentabilidad:ver');
    expect(ver('gerencia')).toBe(true);
    expect(ver('finanzas')).toBe(true);
    expect(ver('comercial')).toBe(false);
    expect(ver('chofer')).toBe(false);
  });
});
