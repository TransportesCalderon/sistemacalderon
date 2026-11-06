import { describe, expect, it } from 'vitest';
import { parsearCargasGenset, parsearContextoGenset } from '@/modules/combustible/domain/genset.types';
import { ETIQUETA_TIPO_MOVIMIENTO_BASE } from '@/modules/combustible/domain/base.types';

describe('migración 202 · gensets G1', () => {
  it('la lista trae el origen de cada carga (estación o surtidor de la base) y si la vuelta se cerró', () => {
    const [a, b] = parsearCargasGenset([
      { id: 2, tipo: 'carga', genset_id: 1, genset: 'GS86', semi: 'PWTT42', origen: 'estacion', litros: 120, horometro_h: 1040, importe: 120000, cierre: null },
      { id: 1, tipo: 'carga', genset_id: 1, genset: 'GS86', semi: 'PWTT42', origen: 'tanque_base', litros: 150, horometro_h: 1000, cierre: 'CG-000003' },
    ]);
    expect(a).toMatchObject({ origen: 'estacion', importe: 120000, cierre: null });
    expect(b).toMatchObject({ origen: 'tanque_base', cierre: 'CG-000003' });
  });

  it('el contexto completa tractor y chofer; el libro del tanque nombra la carga al genset', () => {
    expect(parsearContextoGenset({ semi: 'PWTT42', camion_id: 5, tractor: 'SXXV11', chofer_id: 9, chofer: 'Argomedo, Kevin' })).toMatchObject({ camionId: 5, choferId: 9 });
    expect(ETIQUETA_TIPO_MOVIMIENTO_BASE.salida_genset).toBe('Carga a genset');
  });
});
