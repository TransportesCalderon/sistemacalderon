import { describe, expect, it } from 'vitest';
import { parsearPlan } from '@/modules/flota/domain/mantenimiento.types';

describe('migración 218 · «no aplica a este equipo» en el plan', () => {
  it('la tarea trae los equipos a los que no se aplica, con el motivo', () => {
    const [t] = parsearPlan([
      { id: 3, nombre: 'Rodamientos', aplica: 'tractor', cada_km: 100000, equipos: [], no_aplica: [{ equipo: 'tractor', equipo_id: 29, patente: 'SXXV29', motivo: 'Piezas nuevas' }] },
    ]);
    expect(t?.noAplica).toEqual([{ equipo: 'tractor', equipoId: 29, patente: 'SXXV29', motivo: 'Piezas nuevas' }]);
    expect(parsearPlan([{ id: 1, nombre: 'X', aplica: 'tractor', equipos: [] }])[0]?.noAplica).toEqual([]);
  });
});
