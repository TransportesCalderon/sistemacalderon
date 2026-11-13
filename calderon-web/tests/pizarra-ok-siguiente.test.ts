import { describe, expect, it } from 'vitest';
import { ESTADO_INFO, ESTADOS_UNIDAD, VERSION_OK_SIGUIENTE, esEstadoUnidad } from '@/modules/pizarra/domain/pizarra.types';

describe('migración 261 · la Pizarra Azul espera el OK para pasar a la siguiente operación', () => {
  it('conoce el estado «Entregado» (lo calcula la base) y lo muestra con su etiqueta', () => {
    expect(esEstadoUnidad('entregado')).toBe(true);
    expect(ESTADOS_UNIDAD.indexOf('entregado')).toBeGreaterThan(ESTADOS_UNIDAD.indexOf('descargando'));
    expect(ESTADO_INFO.entregado.etiqueta).toBe('Entregado');
    expect(VERSION_OK_SIGUIENTE).toBe(261);
  });
});
