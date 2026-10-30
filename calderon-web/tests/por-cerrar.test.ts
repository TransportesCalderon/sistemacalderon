import { describe, expect, it } from 'vitest';
import { parsearPorCerrar } from '@/modules/logistica/repositories/por-cerrar.repository';
import { pantallaDeRuta } from '@/modules/core/navigation/rutas';

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
  it('migración 133: viajes sin viaje de chofer, horas desde la llegada y vencidos', () => {
    const [v] = parsearPorCerrar([
      { viaje_id: null, sin_viaje_chofer: true, camion_id: 3, carga_salida_id: 33, etapa: 'faltan_datos', faltan: ['Falta armar el cierre'], horas: 48.5, vencido: true, plazo_horas: 24 },
    ]);
    expect(v?.viajeId).toBeNull();
    expect(v?.sinViajeChofer).toBe(true);
    expect(v?.cargaSalidaId).toBe(33);
    expect(v?.vencido).toBe(true);
    expect(v?.horas).toBe(48.5);
    expect(v?.plazoHoras).toBe(24);
  });
  it('la ruta queda protegida', () => {
    expect(pantallaDeRuta('/operacion/por-cerrar')).toBe('operacion.tramos');
  });
});
