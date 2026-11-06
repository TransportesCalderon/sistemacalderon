import { describe, expect, it } from 'vitest';
import { menuVisible } from '@/modules/core/navigation/filtrar';
import { can, permisosDe } from '@/modules/core/permissions/resolver';
import { parsearAvisosVencimiento, parsearVencimientos, textoDias } from '@/modules/flota/domain/vencimientos.types';

const op = { gerenciaDetalleAlertas: 'agregado' } as const;

describe('migración 198 · Mantenimiento: vencimientos de técnicas y matafuegos', () => {
  it('cargan Operaciones, Telemetría y Mantenimiento; anulan el Jefe y TI; Gerencia y Telemetría ven', () => {
    const jefe = permisosDe(['mantenimiento_jefe'], op);
    const mec = permisosDe(['mecanico'], op);
    expect(can(jefe, 'mantenimiento.vencimientos:transicionar')).toBe(true);
    expect(can(mec, 'mantenimiento.vencimientos:editar')).toBe(true);
    expect(can(mec, 'mantenimiento.vencimientos:transicionar')).toBe(false);
    expect(can(permisosDe(['operaciones'], op), 'mantenimiento.vencimientos:editar')).toBe(true);
    expect(can(permisosDe(['gerencia'], op), 'mantenimiento.vencimientos:ver')).toBe(true);
    expect(can(permisosDe(['gerencia'], op), 'mantenimiento.vencimientos:editar')).toBe(false);
    expect(can(permisosDe(['analista_control'], op), 'mantenimiento.vencimientos:editar')).toBe(true); // migración 201: Telemetría también carga
    // Mantenimiento no ve finanzas ni combustible
    expect(can(mec, 'finanzas.resumen:ver')).toBe(false);
    expect(can(mec, 'combustible.cargas:ver')).toBe(false);
    expect(can(mec, 'flota.camiones:ver')).toBe(true);
  });

  it('el menú Mantenimiento › Vencimientos le aparece al mecánico', () => {
    const g = menuVisible(permisosDe(['mecanico'], op)).find((x) => x.id === 'mantenimiento');
    expect(g?.entradas.map((e) => e.href)).toContain('/ajustes/flota?vista=vencimientos');
  });

  it('la base decide estado y zona; la web solo convierte', () => {
    const v = parsearVencimientos({
      hoy: '2026-11-06',
      tipos: [{ codigo: 'matafuego', nombre: 'Matafuego', aplica_tractor: true, aplica_semi: true, pide_detalle: true, dias_aviso: 30 }],
      equipos: [{ equipo: 'semi', id: 3, patente: 'PWTT42', en_zona: true, peor: 'vencido', items: [{ id: 9, tipo: 'matafuego', estado: 'vencido', vence: '2026-11-03', dias: -3, detalle: 'Cabina' }] }],
    });
    expect(v.tipos[0]?.pideDetalle).toBe(true);
    expect(v.equipos[0]).toMatchObject({ equipo: 'semi', enZona: true, peor: 'vencido' });
    expect(v.equipos[0]?.items[0]).toMatchObject({ estado: 'vencido', dias: -3, detalle: 'Cabina' });
    const [a] = parsearAvisosVencimiento([{ id: 1, tipo: 'Revisión técnica', equipo: 'tractor', patente: 'GCSC92', vence: '2026-11-26', dias: 20, estado: 'por_vencer', en_zona: true }]);
    expect(a).toMatchObject({ estado: 'por_vencer', enZona: true, dias: 20 });
    expect(textoDias(20)).toBe('vence en 20 días');
    expect(textoDias(-3)).toBe('venció hace 3 días');
  });
});
