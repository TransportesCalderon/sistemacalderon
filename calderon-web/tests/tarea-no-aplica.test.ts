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

describe('migración 220 · plan «sin registro»', () => {
  it('sin registro, la última vez y la próxima quedan vacías', () => {
    const [t] = parsearPlan([
      {
        id: 1, nombre: 'Revisión mensual', aplica: 'tractor', cada_dias: 30, equipos: [
          { equipo: 'tractor', equipo_id: 2, patente: 'SXXV29', base_fecha: null, base_km: null, base_origen: 'sin_registro', proxima_fecha: null, estado: 'sin_registro' },
        ],
      },
    ]);
    expect(t?.equipos[0]).toMatchObject({ estado: 'sin_registro', baseOrigen: 'sin_registro', baseFecha: null, proximaFecha: null });
  });
});
