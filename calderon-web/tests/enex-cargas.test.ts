import { describe, expect, it } from 'vitest';
import { parsearPendientesEnex } from '@/modules/combustible/domain/enex.types';

describe('Shell 02 · cargas de Shell Card (Enex) por resolver', () => {
  it('lee lo que devuelve la base', () => {
    const p = parsearPendientesEnex({
      puede_resolver: true,
      ultima_consulta: { cuando: '2026-11-16T19:20:00+00:00', ok: true, mensaje: null },
      estaciones: [{ id: 8, nombre: 'ZZ Estación' }],
      cargas: [
        { id: 7, fecha_hora: '2026-11-15T13:01:00+00:00', patente: 'ZZ0001', es_tractor: true, litros: 498.5, precio_clp: 1500, monto_clp: 748000, situacion: 'difiere', carga_id: 2, diferencia: 'litros: registrado 500.0, Enex 498.5' },
        { id: 8, fecha_hora: '2026-11-15T21:30:00+00:00', patente: 'ZZ0001', es_tractor: true, litros: '300.000', precio_clp: null, situacion: 'falta_registrar', estacion_id: 8 },
        { fecha_hora: 'sin id' },
      ],
    });
    expect(p.puedeResolver).toBe(true);
    expect(p.ultimaConsulta?.ok).toBe(true);
    expect(p.cargas.length).toBe(2);
    expect(p.cargas[0]?.situacion).toBe('difiere');
    expect(p.cargas[0]?.cargaId).toBe(2);
    expect(p.cargas[1]?.litros).toBe(300);
    expect(p.cargas[1]?.precioClp).toBeNull();
    expect(p.cargas[1]?.estacionId).toBe(8);
  });

  it('si la base no devuelve nada, no hay nada por resolver', () => {
    const p = parsearPendientesEnex(null);
    expect(p.cargas).toEqual([]);
    expect(p.puedeResolver).toBe(false);
    expect(p.ultimaConsulta).toBeNull();
  });
});
