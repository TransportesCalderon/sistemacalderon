import { describe, expect, it } from 'vitest';
import { parsearGastosPorRevisar } from '@/modules/chofer/domain/chofer.types';

/** Migración 276 · Comprobantes sin número (estacionamiento): Iris controla patente + fecha. */
describe('comprobante sin número', () => {
  it('lee la verificación por patente y la patente del comprobante', () => {
    const [g] = parsearGastosPorRevisar([
      { id: 1, numero: 'FF-000001', chofer_id: 2, chofer: 'ZZ', fecha: '2026-11-03', moneda: 'CLP', importe: 6000, categoria: 'Otros',
        verificacion: 'ia_patente', patente_comprobante: 'GCSC96', tractor: 'GCSC-96' },
    ]);
    expect(g!.verificacion).toBe('ia_patente');
    expect(g!.patenteComprobante).toBe('GCSC96');
  });
  it('sin patente queda null', () => {
    const [g] = parsearGastosPorRevisar([{ id: 1, verificacion: 'ia_sin_numero' }]);
    expect(g!.patenteComprobante).toBeNull();
  });
});
