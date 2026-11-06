import { describe, expect, it } from 'vitest';
import { can, permisosDe } from '@/modules/core/permissions/resolver';

const opciones = { gerenciaDetalleAlertas: 'agregado' as const };

describe('06/11/2026 · Telemetría edita el chofer fijo de los tractores', () => {
  it('Analista de control (Telemetría) puede editar; Gerencia sigue solo viendo', () => {
    expect(can(permisosDe(['analista_control'], opciones), 'flota.asignaciones:editar')).toBe(true);
    expect(can(permisosDe(['operaciones'], opciones), 'flota.asignaciones:editar')).toBe(true);
    expect(can(permisosDe(['gerencia'], opciones), 'flota.asignaciones:editar')).toBe(false);
  });
});
