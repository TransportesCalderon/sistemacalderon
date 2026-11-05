import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { haceCuanto, parsearDetalleEstacion, parsearPatronesEstaciones } from '@/modules/combustible/domain/estaciones.types';

describe('Fase 3 · patrones por estación (migración 191)', () => {
  it('con pocas cargas no hay indicadores ni lugar en el ranking; con suficientes, índice y tendencia', () => {
    const p = parsearPatronesEstaciones({
      dias: 90,
      min_cargas: 20,
      estaciones: [
        { estacion_id: 1, estacion: 'A', cargas: 40, litros: 20000, suficiente: true, posicion: 1, faltante_asociado_l: 36, indice: 1.8, tendencia: { sentido: 'empeora', cambio_pct: 35 } },
        { estacion_id: 2, estacion: 'B', cargas: 5, litros: 2000, suficiente: false },
      ],
    });
    expect(p.estaciones[0]).toMatchObject({ suficiente: true, indice: 1.8, tendencia: { sentido: 'empeora', cambioPct: 35 } });
    expect(p.estaciones[1]).toMatchObject({ suficiente: false, posicion: null, indice: null, tendencia: null });
  });

  it('el detalle separa incidentes de combustible y operativos', () => {
    const [c] = parsearDetalleEstacion([
      {
        carga_id: 3,
        litros: 200,
        combustible: [{ tipo: 'carga_imposible', alerta_id: 9 }],
        operativos: [{ tipo: 'viaje_con_faltante', parte_pct: 25, asociado_l: 12.5, decision: 'justificar' }],
      },
    ]);
    expect(c?.combustible[0]?.tipo).toBe('carga_imposible');
    expect(c?.operativos[0]).toMatchObject({ partePct: 25, asociadoL: 12.5, decision: 'justificar' });
  });

  it('«hace cuánto» para última carga y último incidente', () => {
    const ahora = Date.parse('2026-11-05T12:00:00Z');
    expect(haceCuanto('2026-10-30T12:00:00Z', ahora)).toBe('Hace 6 días');
    expect(haceCuanto(null, ahora)).toBe('—');
  });

  it('habla de litros asociados y no clasifica estaciones', () => {
    const ui = readFileSync('src/modules/combustible/components/consumo/patrones-estaciones.tsx', 'utf8');
    expect(ui).toContain('asociados');
    expect(ui.toLowerCase()).not.toContain('sospechosa');
  });
});
