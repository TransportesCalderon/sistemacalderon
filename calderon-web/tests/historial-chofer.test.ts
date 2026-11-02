import { describe, expect, it } from 'vitest';
import { parsearMovimientos, parsearTramosDelViaje } from '@/modules/logistica/domain/historial';

describe('Lo que hizo cada chofer (migración 153)', () => {
  it('lee los tramos asignados del viaje', () => {
    const [t] = parsearTramosDelViaje([
      { tramo_id: 5, servicio_id: 9, numero: 6222, cliente: 'ZZ', origen: 'San Antonio', destino: 'Mendoza', desde: '2026-10-20T10:00:00Z',
        tractor: 'ZZ001', mismo_tractor: true, relevo: false, linea_id: 3, linea: 'SAI-MZA', ya_cargado: false },
    ]);
    expect(t).toMatchObject({ tramoId: 5, servicioId: 9, numero: 6222, lineaId: 3, mismoTractor: true, yaCargado: false });
  });
  it('lee el historial (quién llevó qué) y tolera datos vacíos', () => {
    const [m] = parsearMovimientos([{ tramo_id: 1, chofer_id: 2, chofer: 'Ana', con_carga: false, relevo: true, estado: 'cerrado', viaje: 'VC-000001' }]);
    expect(m).toMatchObject({ tramoId: 1, choferId: 2, chofer: 'Ana', conCarga: false, relevo: true, estado: 'cerrado', viaje: 'VC-000001', servicioId: null });
    expect(parsearMovimientos(null)).toEqual([]);
  });
});
