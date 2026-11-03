import { describe, expect, it } from 'vitest';
import { parsearDetalle } from '@/modules/anomalias/domain/alerta.types';

// Migración 175: la alerta de velocidad trae en qué horario pasó y el trayecto.
describe('detalle de la alerta de exceso de velocidad', () => {
  it('lee los tramos con su horario y sus posiciones', () => {
    const d = parsearDetalle({
      regla: { codigo: 'EXCESO_VELOCIDAD', nombre: 'x', version: 1, parametros: {} },
      historial: [],
      comentarios: [],
      velocidad: {
        limite_kmh: 80,
        tramos: [
          {
            desde: '2026-11-02T15:00:00+00:00',
            hasta: '2026-11-02T15:20:00+00:00',
            minutos: 20,
            velocidad_max: 95,
            puntos: [
              [-32.9, -68.8, 90, '2026-11-02T15:00:00+00:00'],
              [-32.95, -68.85, 95, '2026-11-02T15:10:00+00:00'],
              ['x', -68.9, 88, '2026-11-02T15:20:00+00:00'],
            ],
          },
        ],
      },
    });
    expect(d.velocidad?.limiteKmh).toBe(80);
    expect(d.velocidad?.tramos[0]).toMatchObject({ minutos: 20, velocidadMax: 95 });
    expect(d.velocidad?.tramos[0]?.puntos).toHaveLength(2);
    expect(d.velocidad?.tramos[0]?.puntos[1]).toEqual({ lat: -32.95, lng: -68.85, kmh: 95, ts: '2026-11-02T15:10:00+00:00' });
  });
  it('las demás alertas no traen velocidad', () => {
    expect(parsearDetalle({ regla: {}, historial: [], comentarios: [] }).velocidad).toBeNull();
  });
});
