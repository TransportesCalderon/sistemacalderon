import { describe, expect, it } from 'vitest';
import { menuVisible } from '@/modules/core/navigation/filtrar';
import { can, permisosDe } from '@/modules/core/permissions/resolver';
import { parsearOrdenes, parsearPlan, textoFrecuencia } from '@/modules/flota/domain/mantenimiento.types';

const op = { gerenciaDetalleAlertas: 'agregado' } as const;

describe('migración 199 · Mantenimiento: plan y órdenes de trabajo', () => {
  it('piden OT Gerencia, Operaciones y Telemetría; las trabaja Mantenimiento; verifica el Jefe; el plan lo arma el Jefe', () => {
    const jefe = permisosDe(['mantenimiento_jefe'], op);
    const mec = permisosDe(['mecanico'], op);
    expect(can(permisosDe(['gerencia'], op), 'mantenimiento.ordenes:editar')).toBe(true);
    expect(can(permisosDe(['operaciones'], op), 'mantenimiento.ordenes:editar')).toBe(true);
    expect(can(permisosDe(['analista_control'], op), 'mantenimiento.ordenes:editar')).toBe(true);
    expect(can(mec, 'mantenimiento.ordenes:editar')).toBe(true);
    expect(can(mec, 'mantenimiento.ordenes:transicionar')).toBe(false);
    expect(can(jefe, 'mantenimiento.ordenes:transicionar')).toBe(true);
    expect(can(jefe, 'mantenimiento.plan:editar')).toBe(true);
    expect(can(mec, 'mantenimiento.plan:editar')).toBe(false);
    expect(can(permisosDe(['finanzas'], op), 'mantenimiento.ordenes:editar')).toBe(false);
  });

  it('el menú Mantenimiento tiene órdenes, plan y vencimientos', () => {
    const g = menuVisible(permisosDe(['mecanico'], op)).find((x) => x.id === 'mantenimiento');
    expect(g?.entradas.map((e) => e.etiqueta)).toEqual(['Órdenes de trabajo', 'Plan de mantenimiento', 'Vencimientos', 'Stock de insumos']);
  });

  it('la web solo convierte lo que manda la base', () => {
    const [o] = parsearOrdenes([
      { id: 4, numero: 'OT-00004', origen: 'puntual', equipo: 'tractor', equipo_id: 1, patente: 'GCSC92', titulo: 'Ruido en frenos', zonas: ['frenos', 'eje_2'],
        prioridad: 'urgente', estado: 'en_curso', atrasada: true, mia: true, mensaje: '*Orden de trabajo OT-00004*', notas: [{ texto: 'Empezada', por: 'ZZ', en: '2026-11-06T12:00:00Z' }] },
    ]);
    expect(o).toMatchObject({ estado: 'en_curso', prioridad: 'urgente', atrasada: true, mia: true, zonas: ['frenos', 'eje_2'] });
    expect(o?.notas).toHaveLength(1);
    const [t] = parsearPlan([{ id: 1, nombre: 'Cambio de aceite', aplica: 'tractor', cada_km: 30000, cada_dias: 180, equipos: [{ equipo: 'tractor', equipo_id: 1, patente: 'GCSC92', estado: 'proxima', base_origen: 'ot' }] }]);
    expect(t?.equipos[0]).toMatchObject({ estado: 'proxima', baseOrigen: 'ot' });
    expect(textoFrecuencia({ cadaDias: 180, cadaKm: 30000 })).toBe('cada 180 días o cada 30.000 km (lo que pase primero)');
  });
});
