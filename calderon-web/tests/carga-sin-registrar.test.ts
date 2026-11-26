import { describe, expect, it } from 'vitest';
import { ETIQUETA_DATO } from '@/modules/anomalias/domain/alerta.types';

/** Cambio 362 · Alerta «Falta registrar una carga»: el sensor del principal marca más de lo que calcula el sistema. */
describe('alerta «Falta registrar una carga»', () => {
  it('cada dato de la evidencia y cada umbral de la regla tiene su nombre', () => {
    const claves = [
      'sensor_l',
      'sensor_pct',
      'sensor_ts',
      'capacidad_sensor_l',
      'sistema_l',
      'sistema',
      'diferencia_l',
      'umbral_l',
      'ultimo_lleno_ts',
      'consumido_l',
      'cargado_despues_l',
      'pendiente',
      'que_hacer',
      'litros_min',
      'pct_min',
      'sensor_min',
      'lecturas_min',
      'lectura_max_h',
      'avisar',
    ];
    for (const k of claves) expect(ETIQUETA_DATO[k], k).toBeTruthy();
  });

  it('las horas se reconocen por el final «_ts»', () => {
    expect(['sensor_ts', 'ultimo_lleno_ts'].every((k) => k.endsWith('_ts'))).toBe(true);
  });
});
