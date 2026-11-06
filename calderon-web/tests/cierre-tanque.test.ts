import { describe, expect, it } from 'vitest';
import { parsearTanqueCierre } from '@/modules/combustible/domain/cierre-tanque.types';

describe('migración 206 · con cuántos litros salió', () => {
  it('trae salió con, cargó, llegó con y el consumo del libro tal como los calcula la base', () => {
    const t = parsearTanqueCierre({
      disponible: true, capacidad_l: 1000, faltante_salida_l: 169, salio_con_l: 831, cargado_viaje_l: 0,
      entradas_l: 0, salidas_l: 0, llego_con_l: 441, carga_llegada_l: 390, faltante_llegada_l: 169, quedo_con_l: 831, consumo_libro_l: 390, aviso: null,
    });
    expect(t).toMatchObject({ disponible: true, salioConL: 831, llegoConL: 441, consumoLibroL: 390, cargaLlegadaL: 390, aviso: null });
  });

  it('sin capacidad cargada no inventa los litros y trae el aviso', () => {
    const t = parsearTanqueCierre({ disponible: true, faltante_salida_l: 169, salio_con_l: null, aviso: 'El camión no tiene cargada la capacidad' });
    expect(t.salioConL).toBeNull();
    expect(t.aviso).toContain('capacidad');
    expect(parsearTanqueCierre(null).disponible).toBe(false);
  });
});
