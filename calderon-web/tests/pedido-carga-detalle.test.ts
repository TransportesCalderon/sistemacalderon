import { describe, expect, it } from 'vitest';
import { parsearDatosPedido } from '@/modules/telemetria/domain/seguimiento.types';

describe('migración 221 · pedido de carga con tanques/mochila, cargas del viaje y línea real', () => {
  it('trae el inicial separado, lo cargado por estación y la línea por los tramos', () => {
    const d = parsearDatosPedido({
      inicial_l: 1511, inicial_tanques_l: 830, inicial_mochila_l: 681, cargas_viaje_l: 299,
      cargas_viaje: [{ estacion: 'YPF Km8', litros: 249 }, { estacion: 'Copec SAI', litros: 50 }],
      linea: 'Santiago - Mendoza - Buenos Aires', linea_tramos: true,
    });
    expect(d).toMatchObject({ inicialTanquesL: 830, inicialMochilaL: 681, cargasViajeL: 299, linea: 'Santiago - Mendoza - Buenos Aires', lineaTramos: true });
    expect(d.cargasViaje[1]).toEqual({ estacion: 'Copec SAI', litros: 50 });
    expect(parsearDatosPedido({})).toMatchObject({ cargasViajeL: 0, cargasViaje: [], inicialTanquesL: null, lineaTramos: false });
  });
});
