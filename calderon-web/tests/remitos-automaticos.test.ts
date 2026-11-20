import { describe, expect, it } from 'vitest';
import { parsearPendientesRemitos } from '@/modules/combustible/domain/remitos.types';

/** Migración 283 · El remito de la estación manda: registra o corrige solo la carga. */
describe('remitos automáticos', () => {
  it('lee lo que se hizo solo y lo que quedó para revisar', () => {
    const p = parsearPendientesRemitos({
      automatico: true,
      automaticos: [
        { id: 7, numero: 'ZZ-0001', fecha_hora: '2026-11-19T18:00:00Z', patente: 'ZZ001AA', litros: '250.4560', carga_id: 15, orden: 'OC-000047', accion: 'registrada' },
        { id: 8, numero: 'ZZ-0004', carga_id: 16, accion: 'corregida' },
        { numero: 'sin id' },
      ],
      remitos: [
        { id: 9, numero: 'ZZ-0003', situacion: 'orden_sin_registrar', orden: 'OC-000049', motivo_auto: 'Cargó 180,00 L y la orden OC-000049 autorizaba 100 L' },
        { id: 10, situacion: 'difiere', carga_id: 3, motivo_auto: 'Carga 3: el período está cerrado' },
      ],
    });
    expect(p.automatico).toBe(true);
    expect(p.automaticos).toHaveLength(2);
    expect(p.automaticos[0]).toMatchObject({ accion: 'registrada', litros: 250.456, cargaId: 15, orden: 'OC-000047' });
    expect(p.automaticos[1]).toMatchObject({ accion: 'corregida', orden: null, litros: null });
    expect(p.remitos[0]).toMatchObject({ situacion: 'orden_sin_registrar', orden: 'OC-000049' });
    expect(p.remitos[1]).toMatchObject({ situacion: 'difiere', motivoAuto: 'Carga 3: el período está cerrado' });
  });

  it('una base sin la 283 no rompe', () => {
    const p = parsearPendientesRemitos({ remitos: [{ id: 1, situacion: 'falta_registrar' }] });
    expect(p.automatico).toBe(false);
    expect(p.automaticos).toEqual([]);
    expect(p.remitos[0]).toMatchObject({ situacion: 'falta_registrar', orden: null, motivoAuto: null });
  });
});
