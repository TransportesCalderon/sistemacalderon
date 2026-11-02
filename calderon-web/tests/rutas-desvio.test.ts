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

describe('varias rutas por operación (migración 158)', () => {
  it('lee las rutas en orden con su estado', async () => {
    const { parsearRutasTramo } = await import('@/modules/logistica/repositories/rutas.repository');
    const puntos = [{ nombre: 'A', lat: -33, lng: -70 }, { nombre: 'B', lat: -32, lng: -69 }];
    const [a, b] = parsearRutasTramo([
      { id: 1, orden: 1, puntos, version: 1, estado: 'hecha', llegada_en: '2026-11-02T10:00:00Z', llegada_por: 'gps' },
      { id: 2, orden: 2, puntos, version: 1, estado: 'en_curso' },
    ]);
    expect(a).toMatchObject({ orden: 1, estado: 'hecha', llegadaPor: 'gps' });
    expect(b).toMatchObject({ orden: 2, estado: 'en_curso', llegadaEn: null });
  });

  it('la lista distingue «ruta k de n» y «terminó todas»; sin datos nuevos, una sola ruta', () => {
    const [x, y, z] = parsearOperacionesRuta([
      { servicio_id: 1, ruta: { total: 3, hechas: 1, orden: 2, puntos: 2 } },
      { servicio_id: 2, ruta: { total: 2, hechas: 2, orden: null } },
      { servicio_id: 3, ruta: { puntos: 4 } },
    ]);
    expect(x?.ruta).toMatchObject({ total: 3, hechas: 1, orden: 2 });
    expect(y?.ruta?.orden).toBeNull();
    expect(z?.ruta).toMatchObject({ total: 1, orden: 1 });
  });
});
