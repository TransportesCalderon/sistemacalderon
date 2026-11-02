import { describe, expect, it } from 'vitest';
import { parsearAvisosDesvio, parsearOperacionesRuta } from '@/modules/logistica/domain/rutas';

describe('rutas para choferes y desvíos (migración 156)', () => {
  it('lee las operaciones con y sin ruta', () => {
    const [a, b] = parsearOperacionesRuta([
      { servicio_id: 1, numero_operacion: 10, cliente: 'ZZ', origen: 'A', destino: 'B', estado: 'en_curso', ruta: { puntos: 3, partida: 'A', destino: 'B' }, desvio: { km: 12.5, minutos: 20, alerta: true } },
      { servicio_id: 2, numero_operacion: 11, cliente: 'ZZ', origen: 'A', destino: 'C', estado: 'planificado', ruta: null, desvio: null },
    ]);
    expect(a?.ruta?.puntos).toBe(3);
    expect(a?.desvio).toEqual({ km: 12.5, minutos: 20, alerta: true });
    expect(b?.ruta).toBeNull();
    expect(b?.desvio).toBeNull();
  });

  it('lee los avisos de desvío', () => {
    const [a] = parsearAvisosDesvio([{ id: 5, servicio_id: 1, numero_operacion: 10, tractor: 'ZZ001', minutos: 17, km: 11.2, km_max: 14, latitud: -33.5, longitud: -69.7 }]);
    expect(a).toMatchObject({ id: 5, tractor: 'ZZ001', minutos: 17, km: 11.2, kmMax: 14, lat: -33.5, lng: -69.7, chofer: null });
    expect(parsearAvisosDesvio(null)).toEqual([]);
  });
});
