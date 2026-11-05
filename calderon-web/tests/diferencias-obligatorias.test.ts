import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsearDecision, parsearDiferenciasChoferes, periodoAcumulado } from '@/modules/combustible/domain/decision.types';

describe('diferencias obligatorias (migración 185)', () => {
  it('lee la decisión y el pedido de quitar el descuento', () => {
    const d = parsearDecision({
      decision: 'justificar', motivo: 'ralentí en aduana', evidencia: 'foto', por: 'Ana', a_descontar_l: 0, descuento_quitado_l: 50,
      pedido: { id: 7, estado: 'aprobada', litros: 50, motivo: 'm', evidencia: 'e', puedo_resolver: false, es_mio: true },
    });
    expect(d).toMatchObject({ decision: 'justificar', aDescontarL: 0, descuentoQuitadoL: 50, pedido: { id: 7, estado: 'aprobada', esMio: true } });
    expect(parsearDecision({}).pedido).toBeNull();
    expect(parsearDecision({ decision: 'otra' }).decision).toBeNull();
  });

  it('lee el acumulado por chofer (ranking)', () => {
    const r = parsearDiferenciasChoferes({
      total: { viajes: 3, viajes_faltante: 2, litros_faltante: 80, litros_descontados: 50 },
      choferes: [{ puesto: 1, chofer_id: 4, chofer: 'Ana', viajes: 3, viajes_faltante: 2, pct_viajes_faltante: 67, litros_faltante: 80, promedio_por_viaje: 26.7, pct_descontado: 63, pct_justificado: 38 }],
    });
    expect(r.total.litrosFaltante).toBe(80);
    expect(r.choferes[0]).toMatchObject({ puesto: 1, chofer: 'Ana', promedioPorViaje: 26.7, pctViajesFaltante: 67, pctDescontado: 63, pctJustificado: 38 });
    expect(r.total.litrosJustificados).toBe(30);
  });

  it('el período es el mes o los 3 meses que terminan en ese mes', () => {
    expect(periodoAcumulado('2026-11', false)).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
    expect(periodoAcumulado('2026-02', true)).toEqual({ desde: '2025-12-01', hasta: '2026-02-28' });
  });

  it('la ficha del cierre muestra la decisión y no reimplementa las reglas', () => {
    const c = readFileSync('src/modules/combustible/components/cierres/decision-diferencia.tsx', 'utf8');
    expect(c).toContain('ErrorBase');
    expect(c).not.toMatch(/length\s*<\s*10/); // el mínimo del motivo lo controla la base
  });
});
