import { describe, expect, it } from 'vitest';
import { estaAbierta, parsearDetalle } from '@/modules/anomalias/domain/alerta.types';

describe('alertas (migración 49)', () => {
  it('lee el detalle tal como lo arma la base', () => {
    const d = parsearDetalle({
      regla: { codigo: 'DETENIDO_CON_DESCENSO', nombre: 'Descenso detenido', descripcion: null, version: 2, parametros: { litros_min: 20 } },
      historial: [{ estado: 'nueva', anterior: null, en: '2026-10-20T10:00:00Z', usuario: null, justificacion: null }],
      comentarios: [],
      carga: null,
    });
    expect(d.regla.version).toBe(2);
    expect(d.regla.parametros).toEqual({ litros_min: 20 });
    expect(d.historial).toHaveLength(1);
    expect(d.carga).toBeNull();
  });

  it('un detalle vacío no rompe la pantalla', () => {
    expect(parsearDetalle(null).historial).toEqual([]);
  });

  it('abiertas: nueva y en revisión', () => {
    expect(estaAbierta({ estado: 'nueva' })).toBe(true);
    expect(estaAbierta({ estado: 'en_revision' })).toBe(true);
    expect(estaAbierta({ estado: 'descartada' })).toBe(false);
  });
});
