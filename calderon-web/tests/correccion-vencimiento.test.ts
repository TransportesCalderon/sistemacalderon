import { describe, expect, it } from 'vitest';
import { parsearHistorialVencimientos, parsearVencimientos } from '@/modules/flota/domain/vencimientos.types';

describe('migración 204 · corregir fechas de un vencimiento', () => {
  it('la lista trae las correcciones del vigente', () => {
    const v = parsearVencimientos({
      equipos: [
        {
          equipo: 'tractor', id: 1, patente: 'GCSC92',
          items: [
            {
              id: 7, tipo: 'revision_tecnica', vence: '2027-10-01', estado: 'al_dia',
              correcciones: [{ realizado_antes: null, vence_antes: '2026-10-01', realizado: '2026-10-01', vence: '2027-10-01', motivo: 'Se cargó mal el año', usuario: 'Maxi', en: '2026-11-06T12:00:00Z' }],
            },
          ],
        },
      ],
    });
    expect(v.equipos[0]?.items[0]?.correcciones[0]).toMatchObject({ venceAntes: '2026-10-01', vence: '2027-10-01', motivo: 'Se cargó mal el año', usuario: 'Maxi' });
  });

  it('sin correcciones queda una lista vacía (también en el historial)', () => {
    const v = parsearVencimientos({ equipos: [{ equipo: 'semi', id: 2, items: [{ id: 3, vence: '2027-01-01' }] }] });
    expect(v.equipos[0]?.items[0]?.correcciones).toEqual([]);
    expect(parsearHistorialVencimientos([{ id: 3, vence: '2027-01-01' }])[0]?.correcciones).toEqual([]);
  });
});
