import { describe, expect, it } from 'vitest';
import { parsearCargasGenset, parsearTableroGensets, rangoMes } from '@/modules/combustible/domain/genset.types';
import { parsearCostosViaje } from '@/modules/logistica/domain/costos.types';

describe('migración 203 · gensets G2', () => {
  it('cada carga dice a qué viaje y operación fue, o por qué no', () => {
    const [a, b, c] = parsearCargasGenset([
      { id: 3, tipo: 'carga', imputacion: { viaje_id: 9, viaje: 'VC-000009', operacion: '1234', importe_base: 120000, estimado: false } },
      { id: 2, tipo: 'carga', imputacion: { viaje_id: null, motivo: 'El tractor no tenía un viaje abierto en ese momento', estimado: true } },
      { id: 1, tipo: 'descarga', imputacion: null },
    ]);
    expect(a?.imputacion).toMatchObject({ viajeId: 9, viaje: 'VC-000009', operacion: '1234', importeBase: 120000, estimado: false });
    expect(b?.imputacion).toMatchObject({ viajeId: null, motivo: 'El tractor no tenía un viaje abierto en ese momento', estimado: true });
    expect(c?.imputacion).toBeNull();
  });

  it('el costo del viaje trae el combustible del genset y su detalle', () => {
    const c = parsearCostosViaje({
      total: 200,
      genset_litros: 120,
      combustible_genset: 120000,
      combustible_genset_estimado: true,
      genset_detalle: [{ id: 1, fecha_hora: '2026-11-01T10:00:00Z', genset: 'GS86', litros: 120, importe_base: 120000, estimado: true, operacion: '1234' }],
    });
    expect(c).toMatchObject({ gensetLitros: 120, combustibleGenset: 120000, combustibleGensetEstimado: true });
    expect(c.gensetDetalle[0]).toMatchObject({ genset: 'GS86', litros: 120, operacion: '1234' });
    expect(parsearCostosViaje({}).gensetDetalle).toEqual([]);
  });

  it('el tablero trae litros, importe, horas y L/h contra el esperado', () => {
    const t = parsearTableroGensets({
      moneda: 'CLP',
      filas: [
        {
          genset_id: 1, genset: 'GS86', semi: 'PWTT42', cargas: 2, litros_cargados: 220, litros_descargados: 0, litros_base: 0,
          importe: 220000, importe_imputado: 120000, estimado: false, sin_imputar: 1,
          sin_imputar_detalle: [{ id: 5, fecha_hora: '2026-11-01T10:00:00Z', litros: 100, importe_base: 100000, motivo: 'x' }],
          horas: 20, consumo_lh: 3, vueltas: 1, consumo_real_lh: 6, desvio_pct: 100,
        },
      ],
      totales: { cargas: 2, litros_cargados: 220, importe: 220000, importe_imputado: 120000, sin_imputar: 1, horas: 20 },
    });
    expect(t.moneda).toBe('CLP');
    expect(t.filas[0]).toMatchObject({ genset: 'GS86', importeImputado: 120000, horas: 20, consumoRealLh: 6, desvioPct: 100, sinImputar: 1 });
    expect(t.filas[0]?.sinImputarDetalle[0]).toMatchObject({ id: 5, litros: 100 });
    expect(t.totales).toMatchObject({ cargas: 2, importe: 220000, horas: 20 });
  });

  it('el mes elegido va del 1 al último día', () => {
    expect(rangoMes('2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(rangoMes('2028-02')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(rangoMes('2026-11')).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
    expect(rangoMes('')).toEqual({ desde: '', hasta: '' });
  });
});
