import { describe, expect, it } from 'vitest';
import { parsearOrdenes, parsearPlan, parsearZonas, textoFrecuencia, unidadDe } from '@/modules/flota/domain/mantenimiento.types';

describe('migración 215 · mantenimiento de gensets', () => {
  it('las OT del genset traen el equipo y su unidad es la hora', () => {
    const [o] = parsearOrdenes([{ id: 1, equipo: 'genset', equipo_id: 5, patente: 'GS60', km_limite: 1500, km_actual: 1460, estado: 'pendiente' }]);
    expect(o?.equipo).toBe('genset');
    expect(unidadDe(o!.equipo)).toBe('h');
    expect(unidadDe('tractor')).toBe('km');
  });

  it('las tareas del plan van cada tantas horas y las zonas saben si son del genset', () => {
    const [t] = parsearPlan([{ id: 1, nombre: 'Service', aplica: 'genset', cada_dias: 180, cada_horas: 500, aviso_horas: 50, equipos: [] }]);
    expect(t).toMatchObject({ aplica: 'genset', cadaHoras: 500, avisoHoras: 50 });
    expect(textoFrecuencia(t!)).toBe('cada 180 días o cada 500 horas (lo que pase primero)');
    expect(parsearZonas([{ codigo: 'gs_motor', nombre: 'Motor del genset', tractor: false, semi: false, genset: true }])[0]?.genset).toBe(true);
  });
});
