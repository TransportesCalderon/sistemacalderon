import { describe, expect, it } from 'vitest';
import { cotizarGuardarSchema, margenDe, parsearBaseCosto, parsearCotizador } from '@/modules/ventas/domain/cotizador';

describe('migración 305: cotizador simple', () => {
  it('lee el resultado de la base', () => {
    const r = parsearCotizador({
      origen: 'MENDOZA', destino: 'BUENOS AIRES', regreso: 'MENDOZA', rutas: [{ id: 3, codigo: 'MZA-BSAS', km: 1085 }], linea_id: 3, ruta: 'MZA-BSAS',
      km_cargado: 1085, fuente_km: 'ruta', km_vacio: 821, km_total: 1906, costo_km_usd: 0.7604, fuente_costo: 'contable',
      costo_usd: 1449.32, margen_pct: 20, precio_usd: 1740, precio_km_usd: 0.913, precio_km_cargado_usd: 1.604, falta: null,
    });
    expect(r.rutas).toHaveLength(1);
    expect(r.fuenteKm).toBe('ruta');
    expect(r.precioUsd).toBe(1740);
    expect(r.kmVacio).toBe(821);
  });
  it('lee la base del costo por km', () => {
    const b = parsearBaseCosto({ costo_km_usd: 0.76, meses_pedidos: 3, hasta_hoy: false, combustible_de_cargas: true, cuentas_fuera: ['6.1.13'],
      meses: [{ mes: '2026-10-01', hasta: '2026-10-31', costo_usd: 115000, km: 152021, camiones: 19, usado: true }], cuentas: [], camiones_sin_km: ['SXXV17'] });
    expect(b.meses[0]?.usado).toBe(true);
    expect(b.camionesSinKm).toEqual(['SXXV17']);
    expect(b.combustibleDeCargas).toBe(true);
  });
  it('calcula el margen sobre el costo', () => {
    expect(margenDe(1200, 1000)).toBe(20);
    expect(margenDe(null, 1000)).toBeNull();
  });
  it('para guardar pide la empresa o su nombre', () => {
    const base = { empresaId: null, empresaNombre: '', origenId: 1, destinoId: 2, lineaId: null, vueltaVacia: false, precioUsd: 1000, viajes: 1, observacion: '' };
    expect(cotizarGuardarSchema.safeParse(base).success).toBe(false);
    expect(cotizarGuardarSchema.safeParse({ ...base, empresaNombre: 'Nueva SA' }).success).toBe(true);
  });
});
