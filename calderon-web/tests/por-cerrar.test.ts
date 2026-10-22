import { describe, expect, it } from 'vitest';
import { parsearPorCerrar } from '@/modules/logistica/repositories/por-cerrar.repository';
import { pantallaDeRuta } from '@/modules/core/navigation/navigation';

describe('cierres por hacer (migración 63)', () => {
  it('lee la etapa y lo que falta tal como lo arma la base', () => {
    const [v] = parsearPorCerrar([
      { viaje_id: 5, numero: 'VC-000005', etapa: 'faltan_datos', faltan: ['Agregá las operaciones'], operaciones_para_agregar: 2, a_descontar_l: '12.5', camion_id: 3 },
    ]);
    expect(v?.etapa).toBe('faltan_datos');
    expect(v?.faltan).toEqual(['Agregá las operaciones']);
    expect(v?.operacionesParaAgregar).toBe(2);
    expect(v?.aDescontarL).toBe(12.5);
  });
  it('la ruta queda protegida', () => {
    expect(pantallaDeRuta('/operacion/por-cerrar')).toBe('operacion.tramos');
  });
});
