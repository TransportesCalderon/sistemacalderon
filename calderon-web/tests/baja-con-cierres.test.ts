import { describe, expect, it } from 'vitest';
import { parsearPendientesChofer } from '@/modules/flota/domain/chofer.types';
import { parsearLiquidacion } from '@/modules/liquidacion/domain/liquidacion.types';

describe('Migración 363 · baja con cierres pendientes; la transferencia espera a los cierres', () => {
  it('un viaje de chofer abierto no frena la baja y queda como cierre pendiente', () => {
    const p = parsearPendientesChofer({
      hay: true,
      texto: 'viaje de chofer abierto VC-000045 (Viajes › Viajes de chofer)',
      viajes_chofer: 'VC-000045',
      frena_baja: false,
      texto_baja: null,
      cierres: { hay: true, viajes_abiertos: 1, sin_cierre: 0, texto: 'el viaje de chofer VC-000045 sin cerrar (Viajes › Viajes de chofer)' },
    });
    expect(p.frenaBaja).toBe(false);
    expect(p.textoBaja).toBeNull();
    expect(p.cierres).toBe('el viaje de chofer VC-000045 sin cerrar (Viajes › Viajes de chofer)');
  });

  it('lo que sigue en las operaciones frena la baja', () => {
    const p = parsearPendientesChofer({
      hay: true,
      texto: 'sigue asignado a AB123CD (titular) (se cambia en Flota › Choferes de los tractores)',
      frena_baja: true,
      texto_baja: 'sigue asignado a AB123CD (titular) (se cambia en Flota › Choferes de los tractores)',
      cierres: { hay: false, viajes_abiertos: 0, sin_cierre: 0, texto: null },
    });
    expect(p.frenaBaja).toBe(true);
    expect(p.textoBaja).toContain('AB123CD');
    expect(p.cierres).toBeNull();
  });

  it('la liquidación trae por qué no se puede transferir', () => {
    const texto = 'No se le puede transferir a Pérez, Juan hasta que se hagan sus cierres: está de baja desde el 10/11/2026 y tiene el viaje de chofer VC-000045 sin cerrar (Viajes › Viajes de chofer).';
    expect(parsearLiquidacion({ id: 1, estado: 'aprobada', baja_chofer: '2026-11-10', pago_frenado: texto }).pagoFrenado).toBe(texto);
    expect(parsearLiquidacion({ id: 2, estado: 'aprobada' }).pagoFrenado).toBeNull();
  });
});
