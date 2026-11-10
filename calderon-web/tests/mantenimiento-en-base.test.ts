import { describe, expect, it } from 'vitest';
import { parsearAvisosOt, parsearOrdenes } from '@/modules/flota/domain/mantenimiento.types';

describe('migración 225 · aviso urgente cuando el equipo está en la base', () => {
  it('lee el aviso «en la base» con la cantidad de órdenes, el lugar y desde cuándo', () => {
    const [a] = parsearAvisosOt([
      { id: 7, numero: 'OT-7', tipo: 'en_base', patente: 'ZZ001TT', equipo: 'tractor', titulo: 'Vejigas', prioridad: 'alta', asignada: false,
        cantidad: 2, en_base_desde: '2026-11-10T12:00:00Z', lugar: 'Base Mendoza', mensaje: '*EN LA BASE AHORA*' },
    ]);
    expect(a).toMatchObject({ tipo: 'en_base', cantidad: 2, lugar: 'Base Mendoza', enBaseDesde: '2026-11-10T12:00:00Z', prioridad: 'alta' });
    expect(parsearAvisosOt([{ id: 1, tipo: 'nueva' }])[0]).toMatchObject({ tipo: 'nueva', cantidad: 1, enBaseDesde: null, lugar: null });
  });

  it('la orden de trabajo trae si el equipo está en la base', () => {
    const [o, p] = parsearOrdenes([
      { id: 1, estado: 'pendiente', en_base_desde: '2026-11-10T12:00:00Z', en_base_lugar: 'Base Mendoza' },
      { id: 2, estado: 'pendiente' },
    ]);
    expect(o).toMatchObject({ enBaseDesde: '2026-11-10T12:00:00Z', enBaseLugar: 'Base Mendoza' });
    expect(p).toMatchObject({ enBaseDesde: null, enBaseLugar: null });
  });
});
