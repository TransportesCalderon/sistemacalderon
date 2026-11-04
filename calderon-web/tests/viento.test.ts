import { describe, expect, it } from 'vitest';
import { claveViaje, parsearViento, parsearVientos, resumenViento } from '@/modules/combustible/domain/viento.types';
import { parsearActa } from '@/modules/combustible/domain/acta.types';
import { parsearComite } from '@/modules/combustible/domain/comite.types';

describe('viento en contra (migración 181)', () => {
  const fila = { camion_id: 4, carga_salida_id: 77, estado: 'ok', contra_kmh: 30, contra_max_kmh: 42, rafaga_max_kmh: 55, minutos_fuerte: 300, pct_extra: 35.6, extra_l: 56.7, fuerte: true };

  it('lee lo que manda la base y arma la clave del viaje', () => {
    const [w] = parsearVientos([fila]);
    expect(w).toMatchObject({ camionId: 4, cargaSalidaId: 77, contraKmh: 30, extraL: 56.7, fuerte: true });
    expect(claveViaje(4, 77)).toBe('4-77');
    expect(parsearVientos(null)).toEqual([]);
  });

  it('el resumen dice si fue en contra o a favor y los litros', () => {
    expect(resumenViento(parsearViento(fila)!)).toBe('30 km/h en contra · ~57 L extra');
    expect(resumenViento(parsearViento({ ...fila, contra_kmh: -20, extra_l: -12.4, fuerte: false })!)).toBe('20 km/h a favor · −12 L menos');
    expect(resumenViento(parsearViento({ estado: 'error', error: 'x' })!)).toContain('se reintenta');
  });

  it('el acta y el comité traen el viento', () => {
    expect(parsearActa({ viento: fila }).viento?.extraL).toBe(56.7);
    expect(parsearActa({}).viento).toBeNull();
    const c = parsearComite({ tractores: [{ equipo_id: 1, nombre: 'AA', viajes_viento: 2, viento_extra_l: 80 }], gensets: [] });
    expect(c.tractores[0]).toMatchObject({ viajesViento: 2, vientoExtraL: 80 });
  });
});
