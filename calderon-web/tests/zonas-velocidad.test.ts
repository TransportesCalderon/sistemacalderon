import { describe, expect, it } from 'vitest';
import { guardarZonaSchema, parsearZonas } from '@/modules/telemetria/domain/zona-velocidad';

describe('migración 307: velocidades por tramo de montaña', () => {
  it('lee los tramos de la base', () => {
    const [z] = parsearZonas([
      { id: 5, nombre: 'Zona Caracoles', sentido: 'ida', velocidad_max: 20, puntos: [{ lat: -32.856, lng: -70.148 }, { lat: -32.869, lng: -70.156 }],
        ancho_m: 150, km: 3.4, armado_con: 'mapa', estado: 'a_verificar', orden: 8, excesos_30d: 2 },
    ]);
    expect(z?.sentido).toBe('ida');
    expect(z?.puntos).toHaveLength(2);
    expect(z?.estado).toBe('a_verificar');
    expect(z?.excesos30d).toBe(2);
  });
  it('pide al menos un punto y una velocidad razonable', () => {
    const base = { id: null, nombre: 'Bajada Polvaredas', sentido: 'vuelta' as const, velocidadMax: 30, anchoM: 120, orden: 7, observacion: '', puntos: [] };
    expect(guardarZonaSchema.safeParse(base).success).toBe(false);
    expect(guardarZonaSchema.safeParse({ ...base, puntos: [{ lat: -32.85, lng: -69.76 }] }).success).toBe(true);
    expect(guardarZonaSchema.safeParse({ ...base, velocidadMax: 300, puntos: [{ lat: -32.85, lng: -69.76 }] }).success).toBe(false);
  });
});
